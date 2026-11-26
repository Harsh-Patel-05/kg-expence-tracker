import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import type { CartLine, OrderDoc, PosRole } from "@/features/pos/types";
import { isoDate, num } from "@/lib/utils";
import { printKotForOrder, pushNotification } from "./orderEngine";

/** In-flight creates so the same tab doesn't spawn parallel kitchen tickets. */
const createInFlight = new Map<string, Promise<string>>();

export type OnlineOrderDoc = {
  id: string;
  orderId?: string;
  orderStatus?: string;
  orderType?: string;
  customer?: { fullName?: string; mobile?: string };
  items?: Array<{
    id?: string;
    name: string;
    optionLabel?: string | null;
    qty: number;
    unitPrice: number;
    lineTotal?: number;
    notes?: string;
  }>;
  pricing?: { subtotal?: number; deliveryCharge?: number; discount?: number; total?: number };
  deliveryAddress?: {
    flat?: string;
    society?: string;
    area?: string;
    landmark?: string;
    formatted?: string;
    latitude?: number;
    longitude?: number;
  };
  distanceKm?: number | null;
  paymentMethod?: string;
  paymentStatus?: string;
  deliveryInstructions?: string;
  createdAtIso?: string;
  estimatedDeliveryMinutes?: { min: number; max: number };
  linkedKitchenOrderId?: string | null;
  source?: string;
};

const OPEN_KITCHEN_ONLINE = new Set(["confirmed", "preparing", "ready", "out_for_delivery"]);

function addressLine(o: OnlineOrderDoc) {
  const a = o.deliveryAddress;
  if (!a) return "";
  return [a.flat, a.society, a.area, a.landmark].filter(Boolean).join(", ") || a.formatted || "";
}

function mapItems(o: OnlineOrderDoc): CartLine[] {
  return (o.items || []).map((it, i) => {
    const qty = Math.max(1, num(it.qty) || 1);
    const price = num(it.unitPrice);
    return {
      lineId: `web_${o.id}_${i}`,
      menuItemId: String(it.id || `web_${i}`),
      name: it.name || "Item",
      price,
      qty,
      note: it.optionLabel || it.notes || "",
      isCustom: true
    };
  });
}

async function patchOnlineStatus(onlineId: string, status: string, note: string, extra: Record<string, unknown> = {}) {
  const at = new Date().toISOString();
  await updateDoc(doc(db, "onlineOrders", onlineId), {
    orderStatus: status,
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({ status, at, note }),
    ...extra
  });
}

async function findExistingKitchenBySource(onlineId: string): Promise<string | null> {
  try {
    const q = query(
      collection(db, "orders"),
      where("sourceOnlineOrderId", "==", onlineId),
      limit(8)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const open = snap.docs.filter((d) => {
      const st = String((d.data() as OrderDoc).status || "");
      return !["cancelled", "rejected", "completed", "delivered"].includes(st);
    });
    const keep = open[0] || snap.docs[0];
    // Collapse accidental duplicates from earlier races
    for (const d of open) {
      if (d.id === keep.id) continue;
      void updateDoc(doc(db, "orders", d.id), {
        status: "cancelled",
        kitchenStatus: "completed",
        cancelledReason: "Duplicate website → kitchen ticket",
        ...auditUpdate()
      }).catch(() => undefined);
    }
    return keep.id;
  } catch {
    return null;
  }
}

async function createKitchenOrderFromOnline(o: OnlineOrderDoc): Promise<string> {
  const existing = await findExistingKitchenBySource(o.id);
  if (existing) {
    await updateDoc(doc(db, "onlineOrders", o.id), {
      linkedKitchenOrderId: existing,
      ...auditUpdate()
    }).catch(() => undefined);
    return existing;
  }

  const items = mapItems(o);
  const subtotal = num(o.pricing?.subtotal) || items.reduce((s, l) => s + l.price * l.qty, 0);
  const deliveryCharge = o.orderType === "pickup" ? 0 : num(o.pricing?.deliveryCharge);
  const discount = num(o.pricing?.discount);
  const total = num(o.pricing?.total) || Math.max(0, subtotal + deliveryCharge - discount);
  const displayId = o.orderId || o.id;
  const token = String(displayId).split("-").pop() || displayId.slice(-6);
  const isPickup = o.orderType === "pickup";
  const etaMax = o.estimatedDeliveryMinutes?.max || 45;
  const nowIso = new Date().toISOString();
  const expectedReadyAt = new Date(Date.now() + etaMax * 60_000).toISOString();

  const charges =
    deliveryCharge > 0
      ? [{ id: "delivery", label: "Delivery", amount: deliveryCharge, type: "delivery" as const }]
      : [];

  const payload: OrderDoc = {
    date: isoDate(),
    invoiceNo: displayId,
    tokenNumber: token,
    orderType: "online",
    items,
    notes: [isPickup ? "Website pickup" : "Website delivery", o.deliveryInstructions || ""]
      .filter(Boolean)
      .join(" · "),
    kitchenNote: o.deliveryInstructions || "",
    customerNote: o.deliveryInstructions || "",
    customerId: null,
    customerName: o.customer?.fullName || "Website guest",
    customerPhone: o.customer?.mobile || null,
    tableId: null,
    tableName: null,
    subtotal,
    itemDiscountTotal: 0,
    billDiscount: discount,
    couponDiscount: 0,
    taxAmount: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    charges,
    chargesTotal: deliveryCharge,
    roundOff: 0,
    total,
    paidTotal: 0,
    balanceDue: total,
    payments: [],
    discount: discount > 0 ? { type: "fixed", value: discount, reason: "Online discount" } : { type: "none", value: 0 },
    taxMode: "exclusive",
    held: false,
    payLater: true,
    paymentStatus: "unpaid",
    countsAsRevenue: true,
    kitchenStatus: "new",
    syncStatus: "synced",
    platformOrderId: displayId,
    sourceOnlineOrderId: o.id,
    deliveryAddress: addressLine(o) || (isPickup ? "Pickup" : undefined),
    deliveryCharge,
    etaMinutes: etaMax,
    expectedReadyAt,
    acceptedAt: nowIso,
    priority: "normal",
    statusHistory: [{ status: "confirmed", at: nowIso, note: "Accepted from website order" }],
    status: "confirmed"
  };

  // Transaction: only one kitchen ticket can win the linkedKitchenOrderId write.
  const result = await runTransaction(db, async (tx) => {
    const onlineRef = doc(db, "onlineOrders", o.id);
    const onlineSnap = await tx.get(onlineRef);
    if (!onlineSnap.exists()) throw new Error("Online order not found");
    const linked = (onlineSnap.data() as OnlineOrderDoc).linkedKitchenOrderId;
    if (linked) return { id: linked, created: false as const };

    const ref = doc(collection(db, "orders"));
    tx.set(ref, { ...payload, ...auditCreate({ status: "confirmed" }) });
    tx.update(onlineRef, {
      linkedKitchenOrderId: ref.id,
      updatedAt: serverTimestamp()
    });
    return { id: ref.id, created: true as const };
  });

  if (result.created) {
    try {
      await printKotForOrder(result.id, "new");
    } catch {
      /* kot is best-effort */
    }
    await logActivity({
      action: "online_order_to_kitchen",
      entityType: "orders",
      entityId: result.id,
      message: `Website ${displayId} → kitchen`
    });
  }

  await findExistingKitchenBySource(o.id);
  return result.id;
}

async function createKitchenOrderOnce(o: OnlineOrderDoc): Promise<string> {
  const pending = createInFlight.get(o.id);
  if (pending) return pending;
  const job = createKitchenOrderFromOnline(o).finally(() => {
    createInFlight.delete(o.id);
  });
  createInFlight.set(o.id, job);
  return job;
}

/** Idempotent: create kitchen ticket for an accepted online order if missing. */
export async function ensureKitchenOrderFromOnline(o: OnlineOrderDoc): Promise<string | null> {
  if (o.linkedKitchenOrderId) {
    await findExistingKitchenBySource(o.id);
    return o.linkedKitchenOrderId;
  }
  const st = o.orderStatus || "";
  if (!OPEN_KITCHEN_ONLINE.has(st)) return null;

  const existing = await findExistingKitchenBySource(o.id);
  if (existing) {
    await updateDoc(doc(db, "onlineOrders", o.id), {
      linkedKitchenOrderId: existing,
      ...auditUpdate()
    }).catch(() => undefined);
    return existing;
  }

  const kitchenId = await createKitchenOrderOnce(o);
  // Align kitchen ticket with current website status (backfill)
  if (st !== "confirmed") {
    const kitchenStatus =
      st === "preparing" ? "preparing" : st === "ready" || st === "out_for_delivery" ? "ready" : "new";
    const orderStatus =
      st === "out_for_delivery" ? "out_for_delivery" : st === "ready" ? "ready" : st === "preparing" ? "preparing" : "confirmed";
    await updateDoc(doc(db, "orders", kitchenId), {
      kitchenStatus,
      status: orderStatus,
      ...auditUpdate()
    }).catch(() => undefined);
  }
  return kitchenId;
}

export async function acceptOnlineOrder(args: {
  onlineOrderId: string;
  etaMaxMin?: number;
  role?: PosRole;
}) {
  const snap = await getDoc(doc(db, "onlineOrders", args.onlineOrderId));
  if (!snap.exists()) throw new Error("Online order not found");
  const o = { id: snap.id, ...(snap.data() as Omit<OnlineOrderDoc, "id">) };
  const etaMax = Math.max(20, Math.min(120, num(args.etaMaxMin) || o.estimatedDeliveryMinutes?.max || 40));
  const etaMin = Math.max(15, etaMax - 10);

  if (o.orderStatus === "placed" || !o.orderStatus) {
    await patchOnlineStatus(o.id, "confirmed", "Order confirmed", {
      estimatedDeliveryMinutes: { min: etaMin, max: etaMax + 5 }
    });
    o.orderStatus = "confirmed";
    o.estimatedDeliveryMinutes = { min: etaMin, max: etaMax + 5 };
  }

  const kitchenId = o.linkedKitchenOrderId || (await createKitchenOrderOnce(o));

  await pushNotification({
    title: "Online order accepted",
    body: `${o.orderId || o.id} · ${o.customer?.fullName || "Customer"}`,
    kind: "new_order",
    orderId: kitchenId,
    roleTargets: ["kitchen", "chef", "manager", "cashier", "delivery"],
    status: "unread",
    isDeleted: false,
    syncStatus: "synced"
  });

  return { onlineOrderId: o.id, kitchenOrderId: kitchenId };
}

export async function rejectOnlineOrder(args: {
  onlineOrderId: string;
  reason?: string;
  asCancel?: boolean;
  role?: PosRole;
}) {
  const snap = await getDoc(doc(db, "onlineOrders", args.onlineOrderId));
  if (!snap.exists()) throw new Error("Online order not found");
  const o = { id: snap.id, ...(snap.data() as Omit<OnlineOrderDoc, "id">) };

  const status = args.asCancel ? "cancelled" : "rejected";
  const note =
    args.reason ||
    (args.asCancel ? "Cancelled by restaurant" : "Rejected by restaurant");

  await patchOnlineStatus(o.id, status, note);

  // If a kitchen ticket was already created, close it too
  if (o.linkedKitchenOrderId) {
    try {
      await updateDoc(doc(db, "orders", o.linkedKitchenOrderId), {
        status: status === "cancelled" ? "cancelled" : "rejected",
        kitchenStatus: "completed",
        cancelledReason: note,
        ...auditUpdate()
      });
    } catch {
      /* kitchen sync best-effort */
    }
  }

  await logActivity({
    action: status === "cancelled" ? "online_order_cancelled" : "online_order_rejected",
    entityType: "onlineOrders",
    entityId: o.id,
    message: `${o.orderId || o.id}: ${note}`,
    actorRole: args.role
  });

  await pushNotification({
    title: status === "cancelled" ? "Online order cancelled" : "Online order rejected",
    body: `${o.orderId || o.id} · ${o.customer?.fullName || "Customer"}`,
    kind: "cancelled",
    orderId: o.linkedKitchenOrderId || o.id,
    roleTargets: ["manager", "cashier", "kitchen"],
    status: "unread",
    isDeleted: false,
    syncStatus: "synced"
  });

  return { onlineOrderId: o.id, status };
}

/** Mirror kitchen / POS status back to customer tracking. */
export async function syncOnlineOrderFromKitchenOrder(
  kitchenOrderId: string,
  kitchenOrOrderStatus: string
) {
  const snap = await getDoc(doc(db, "orders", kitchenOrderId));
  if (!snap.exists()) return;
  const order = snap.data() as OrderDoc;
  const onlineId = order.sourceOnlineOrderId;
  if (!onlineId) return;

  const map: Record<string, string> = {
    preparing: "preparing",
    cooking: "preparing",
    ready: "ready",
    packed: "ready",
    waiting_pickup: "ready",
    out_for_delivery: "out_for_delivery",
    served: "delivered",
    delivered: "delivered",
    completed: "delivered",
    cancelled: "cancelled",
    rejected: "rejected"
  };
  const next = map[kitchenOrOrderStatus];
  if (!next) return;

  const onlineSnap = await getDoc(doc(db, "onlineOrders", onlineId));
  if (!onlineSnap.exists()) return;
  const cur = String((onlineSnap.data() as OnlineOrderDoc).orderStatus || "");
  if (cur === next || cur === "cancelled" || cur === "rejected" || cur === "refund_pending") return;

  await patchOnlineStatus(onlineId, next, `Synced from kitchen (${kitchenOrOrderStatus})`);
}
