import {
  Timestamp,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type WriteBatch
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { BRAND } from "@/lib/brand";
import type {
  ActivityLogDoc,
  CustomerDoc,
  KitchenTicketDoc,
  OrderDoc,
  PaymentDoc,
  PosSettingsDoc,
  RefundDoc,
  TableDoc
} from "../types";
import { isoDate, num } from "@/lib/utils";

function actorId() {
  return auth.currentUser?.uid ?? null;
}

export function auditCreate(extra: Record<string, unknown> = {}) {
  return {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: actorId(),
    updatedBy: actorId(),
    isDeleted: false,
    ...extra
  };
}

export function auditUpdate(extra: Record<string, unknown> = {}) {
  return {
    updatedAt: serverTimestamp(),
    updatedBy: actorId(),
    ...extra
  };
}

export async function logActivity(input: {
  action: string;
  entityType: string;
  entityId?: string;
  message: string;
  meta?: Record<string, unknown>;
  actorRole?: string | null;
}) {
  const ref = doc(collection(db, "activityLogs"));
  const payload: ActivityLogDoc = {
    ...auditCreate({ status: "recorded" }),
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    message: input.message,
    meta: input.meta,
    actorId: actorId(),
    actorRole: input.actorRole ?? null
  };
  await setDoc(ref, payload);
  return ref.id;
}

const DEFAULT_TAX = {
  cgstRate: 2.5,
  sgstRate: 2.5,
  igstRate: 5,
  mode: "exclusive" as const,
  enableIgst: false
};

export async function getPosSettings(): Promise<PosSettingsDoc & { id: string }> {
  const ref = doc(db, "settings", "pos");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const seed: PosSettingsDoc = {
      ...auditCreate({ status: "active" }),
      restaurantName: BRAND.restaurantName,
      tax: DEFAULT_TAX,
      invoicePrefix: BRAND.restaurantShort,
      nextInvoiceNo: 1,
      maxDiscountPct: 20,
      allowNegativeStock: false,
      roundOffEnabled: true
    };
    await setDoc(ref, seed);
    return { id: ref.id, ...seed };
  }
  return { id: snap.id, ...(snap.data() as PosSettingsDoc) };
}

export async function nextInvoiceNumber(): Promise<string> {
  const ref = doc(db, "settings", "pos");
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.exists() ? snap.data() : {}) as PosSettingsDoc;
    const prefix = data.invoicePrefix || "KG";
    const n = Math.max(1, num(data.nextInvoiceNo) || 1);
    const year = new Date().getFullYear();
    const invoiceNo = `${prefix}-${year}-${String(n).padStart(5, "0")}`;
    tx.set(
      ref,
      {
        ...(!snap.exists()
          ? {
              ...auditCreate({ status: "active" }),
              tax: DEFAULT_TAX,
              invoicePrefix: prefix,
              maxDiscountPct: 20,
              roundOffEnabled: true
            }
          : {}),
        nextInvoiceNo: n + 1,
        ...auditUpdate()
      },
      { merge: true }
    );
    return invoiceNo;
  });
}

export async function upsertCustomer(input: Partial<CustomerDoc> & { name: string; id?: string }) {
  const id = input.id || doc(collection(db, "customers")).id;
  const ref = doc(db, "customers", id);
  const existing = await getDoc(ref);
  const payload = {
    name: input.name.trim(),
    phone: input.phone || "",
    email: input.email || "",
    gstin: input.gstin || "",
    address: input.address || "",
    rewardPoints: num(input.rewardPoints),
    pendingBalance: num(input.pendingBalance),
    type: input.type || "regular",
    status: "active",
    ...(existing.exists() ? auditUpdate() : auditCreate({ status: "active" }))
  };
  await setDoc(ref, payload, { merge: true });
  await logActivity({
    action: existing.exists() ? "customer_updated" : "customer_created",
    entityType: "customers",
    entityId: id,
    message: `${existing.exists() ? "Updated" : "Created"} customer ${payload.name}`
  });
  return id;
}

export async function upsertTable(input: Partial<TableDoc> & { name: string; id?: string }) {
  const id = input.id || doc(collection(db, "tables")).id;
  const ref = doc(db, "tables", id);
  const existing = await getDoc(ref);
  await setDoc(
    ref,
    {
      name: input.name,
      capacity: num(input.capacity) || 4,
      floor: input.floor || "Main",
      status: input.status || "available",
      currentOrderId: input.currentOrderId ?? null,
      mergedInto: input.mergedInto ?? null,
      ...(existing.exists() ? auditUpdate() : auditCreate({ status: input.status || "available" }))
    },
    { merge: true }
  );
  return id;
}

export async function setTableStatus(tableId: string, status: TableDoc["status"], orderId?: string | null) {
  await updateDoc(doc(db, "tables", tableId), {
    status,
    currentOrderId: orderId === undefined ? undefined : orderId,
    ...auditUpdate()
  });
}

export async function saveOrderDoc(orderId: string | null, data: Partial<OrderDoc>) {
  const ref = orderId ? doc(db, "orders", orderId) : doc(collection(db, "orders"));
  const existing = orderId ? await getDoc(ref) : null;
  const payload = {
    ...data,
    ...(existing?.exists() ? auditUpdate() : auditCreate({ status: data.status || "draft" }))
  };
  await setDoc(ref, payload, { merge: true });
  return ref.id;
}

export async function completeOrderTransaction(args: {
  orderPayload: Omit<OrderDoc, "createdAt" | "updatedAt" | "createdBy" | "updatedBy">;
  existingOrderId?: string | null;
  salePayload: Record<string, unknown>;
  paymentDocs: Array<Omit<PaymentDoc, "createdAt" | "updatedAt" | "createdBy" | "updatedBy">>;
  kitchenTicket?: Omit<KitchenTicketDoc, "createdAt" | "updatedAt" | "createdBy" | "updatedBy"> | null;
  inventoryAdjustments?: Array<{ id: string; delta: number; item: string; unit?: string }>;
  tableId?: string | null;
  couponId?: string | null;
}) {
  const orderRef = args.existingOrderId
    ? doc(db, "orders", args.existingOrderId)
    : doc(collection(db, "orders"));
  const saleRef = doc(collection(db, "sales"));
  const batch = writeBatch(db);

  batch.set(
    orderRef,
    {
      ...args.orderPayload,
      saleId: saleRef.id,
      status: "completed",
      ...auditCreate({ status: "completed" })
    },
    { merge: true }
  );

  batch.set(saleRef, {
    ...args.salePayload,
    orderId: orderRef.id,
    source: "pos",
    createdAt: serverTimestamp()
  });

  for (const p of args.paymentDocs) {
    const pref = doc(collection(db, "payments"));
    batch.set(pref, { ...p, orderId: orderRef.id, ...auditCreate({ status: "captured" }) });
  }

  if (args.kitchenTicket) {
    const kref = doc(collection(db, "kitchenTickets"));
    batch.set(kref, { ...args.kitchenTicket, orderId: orderRef.id, ...auditCreate({ status: "sent" }) });
  }

  if (args.tableId) {
    batch.set(
      doc(db, "tables", args.tableId),
      { status: "cleaning", currentOrderId: null, ...auditUpdate() },
      { merge: true }
    );
  }

  if (args.couponId) {
    const cref = doc(db, "coupons", args.couponId);
    const csnap = await getDoc(cref);
    if (csnap.exists()) {
      batch.update(cref, {
        usageCount: num(csnap.data().usageCount) + 1,
        ...auditUpdate()
      });
    }
  }

  for (const adj of args.inventoryAdjustments || []) {
    const iref = doc(db, "inventory", adj.id);
    const isnap = await getDoc(iref);
    if (!isnap.exists()) continue;
    const prev = num(isnap.data().qty);
    const next = prev + adj.delta;
    batch.update(iref, { qty: next, ...auditUpdate() });
    const mref = doc(collection(db, "inventory_movements"));
    batch.set(mref, {
      ...auditCreate({ status: "posted" }),
      item: adj.item,
      unit: adj.unit || "unit",
      delta: adj.delta,
      qtyBefore: prev,
      qtyAfter: next,
      type: "pos",
      reason: `POS bill ${args.orderPayload.invoiceNo || orderRef.id}`,
      date: isoDate(),
      inventoryId: adj.id,
      orderId: orderRef.id
    });
  }

  const logRef = doc(collection(db, "activityLogs"));
  batch.set(logRef, {
    ...auditCreate({ status: "recorded" }),
    action: "bill_created",
    entityType: "orders",
    entityId: orderRef.id,
    message: `Bill ${args.orderPayload.invoiceNo || orderRef.id} completed for ${num(args.orderPayload.total)}`,
    actorId: actorId(),
    meta: { total: args.orderPayload.total, invoiceNo: args.orderPayload.invoiceNo }
  });

  await batch.commit();
  return { orderId: orderRef.id, saleId: saleRef.id };
}

export async function softCancelOrder(orderId: string, reason: string, restoreInventory = false) {
  const batch = writeBatch(db);
  batch.set(
    doc(db, "orders", orderId),
    {
      status: "cancelled",
      cancelledReason: reason,
      isDeleted: false,
      ...auditUpdate()
    },
    { merge: true }
  );
  const logRef = doc(collection(db, "activityLogs"));
  batch.set(logRef, {
    ...auditCreate({ status: "recorded" }),
    action: "bill_cancelled",
    entityType: "orders",
    entityId: orderId,
    message: `Order cancelled: ${reason}`,
    actorId: actorId(),
    meta: { reason, restoreInventory }
  });
  await batch.commit();
}

export async function createRefund(refund: Omit<RefundDoc, "createdAt" | "updatedAt" | "createdBy" | "updatedBy">) {
  const ref = doc(collection(db, "refunds"));
  await setDoc(ref, { ...refund, ...auditCreate({ status: "approved" }) });
  await updateDoc(doc(db, "orders", refund.orderId), {
    status: refund.type === "full" ? "refunded" : "completed",
    refundedAmount: num(refund.amount),
    ...auditUpdate()
  });
  await logActivity({
    action: "refund",
    entityType: "refunds",
    entityId: ref.id,
    message: `Refund ${refund.type} ${refund.amount} for order ${refund.orderId}`,
    meta: { reason: refund.reason }
  });
  return ref.id;
}

export { Timestamp, writeBatch, doc, collection, db };
export type { WriteBatch };
