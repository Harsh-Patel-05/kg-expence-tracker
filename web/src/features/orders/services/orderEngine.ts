import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { isoDate } from "@/lib/utils";
import type {
  KitchenStatus,
  NotificationDoc,
  OrderDoc,
  OrderStatus,
  PosRole
} from "@/features/pos/types";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import {
  canTransition,
  canKitchenTransition,
  expectedPrepMinutes,
  mapOrderToKitchenStatus
} from "../engine/statusMachine";
import { printKitchenTicket } from "@/features/pos/utils/printReceipt";

function actorId() {
  return auth.currentUser?.uid ?? null;
}

function nowIso() {
  return new Date().toISOString();
}

export async function pushNotification(input: Omit<NotificationDoc, "createdAt" | "updatedAt" | "createdBy" | "updatedBy">) {
  // soft dedupe: same dedupeKey unread within recent window is skipped by caller; store key for queries
  const ref = doc(collection(db, "notifications"));
  const priority = input.priority || (input.kind === "low_stock" || input.kind === "security" ? "high" : "medium");
  const readStatus = input.readStatus || (input.read ? "read" : "unread");
  const payload = {
    ...input,
    read: input.read ?? false,
    readStatus,
    priority,
    pinned: input.pinned ?? false,
    channels: input.channels || ["in_app"],
    syncStatus: input.syncStatus || "synced",
    ...auditCreate({ status: readStatus })
  };
  await setDoc(ref, payload);

  // history mirror for notification center analytics
  await setDoc(doc(collection(db, "notificationHistory")), {
    notificationId: ref.id,
    title: input.title,
    kind: input.kind,
    priority,
    action: "created",
    ...auditCreate({ status: "sent" })
  });

  return ref.id;
}

export async function appendStatusHistory(args: {
  orderId: string;
  fromStatus?: string | null;
  toStatus: string;
  note?: string;
  actorRole?: string | null;
}) {
  const ref = doc(collection(db, "statusHistory"));
  await setDoc(ref, {
    orderId: args.orderId,
    fromStatus: args.fromStatus ?? null,
    toStatus: args.toStatus,
    note: args.note || "",
    actorId: actorId(),
    actorRole: args.actorRole ?? null,
    syncStatus: "synced",
    ...auditCreate({ status: "recorded" })
  });
  return ref.id;
}

export async function updateOrderStatus(args: {
  orderId: string;
  toStatus: OrderStatus;
  note?: string;
  role?: PosRole;
  force?: boolean;
}) {
  const ref = doc(db, "orders", args.orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found");
  const order = snap.data() as OrderDoc;
  if (order.isDeleted) throw new Error("Order is deleted");

  const from = String(order.status || "pending") as OrderStatus;
  if (!args.force && !canTransition(from, args.toStatus)) {
    throw new Error(`Invalid status change: ${from} → ${args.toStatus}`);
  }

  const kitchenStatus = mapOrderToKitchenStatus(args.toStatus);
  const history = [
    ...(order.statusHistory || []),
    { status: args.toStatus, at: nowIso(), by: actorId(), note: args.note }
  ].slice(-40);

  const timestamps: Record<string, string> = {};
  if (args.toStatus === "accepted") timestamps.acceptedAt = nowIso();
  if (args.toStatus === "preparing") timestamps.preparingAt = nowIso();
  if (args.toStatus === "cooking") timestamps.cookingAt = nowIso();
  if (args.toStatus === "ready") timestamps.readyAt = nowIso();
  if (args.toStatus === "served" || args.toStatus === "delivered") timestamps.servedAt = nowIso();
  if (args.toStatus === "completed") timestamps.completedAt = nowIso();

  const itemCount = (order.items || []).reduce((s, l) => s + (l.qty || 0), 0);
  const eta = expectedPrepMinutes(order.orderType, itemCount);
  const expectedReadyAt =
    order.expectedReadyAt ||
    new Date(Date.now() + eta * 60_000).toISOString();

  const delayed =
    ["preparing", "cooking", "accepted", "pending", "confirmed"].includes(args.toStatus) &&
    Date.now() > new Date(expectedReadyAt).getTime();

  const batch = writeBatch(db);
  batch.set(
    ref,
    {
      status: args.toStatus,
      kitchenStatus,
      delayed,
      expectedReadyAt,
      statusHistory: history,
      syncStatus: "synced",
      held: args.toStatus === "held",
      ...timestamps,
      ...auditUpdate()
    },
    { merge: true }
  );

  const histRef = doc(collection(db, "statusHistory"));
  batch.set(histRef, {
    orderId: args.orderId,
    fromStatus: from,
    toStatus: args.toStatus,
    note: args.note || "",
    actorId: actorId(),
    actorRole: args.role ?? null,
    syncStatus: "synced",
    ...auditCreate({ status: "recorded" })
  });

  await batch.commit();

  await logActivity({
    action: "status_changed",
    entityType: "orders",
    entityId: args.orderId,
    message: `${from} → ${args.toStatus}`,
    actorRole: args.role,
    meta: { note: args.note }
  });

  if (args.toStatus === "ready") {
    await pushNotification({
      title: "Order ready",
      body: `${order.invoiceNo || args.orderId.slice(0, 6)} is ready`,
      kind: "ready",
      orderId: args.orderId,
      roleTargets: ["cashier", "captain", "delivery", "manager"],
      status: "unread",
      isDeleted: false,
      syncStatus: "synced"
    });
  }
  if (args.toStatus === "cancelled" || args.toStatus === "rejected") {
    await pushNotification({
      title: "Order cancelled",
      body: args.note || `${order.invoiceNo || args.orderId} cancelled`,
      kind: "cancelled",
      orderId: args.orderId,
      roleTargets: ["manager", "cashier", "kitchen"],
      status: "unread",
      isDeleted: false,
      syncStatus: "synced"
    });
  }
  if (delayed) {
    await pushNotification({
      title: "Delayed order",
      body: `${order.invoiceNo || args.orderId.slice(0, 6)} exceeded prep ETA`,
      kind: "delayed",
      orderId: args.orderId,
      roleTargets: ["manager", "kitchen", "captain"],
      status: "unread",
      isDeleted: false,
      syncStatus: "synced"
    });
  }

  // Release table when completed/cancelled for dine-in
  if (
    order.tableId &&
    (args.toStatus === "completed" || args.toStatus === "cancelled" || args.toStatus === "rejected")
  ) {
    await setDoc(
      doc(db, "tables", order.tableId),
      { status: "cleaning", currentOrderId: null, ...auditUpdate() },
      { merge: true }
    );
  }

  return { orderId: args.orderId, from, to: args.toStatus };
}

export async function updateKitchenStatus(args: {
  orderId: string;
  toStatus: KitchenStatus;
  role?: PosRole;
  note?: string;
}) {
  const ref = doc(db, "orders", args.orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found");
  const order = snap.data() as OrderDoc;
  const from = String(order.kitchenStatus || "new") as KitchenStatus;
  if (!canKitchenTransition(from, args.toStatus)) {
    throw new Error(`Invalid kitchen status: ${from} → ${args.toStatus}`);
  }

  const orderStatusMap: Partial<Record<KitchenStatus, OrderStatus>> = {
    accepted: "accepted",
    preparing: "preparing",
    cooking: "cooking",
    ready: "ready",
    packed: "packed",
    served: "served",
    completed: "completed"
  };
  const nextOrder = orderStatusMap[args.toStatus];
  const history = [
    ...(order.statusHistory || []),
    {
      status: nextOrder || `kitchen:${args.toStatus}`,
      at: nowIso(),
      by: actorId(),
      note: args.note || `Kitchen → ${args.toStatus}`
    }
  ].slice(-40);

  const timestamps: Record<string, string> = {};
  if (nextOrder === "accepted") timestamps.acceptedAt = nowIso();
  if (nextOrder === "preparing") timestamps.preparingAt = nowIso();
  if (nextOrder === "cooking") timestamps.cookingAt = nowIso();
  if (nextOrder === "ready") timestamps.readyAt = nowIso();
  if (nextOrder === "served") timestamps.servedAt = nowIso();
  if (nextOrder === "completed") timestamps.completedAt = nowIso();

  await setDoc(
    ref,
    {
      kitchenStatus: args.toStatus,
      ...(nextOrder ? { status: nextOrder } : {}),
      statusHistory: history,
      syncStatus: "synced",
      ...timestamps,
      ...auditUpdate()
    },
    { merge: true }
  );

  await appendStatusHistory({
    orderId: args.orderId,
    fromStatus: from,
    toStatus: `kitchen:${args.toStatus}`,
    note: args.note,
    actorRole: args.role
  });

  await logActivity({
    action: "kitchen_status_changed",
    entityType: "orders",
    entityId: args.orderId,
    message: `Kitchen ${from} → ${args.toStatus}`,
    actorRole: args.role
  });

  if (args.toStatus === "ready") {
    await pushNotification({
      title: "Order ready",
      body: `${order.invoiceNo || args.orderId.slice(0, 6)} ready from kitchen`,
      kind: "ready",
      orderId: args.orderId,
      roleTargets: ["cashier", "captain", "delivery", "manager"],
      status: "unread",
      isDeleted: false,
      syncStatus: "synced"
    });
  }
}

export async function assignChef(args: {
  orderId: string;
  chefId: string;
  chefName: string;
  categories?: string[];
  role?: PosRole;
}) {
  const batch = writeBatch(db);
  batch.set(
    doc(db, "orders", args.orderId),
    {
      chefId: args.chefId,
      chefName: args.chefName,
      kitchenCategories: args.categories || [],
      syncStatus: "synced",
      ...auditUpdate()
    },
    { merge: true }
  );
  const aRef = doc(collection(db, "kitchenAssignments"));
  batch.set(aRef, {
    orderId: args.orderId,
    chefId: args.chefId,
    chefName: args.chefName,
    categories: args.categories || [],
    assignedAt: nowIso(),
    syncStatus: "synced",
    ...auditCreate({ status: "active" })
  });
  await batch.commit();

  await logActivity({
    action: "chef_assigned",
    entityType: "orders",
    entityId: args.orderId,
    message: `Chef ${args.chefName}`,
    actorRole: args.role
  });
  await pushNotification({
    title: "Chef assigned",
    body: `${args.chefName} assigned to order`,
    kind: "chef_assigned",
    orderId: args.orderId,
    roleTargets: ["kitchen", "chef", "manager"],
    status: "unread",
    isDeleted: false,
    syncStatus: "synced"
  });
}

export async function assignDriver(args: {
  orderId: string;
  driverId: string;
  driverName: string;
  role?: PosRole;
}) {
  await setDoc(
    doc(db, "orders", args.orderId),
    {
      driverId: args.driverId,
      driverName: args.driverName,
      status: "out_for_delivery",
      kitchenStatus: "packed",
      syncStatus: "synced",
      ...auditUpdate()
    },
    { merge: true }
  );
  await setDoc(
    doc(db, "drivers", args.driverId),
    { currentOrderId: args.orderId, ...auditUpdate() },
    { merge: true }
  );
  await logActivity({
    action: "driver_assigned",
    entityType: "orders",
    entityId: args.orderId,
    message: `Driver ${args.driverName}`,
    actorRole: args.role
  });
  await pushNotification({
    title: "Driver assigned",
    body: `${args.driverName} out for delivery`,
    kind: "driver_assigned",
    orderId: args.orderId,
    roleTargets: ["delivery", "manager", "cashier"],
    status: "unread",
    isDeleted: false,
    syncStatus: "synced"
  });
}

export async function printKotForOrder(orderId: string, kind: "new" | "modified" | "reprint" | "cancel" = "new") {
  const snap = await getDoc(doc(db, "orders", orderId));
  if (!snap.exists()) throw new Error("Order not found");
  const order = { id: snap.id, ...(snap.data() as OrderDoc) };
  const version = (order.kotVersion || 0) + 1;
  const ticketRef = doc(collection(db, "kitchenTickets"));
  await setDoc(ticketRef, {
    orderId,
    tableName: order.tableName,
    orderType: order.orderType,
    items: (order.items || []).map((l) => ({
      lineId: l.lineId,
      name: l.name,
      qty: l.qty,
      note: l.note,
      kitchenNote: l.kitchenNote,
      category: l.category
    })),
    version,
    kind,
    printedAt: nowIso(),
    chefId: order.chefId || null,
    ...auditCreate({ status: "printed" })
  });
  await setDoc(
    doc(db, "orders", orderId),
    { kotVersion: version, kotSentAt: nowIso(), ...auditUpdate() },
    { merge: true }
  );
  printKitchenTicket(order);
  await logActivity({
    action: "kot_printed",
    entityType: "kitchenTickets",
    entityId: ticketRef.id,
    message: `KOT v${version} (${kind}) for ${orderId}`
  });
  return ticketRef.id;
}

export async function activateScheduledOrders() {
  const q = query(collection(db, "orders"), where("orderType", "==", "scheduled"), where("status", "==", "confirmed"));
  const snap = await getDocs(q);
  const now = Date.now();
  for (const d of snap.docs) {
    const o = d.data() as OrderDoc;
    if (!o.scheduledFor) continue;
    if (new Date(o.scheduledFor).getTime() <= now) {
      await updateOrderStatus({ orderId: d.id, toStatus: "pending", note: "Scheduled order activated" });
      await printKotForOrder(d.id, "new");
      await pushNotification({
        title: "Scheduled order due",
        body: o.invoiceNo || d.id,
        kind: "scheduled_reminder",
        orderId: d.id,
        roleTargets: ["kitchen", "manager", "cashier"],
        status: "unread",
        isDeleted: false,
        syncStatus: "synced"
      });
    }
  }
}

export { serverTimestamp, isoDate };
