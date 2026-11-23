import { collection, doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import type { OrderDoc } from "@/features/pos/types";
import { updateOrderStatus, printKotForOrder, pushNotification } from "./orderEngine";

/** Confirm a draft/held order into kitchen pipeline */
export async function confirmOrderToKitchen(orderId: string, role?: string) {
  await updateOrderStatus({ orderId, toStatus: "confirmed", note: "Confirmed to kitchen", role: role as any });
  await updateOrderStatus({ orderId, toStatus: "accepted", note: "Auto-accepted", role: role as any, force: true });
  await printKotForOrder(orderId, "new");
  await pushNotification({
    title: "New kitchen order",
    body: `Order ${orderId.slice(0, 6)} confirmed`,
    kind: "new_order",
    orderId,
    roleTargets: ["kitchen", "chef", "manager"],
    status: "unread",
    isDeleted: false,
    syncStatus: "synced"
  });
}

export async function createQuickChannelOrder(input: {
  orderType: OrderDoc["orderType"];
  customerName?: string;
  customerPhone?: string;
  items: OrderDoc["items"];
  total: number;
  platformOrderId?: string;
  platform?: OrderDoc["platform"];
  deliveryAddress?: string;
  scheduledFor?: string;
  notes?: string;
  tableId?: string | null;
  tableName?: string | null;
}) {
  const ref = doc(collection(db, "orders"));
  const payload: OrderDoc = {
    date: new Date().toISOString().slice(0, 10),
    orderType: input.orderType,
    items: input.items,
    notes: input.notes || "",
    customerName: input.customerName || "Guest",
    customerPhone: input.customerPhone || null,
    customerId: null,
    tableId: input.tableId ?? null,
    tableName: input.tableName ?? null,
    subtotal: input.total,
    itemDiscountTotal: 0,
    billDiscount: 0,
    couponDiscount: 0,
    taxAmount: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    charges: [],
    chargesTotal: 0,
    roundOff: 0,
    total: input.total,
    paidTotal: 0,
    balanceDue: input.total,
    payments: [],
    discount: { type: "none", value: 0 },
    taxMode: "exclusive",
    status: "pending",
    kitchenStatus: "new",
    syncStatus: "synced",
    platform: input.platform,
    platformOrderId: input.platformOrderId,
    deliveryAddress: input.deliveryAddress,
    scheduledFor: input.scheduledFor || null,
    priority: input.orderType === "swiggy" || input.orderType === "zomato" ? "express" : "normal",
    statusHistory: [{ status: "pending", at: new Date().toISOString(), note: "Created" }]
  };
  await setDoc(ref, { ...payload, ...auditCreate({ status: "pending" }) });
  if (input.tableId) {
    await setDoc(
      doc(db, "tables", input.tableId),
      { status: "occupied", currentOrderId: ref.id, ...auditUpdate() },
      { merge: true }
    );
  }
  await logActivity({
    action: "order_created",
    entityType: "orders",
    entityId: ref.id,
    message: `${input.orderType} order created`
  });
  await pushNotification({
    title: "New order",
    body: `${input.orderType} · ${input.customerName || "Guest"} · ₹${input.total}`,
    kind: "new_order",
    orderId: ref.id,
    roleTargets: ["kitchen", "cashier", "manager", "captain"],
    status: "unread",
    isDeleted: false,
    syncStatus: "synced"
  });
  return ref.id;
}

/** Merge QR/table order items into existing open table order */
export async function mergeIntoTableOrder(tableId: string, newItems: OrderDoc["items"]) {
  const tableSnap = await getDoc(doc(db, "tables", tableId));
  if (!tableSnap.exists()) throw new Error("Table not found");
  const table = tableSnap.data() as { currentOrderId?: string; name?: string };
  if (!table.currentOrderId) throw new Error("No open order on table");
  const orderRef = doc(db, "orders", table.currentOrderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) throw new Error("Order missing");
  const order = orderSnap.data() as OrderDoc;
  const items = [...(order.items || []), ...newItems.map((l) => ({ ...l, lineId: `${l.lineId}_qr` }))];
  const addTotal = newItems.reduce((s, l) => s + l.price * l.qty, 0);
  await setDoc(
    orderRef,
    {
      items,
      subtotal: (order.subtotal || 0) + addTotal,
      total: (order.total || 0) + addTotal,
      balanceDue: (order.balanceDue || 0) + addTotal,
      ...auditUpdate()
    },
    { merge: true }
  );
  await printKotForOrder(table.currentOrderId, "modified");
  return table.currentOrderId;
}

export async function upsertDriver(name: string, phone?: string) {
  const ref = doc(collection(db, "drivers"));
  await setDoc(ref, {
    name,
    phone: phone || "",
    active: true,
    currentOrderId: null,
    syncStatus: "synced",
    ...auditCreate({ status: "active" })
  });
  return ref.id;
}

export async function markOfflineQueue(orderId: string, patch: Record<string, unknown>) {
  const key = "kg_oms_offline_queue_v1";
  const raw = localStorage.getItem(key);
  const queue = raw ? (JSON.parse(raw) as Array<{ orderId: string; patch: Record<string, unknown>; at: string }>) : [];
  queue.push({ orderId, patch, at: new Date().toISOString() });
  localStorage.setItem(key, JSON.stringify(queue.slice(-100)));
  await setDoc(doc(db, "orders", orderId), { syncStatus: "pending", ...patch, ...auditUpdate() }, { merge: true }).catch(() => {
    /* offline */
  });
}

export async function flushOfflineQueue() {
  const key = "kg_oms_offline_queue_v1";
  const raw = localStorage.getItem(key);
  if (!raw) return 0;
  const queue = JSON.parse(raw) as Array<{ orderId: string; patch: Record<string, unknown> }>;
  const batch = writeBatch(db);
  let n = 0;
  for (const row of queue) {
    batch.set(doc(db, "orders", row.orderId), { ...row.patch, syncStatus: "synced", ...auditUpdate() }, { merge: true });
    n++;
  }
  await batch.commit();
  localStorage.removeItem(key);
  return n;
}
