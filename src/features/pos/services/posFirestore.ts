import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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

function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)).filter((item) => item !== undefined);
  }
  // Keep Firestore sentinels / Timestamp-like objects intact
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    const cleaned = stripUndefinedDeep(v);
    if (cleaned === undefined) continue;
    out[k] = cleaned;
  }
  return out;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return stripUndefinedDeep(obj) as T;
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
  const payload = stripUndefined({
    ...auditCreate({ status: "recorded" }),
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    message: input.message,
    ...(input.meta ? { meta: stripUndefined(input.meta) } : {}),
    actorId: actorId(),
    actorRole: input.actorRole ?? null
  }) as ActivityLogDoc;
  await setDoc(ref, payload);
  return ref.id;
}

const DEFAULT_TAX = {
  cgstRate: 0,
  sgstRate: 0,
  igstRate: 0,
  mode: "exclusive" as const,
  enableIgst: false
};

let posSettingsCache: { at: number; value: PosSettingsDoc & { id: string } } | null = null;

export async function getPosSettings(): Promise<PosSettingsDoc & { id: string }> {
  if (posSettingsCache && Date.now() - posSettingsCache.at < 60_000) {
    return posSettingsCache.value;
  }
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
    const value = { id: ref.id, ...seed };
    posSettingsCache = { at: Date.now(), value };
    return value;
  }
  const value = { id: snap.id, ...(snap.data() as PosSettingsDoc) };
  posSettingsCache = { at: Date.now(), value };
  return value;
}

/** Invalidate after invoice bump so nextInvoiceNo stays fresh when needed. */
export function bumpPosSettingsCacheInvoice(nextInvoiceNo: number) {
  if (posSettingsCache) {
    posSettingsCache = {
      at: Date.now(),
      value: { ...posSettingsCache.value, nextInvoiceNo }
    };
  }
}

export async function nextInvoiceNumber(): Promise<string> {
  const ref = doc(db, "settings", "pos");
  const invoiceNo = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.exists() ? snap.data() : {}) as PosSettingsDoc;
    const prefix = data.invoicePrefix || "KG";
    const n = Math.max(1, num(data.nextInvoiceNo) || 1);
    const year = new Date().getFullYear();
    const inv = `${prefix}-${year}-${String(n).padStart(5, "0")}`;
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
    return { inv, next: n + 1 };
  });
  bumpPosSettingsCacheInvoice(invoiceNo.next);
  return invoiceNo.inv;
}

/**
 * One Firestore transaction for invoice + kitchen token (cuts ~1 round-trip vs sequential).
 */
export async function allocateInvoiceAndKitchenToken(args: {
  orderType: string;
  platformOrderId?: string | null;
  existingInvoice?: string | null;
  existingToken?: string | null;
}): Promise<{ invoiceNo: string; tokenNumber: string }> {
  const platformId = String(args.platformOrderId || "").trim();
  const isAgg = isAggregatorOrderType(args.orderType);
  const tokenFromPlatform = isAgg && platformId ? platformId : null;
  const keepInvoice = String(args.existingInvoice || "").trim();
  const keepToken = String(args.existingToken || "").trim();

  if (keepInvoice && (keepToken || tokenFromPlatform)) {
    return { invoiceNo: keepInvoice, tokenNumber: tokenFromPlatform || keepToken.replace(/^0+/, "") || keepToken };
  }
  if (tokenFromPlatform && keepInvoice) {
    return { invoiceNo: keepInvoice, tokenNumber: tokenFromPlatform };
  }

  // Platform with ID: only need invoice bump (token is the platform id)
  if (tokenFromPlatform && !keepInvoice) {
    const invoiceNo = await nextInvoiceNumber();
    return { invoiceNo, tokenNumber: tokenFromPlatform };
  }

  const settingsRef = doc(db, "settings", "pos");
  const day = isoDate().replace(/-/g, "");
  const kotRef = doc(db, "billCounters", `KOT_${day}`);

  const result = await runTransaction(db, async (tx) => {
    let invoiceNo = keepInvoice;
    if (!invoiceNo) {
      const snap = await tx.get(settingsRef);
      const data = (snap.exists() ? snap.data() : {}) as PosSettingsDoc;
      const prefix = data.invoicePrefix || "KG";
      const n = Math.max(1, num(data.nextInvoiceNo) || 1);
      const year = new Date().getFullYear();
      invoiceNo = `${prefix}-${year}-${String(n).padStart(5, "0")}`;
      tx.set(
        settingsRef,
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
      bumpPosSettingsCacheInvoice(n + 1);
    }

    let tokenNumber = keepToken.replace(/^0+/, "") || keepToken;
    if (!tokenNumber) {
      const snap = await tx.get(kotRef);
      const n = (snap.exists() ? num(snap.data()?.seq) : 0) + 1;
      tx.set(
        kotRef,
        { seq: n, date: isoDate(), kind: "kot", updatedAt: serverTimestamp() },
        { merge: true }
      );
      tokenNumber = String(n);
    }

    return { invoiceNo, tokenNumber };
  });

  return result;
}

export function isAggregatorOrderType(orderType?: string) {
  const t = String(orderType || "").toLowerCase();
  return t.includes("swiggy") || t.includes("zomato");
}

/** Swiggy/Zomato kitchen tickets — paid on the app, not through shop cash/UPI. */
export function isPlatformKitchenOrder(o: {
  orderType?: string | null;
  platform?: string | null;
  countsAsRevenue?: boolean | null;
  kitchenOnlyNoSale?: boolean | null;
}) {
  if (o?.kitchenOnlyNoSale === true) return true;
  if (o?.countsAsRevenue === false) return true;
  return isAggregatorOrderType(String(o?.orderType || o?.platform || ""));
}

/** True when shop must collect cash/UPI before deliver (excludes platform kitchen-only). */
export function needsShopCollect(o: {
  orderType?: string | null;
  platform?: string | null;
  countsAsRevenue?: boolean | null;
  kitchenOnlyNoSale?: boolean | null;
  payLater?: boolean | null;
  paymentStatus?: string | null;
  balanceDue?: number | null;
}) {
  if (isPlatformKitchenOrder(o)) return false;
  return !!(o.payLater || o.paymentStatus === "unpaid" || Number(o.balanceDue) > 0.01);
}

/** Prefer platform's own 4-digit code; never reuse shop daily tokens. */
export function platformTokenFromId(platformOrderId?: string | null): string | null {
  const raw = String(platformOrderId || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  if (digits.length > 0) return digits.padStart(4, "0");
  return raw.slice(0, 8);
}

/**
 * Kitchen display token:
 * - Shop (takeaway/dine/…) → daily counter starting at 1 each morning (no leading zeros)
 * - Swiggy / Zomato → their own 4-digit token (platform id, or separate daily 4-digit pool)
 */
export async function nextKitchenToken(args: {
  orderType: string;
  platformOrderId?: string | null;
}): Promise<string> {
  if (isAggregatorOrderType(args.orderType)) {
    const raw = String(args.platformOrderId || "").trim();
    if (raw) return raw; // KDS shows exactly the ID cashier entered
    const fromPlatform = platformTokenFromId(args.platformOrderId);
    if (fromPlatform) return fromPlatform;
    const day = isoDate().replace(/-/g, "");
    const kind = String(args.orderType || "").toLowerCase().includes("zomato") ? "ZOMATO" : "SWIGGY";
    const counterRef = doc(db, "billCounters", `${kind}_${day}`);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const n = (snap.exists() ? num(snap.data()?.seq) : 0) + 1;
      tx.set(
        counterRef,
        { seq: n, date: isoDate(), kind: kind.toLowerCase(), updatedAt: serverTimestamp() },
        { merge: true }
      );
      // 4-digit pool, separate from shop tokens
      return String(((n - 1) % 9000) + 1000);
    });
  }

  const day = isoDate().replace(/-/g, "");
  const counterRef = doc(db, "billCounters", `KOT_${day}`);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const n = (snap.exists() ? num(snap.data()?.seq) : 0) + 1;
    tx.set(
      counterRef,
      { seq: n, date: isoDate(), kind: "kot", updatedAt: serverTimestamp() },
      { merge: true }
    );
    return String(n);
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
  const payload = stripUndefined({
    ...data,
    customerId: data.customerId ?? null,
    customerName: data.customerName ?? null,
    customerPhone: data.customerPhone ?? null,
    tableId: data.tableId ?? null,
    tableName: data.tableName ?? null,
    couponCode: data.couponCode ?? null,
    notes: data.notes ?? "",
    kitchenNote: data.kitchenNote ?? "",
    customerNote: data.customerNote ?? "",
    ...(existing?.exists() ? auditUpdate() : auditCreate({ status: data.status || "draft" }))
  } as Record<string, unknown>);
  await setDoc(ref, payload, { merge: true });
  return ref.id;
}

export async function createKitchenTicket(input: {
  orderId: string;
  tableName?: string | null;
  orderType: OrderDoc["orderType"];
  kitchenNote?: string;
  items: Array<{
    lineId: string;
    name: string;
    qty: number;
    note?: string;
    kitchenNote?: string;
  }>;
  version?: number;
}) {
  const ref = doc(collection(db, "kitchenTickets"));
  const payload = stripUndefined({
    ...auditCreate({ status: "sent" }),
    orderId: input.orderId,
    tableName: input.tableName ?? null,
    orderType: input.orderType,
    items: input.items.map((l) =>
      stripUndefined({
        lineId: l.lineId,
        name: l.name,
        nameHi: (l as { nameHi?: string }).nameHi || "",
        qty: l.qty,
        note: l.note || "",
        kitchenNote: l.kitchenNote || ""
      } as Record<string, unknown>)
    ),
    version: input.version ?? 1,
    printedAt: null,
    status: "sent",
    isDeleted: false
  } as Record<string, unknown>);
  await setDoc(ref, payload);
  return ref.id;
}

export async function completeOrderTransaction(args: {
  orderPayload: Omit<OrderDoc, "createdAt" | "updatedAt" | "createdBy" | "updatedBy">;
  existingOrderId?: string | null;
  salePayload: Record<string, unknown> | null;
  paymentDocs: Array<Omit<PaymentDoc, "createdAt" | "updatedAt" | "createdBy" | "updatedBy">>;
  kitchenTicket?: Omit<KitchenTicketDoc, "createdAt" | "updatedAt" | "createdBy" | "updatedBy"> | null;
  inventoryAdjustments?: Array<{ id: string; delta: number; item: string; unit?: string }>;
  tableId?: string | null;
  couponId?: string | null;
  /** Paid now but still send to kitchen live (classic POS). Default true. */
  sendToKitchen?: boolean;
  /** Swiggy/Zomato: kitchen only — no sales/payments (manual weekly entry). */
  kitchenOnlyNoSale?: boolean;
}) {
  const orderRef = args.existingOrderId
    ? doc(db, "orders", args.existingOrderId)
    : doc(collection(db, "orders"));
  const kitchenOnly = Boolean(args.kitchenOnlyNoSale);
  const saleRef = kitchenOnly ? null : doc(collection(db, "sales"));
  const batch = writeBatch(db);
  const sendToKitchen = args.sendToKitchen !== false;
  const nowIso = new Date().toISOString();
  const orderStatus = sendToKitchen ? "confirmed" : "completed";

  const orderDoc = stripUndefinedDeep({
    ...args.orderPayload,
    ...(saleRef ? { saleId: saleRef.id } : { saleId: null }),
    status: orderStatus,
    held: false,
    payLater: false,
    // Platform tickets: paid on app, not through shop cash/online
    paymentStatus: kitchenOnly ? "unpaid" : "paid",
    balanceDue: kitchenOnly ? num(args.orderPayload.total) : 0,
    paidTotal: kitchenOnly ? 0 : args.orderPayload.paidTotal,
    countsAsRevenue: kitchenOnly ? false : true,
    ...(sendToKitchen
      ? {
          kitchenStatus: args.orderPayload.kitchenStatus || "new",
          kotSentAt: args.orderPayload.kotSentAt || nowIso,
          kotVersion: args.orderPayload.kotVersion || 1,
          acceptedAt: nowIso
        }
      : {
          kitchenStatus: "completed",
          completedAt: nowIso,
          servedAt: nowIso
        }),
    ...auditCreate({ status: orderStatus })
  });

  batch.set(orderRef, orderDoc as Record<string, unknown>, { merge: true });

  if (saleRef && args.salePayload) {
    batch.set(
      saleRef,
      stripUndefinedDeep({
        ...args.salePayload,
        orderId: orderRef.id,
        source: "pos",
        createdAt: serverTimestamp()
      }) as Record<string, unknown>
    );
  }

  if (!kitchenOnly) {
    for (const p of args.paymentDocs) {
      const pref = doc(collection(db, "payments"));
      batch.set(
        pref,
        stripUndefinedDeep({
          ...p,
          orderId: orderRef.id,
          ...auditCreate({ status: "captured" })
        }) as Record<string, unknown>
      );
    }
  }

  if (args.kitchenTicket) {
    const kref = doc(collection(db, "kitchenTickets"));
    batch.set(
      kref,
      stripUndefinedDeep({
        ...args.kitchenTicket,
        orderId: orderRef.id,
        ...auditCreate({ status: "sent" })
      }) as Record<string, unknown>
    );
  }

  if (args.tableId) {
    batch.set(
      doc(db, "tables", args.tableId),
      stripUndefinedDeep({
        status: sendToKitchen ? "occupied" : "cleaning",
        currentOrderId: sendToKitchen ? orderRef.id : null,
        ...auditUpdate()
      }) as Record<string, unknown>,
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
    batch.set(
      mref,
      stripUndefinedDeep({
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
      }) as Record<string, unknown>
    );
  }

  const logRef = doc(collection(db, "activityLogs"));
  batch.set(
    logRef,
    stripUndefinedDeep({
      ...auditCreate({ status: "recorded" }),
      action: "bill_created",
      entityType: "orders",
      entityId: orderRef.id,
      message: `Bill ${args.orderPayload.invoiceNo || orderRef.id} ${sendToKitchen ? "paid · sent to kitchen" : "completed"} for ${num(args.orderPayload.total)}`,
      actorId: actorId(),
      meta: {
        total: args.orderPayload.total,
        invoiceNo: args.orderPayload.invoiceNo || null,
        sendToKitchen
      }
    }) as Record<string, unknown>
  );

  await batch.commit();
  return { orderId: orderRef.id, saleId: saleRef?.id ?? null };
}

export async function collectUnpaidPayment(args: {
  orderId: string;
  mode?: "cash" | "upi";
  cash?: number;
  upi?: number;
  markServed?: boolean;
}) {
  const ref = doc(db, "orders", args.orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found");
  const order = snap.data() as OrderDoc;
  const ot = String(order.orderType || order.platform || "").toLowerCase();
  if (ot.includes("swiggy") || ot.includes("zomato") || order.countsAsRevenue === false) {
    throw new Error("Swiggy/Zomato is kitchen only — add those sales manually each week");
  }
  const due = Math.max(0, num(order.balanceDue != null ? order.balanceDue : order.total));
  if (due <= 0) throw new Error("Nothing due on this order");

  const parts: Array<{ mode: "cash" | "upi"; amount: number }> = [];
  if (args.cash != null || args.upi != null) {
    const cash = Math.max(0, num(args.cash));
    const upi = Math.max(0, num(args.upi));
    if (cash > 0) parts.push({ mode: "cash", amount: cash });
    if (upi > 0) parts.push({ mode: "upi", amount: upi });
  } else if (args.mode) {
    parts.push({ mode: args.mode, amount: due });
  }
  const amount = parts.reduce((s, p) => s + p.amount, 0);
  if (amount <= 0) throw new Error("Enter cash and/or UPI amount");
  if (amount + 0.009 < due) throw new Error(`Payment short · due ${due}, got ${amount}`);

  const paymentLines = [...(order.payments || [])];
  for (const p of parts) {
    const pref = doc(collection(db, "payments"));
    await setDoc(pref, {
      ...auditCreate({ status: "captured" }),
      orderId: args.orderId,
      invoiceNo: order.invoiceNo || "",
      mode: p.mode,
      amount: p.amount,
      date: isoDate(),
      status: "captured",
      isDeleted: false
    });
    paymentLines.push({ id: pref.id, mode: p.mode, amount: p.amount, paidAt: new Date().toISOString() });
  }

  const paidTotal = num(order.paidTotal) + amount;
  const balanceDue = Math.max(0, num(order.total) - paidTotal);
  const kitchenReady =
    order.kitchenStatus === "ready" ||
    order.kitchenStatus === "packed" ||
    order.status === "ready" ||
    order.status === "packed";
  const markDone = args.markServed !== false && kitchenReady && balanceDue <= 0.009;

  await updateDoc(ref, {
    paidTotal,
    balanceDue,
    payments: paymentLines,
    payLater: false,
    paymentStatus: balanceDue <= 0.009 ? "paid" : "partial",
    ...(markDone
      ? {
          status: "completed",
          kitchenStatus: "completed",
          completedAt: new Date().toISOString(),
          servedAt: new Date().toISOString()
        }
      : {}),
    ...auditUpdate()
  });

  if (balanceDue <= 0.009) {
    const cashAmt = parts.filter((p) => p.mode === "cash").reduce((s, p) => s + p.amount, 0);
    const upiAmt = parts.filter((p) => p.mode === "upi").reduce((s, p) => s + p.amount, 0);
    // Avoid double-counting when checkout already wrote a sale, or a prior collect did
    const existingSaleId = order.saleId ? String(order.saleId) : "";
    let saleRef = existingSaleId ? doc(db, "sales", existingSaleId) : null;
    if (!saleRef) {
      const byOrder = await getDocs(query(collection(db, "sales"), where("orderId", "==", args.orderId)));
      const live = byOrder.docs.find((d) => {
        const st = String(d.data().status || "").toLowerCase();
        return !d.data().isDeleted && st !== "void";
      });
      if (live) saleRef = live.ref;
    }
    if (!saleRef) saleRef = doc(collection(db, "sales"));
    const prev = saleRef ? (await getDoc(saleRef)).data() : null;
    const nextCash = num(prev?.cashAmount) + cashAmt;
    const nextUpi = num(prev?.otherOnlineAmount ?? prev?.onlineAmount) + upiAmt;
    await setDoc(
      saleRef,
      {
        date: String(prev?.date || order.date || isoDate()).slice(0, 10),
        orderId: args.orderId,
        cashAmount: nextCash,
        otherOnlineAmount: nextUpi,
        onlineAmount: nextUpi,
        swiggyAmount: num(prev?.swiggyAmount),
        zomatoAmount: num(prev?.zomatoAmount),
        totalAmount: nextCash + nextUpi,
        countsAsRevenue: true,
        source: prev?.source || "pos_collect",
        method: parts.length > 1 || (nextCash > 0 && nextUpi > 0) ? "mixed" : parts[0]?.mode || "cash",
        notes: prev?.notes || `Collect ${order.invoiceNo || args.orderId}`,
        isDeleted: false,
        status: "settled",
        ...(prev?.createdAt ? {} : { createdAt: serverTimestamp() }),
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    if (!order.saleId || order.saleId !== saleRef.id) {
      await updateDoc(ref, { saleId: saleRef.id, ...auditUpdate() });
    }
  }

  return { amount, balanceDue, invoiceNo: order.invoiceNo || null };
}

export async function markOrderDelivered(orderId: string) {
  const ref = doc(db, "orders", orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found");
  const order = snap.data() as OrderDoc;
  const ot = String(order.orderType || order.platform || "").toLowerCase();
  const isPlatform = ot.includes("swiggy") || ot.includes("zomato") || order.countsAsRevenue === false;
  // Platform tickets: kitchen workflow only — no shop payment required
  if (
    !isPlatform &&
    (num(order.balanceDue) > 0.01 || order.payLater || order.paymentStatus === "unpaid")
  ) {
    throw new Error("Collect unpaid amount before delivering");
  }
  await updateDoc(ref, {
    status: "completed",
    kitchenStatus: "completed",
    servedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...(isPlatform
      ? { paymentStatus: "paid", balanceDue: 0, payLater: false, countsAsRevenue: false }
      : {}),
    ...auditUpdate()
  });
}

export async function softCancelOrder(orderId: string, reason: string, restoreInventory = false) {
  const orderRef = doc(db, "orders", orderId);
  const orderSnap = await getDoc(orderRef);
  const order = orderSnap.exists() ? (orderSnap.data() as OrderDoc) : null;

  const batch = writeBatch(db);
  batch.set(
    orderRef,
    {
      status: "cancelled",
      cancelledReason: reason,
      held: false,
      payLater: false,
      isDeleted: false,
      ...auditUpdate()
    },
    { merge: true }
  );

  // Void linked sales so cash/online reverse when a bill is cancelled
  const voidSalePayload = {
    isDeleted: true,
    status: "void",
    countsAsRevenue: false,
    deletedReason: reason,
    ...auditUpdate({ status: "void" })
  };
  const voided = new Set<string>();
  const voidSale = (saleId: string) => {
    if (!saleId || voided.has(saleId)) return;
    voided.add(saleId);
    batch.set(doc(db, "sales", saleId), voidSalePayload, { merge: true });
  };

  if (order?.saleId) voidSale(String(order.saleId));

  const [byOrderId, byDate] = await Promise.all([
    getDocs(query(collection(db, "sales"), where("orderId", "==", orderId))),
    order?.date
      ? getDocs(query(collection(db, "sales"), where("date", "==", String(order.date).slice(0, 10))))
      : Promise.resolve(null)
  ]);
  for (const d of byOrderId.docs) voidSale(d.id);

  const invoiceNo = String(order?.invoiceNo || "").trim();
  if (byDate && invoiceNo) {
    for (const d of byDate.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.isDeleted || String(data.status || "").toLowerCase() === "void") continue;
      const inv = String(data.invoiceNo || "");
      const notes = String(data.notes || "");
      if (inv === invoiceNo || notes.includes(invoiceNo)) voidSale(d.id);
    }
  }

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
