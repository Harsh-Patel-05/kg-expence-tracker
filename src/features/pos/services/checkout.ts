import { isoDate, num } from "@/lib/utils";
import type { CartLine, CouponDoc, MenuItemDoc, OrderDoc, PaymentDoc, PosRole } from "../types";
import { canApplyDiscount, canComplimentary } from "../utils/permissions";
import { computeBillTotals, paidTotal } from "../utils/pricing";
import { planRecipeDeductions, loadInventory } from "./inventoryPos";
import {
  allocateInvoiceAndKitchenToken,
  collectUnpaidPayment,
  completeOrderTransaction,
  createKitchenTicket,
  getPosSettings,
  logActivity,
  markOrderDelivered,
  nextInvoiceNumber,
  nextKitchenToken,
  saveOrderDoc,
  softCancelOrder,
  createRefund,
  setTableStatus
} from "./posFirestore";
import { expectedPrepMinutes } from "@/features/orders/engine/statusMachine";
import type { WithId } from "../hooks/useRestaurantCollection";
import type { usePosStore } from "../store/posStore";

type Store = ReturnType<typeof usePosStore.getState> & {
  tokenNumber?: string | null;
  platformOrderId?: string | null;
  kotVersion?: number | null;
};

function nextKotMeta(store: Store, nowIso: string) {
  const isUpdate = Boolean(store.orderId);
  const prev = Math.max(0, num(store.kotVersion));
  const kotVersion = isUpdate ? prev + 1 : 1;
  return {
    kotVersion: Math.max(1, kotVersion),
    kotSentAt: nowIso,
    ...(isUpdate
      ? {
          kitchenUpdatedAt: nowIso,
          kitchenModified: true
        }
      : { kitchenModified: false })
  };
}

function kitchenEtaFields(store: Store, nowIso: string) {
  const itemCount = store.lines.reduce((s, l) => s + num(l.qty), 0);
  const etaMinutes = expectedPrepMinutes(String(store.orderType || "takeaway"), itemCount);
  return {
    etaMinutes,
    expectedReadyAt: new Date(Date.parse(nowIso) + etaMinutes * 60_000).toISOString()
  };
}

function assertPlatformOrderId(store: Store) {
  const t = String(store.orderType || "").toLowerCase();
  if (!t.includes("swiggy") && !t.includes("zomato")) return;
  const id = String(store.platformOrderId || "").trim();
  if (!id) {
    throw new Error(
      t.includes("zomato")
        ? "Enter Zomato order ID before placing the order"
        : "Enter Swiggy order ID before placing the order"
    );
  }
}

async function resolveKitchenToken(store: Store): Promise<string> {
  const existing = String(store.tokenNumber || "").trim();
  // Keep token when editing an open / held kitchen order
  if (store.orderId && existing) return existing.replace(/^0+/, "") || existing;
  return nextKitchenToken({
    orderType: store.orderType,
    platformOrderId: store.platformOrderId
  });
}

export async function holdCurrentBill(store: Store, role: PosRole) {
  if (!store.lines.length) throw new Error("Cart is empty");
  const settings = await getPosSettings();
  const tax = { ...store.tax, cgstRate: 0, sgstRate: 0, igstRate: 0, enableIgst: false, mode: "exclusive" as const };
  const totals = computeBillTotals({
    lines: store.lines,
    discount: store.discount,
    couponCode: store.couponCode,
    charges: store.charges,
    tax,
    maxDiscountPct: settings.maxDiscountPct ?? store.maxDiscountPct,
    roundOffEnabled: settings.roundOffEnabled
  });

  const orderId = await saveOrderDoc(store.orderId, {
    date: isoDate(),
    orderType: store.orderType,
    items: store.lines,
    notes: store.notes,
    kitchenNote: store.kitchenNote,
    customerNote: store.customerNote,
    customerId: store.customerId,
    customerName: store.customerName,
    customerPhone: store.customerPhone,
    tableId: store.tableId,
    tableName: store.tableName,
    subtotal: totals.subtotal,
    itemDiscountTotal: totals.itemDiscountTotal,
    billDiscount: totals.billDiscount,
    couponDiscount: totals.couponDiscount,
    taxAmount: totals.taxAmount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    charges: store.charges,
    chargesTotal: totals.chargesTotal,
    roundOff: totals.roundOff,
    total: totals.total,
    paidTotal: 0,
    balanceDue: totals.total,
    payments: [],
    discount: store.discount,
    couponCode: store.couponCode,
    taxMode: "exclusive",
    held: true,
    heldAt: new Date().toISOString(),
    status: "held"
  });

  if (store.tableId) await setTableStatus(store.tableId, "occupied", orderId);
  await logActivity({
    action: "bill_held",
    entityType: "orders",
    entityId: orderId,
    message: `Held bill for ${totals.total}`,
    actorRole: role
  });
  return orderId;
}

/** Pay later: assign bill #, push to kitchen/KDS, leave unpaid for later collection. */
export async function payLaterCurrentBill(store: Store, role: PosRole) {
  if (!store.lines.length) throw new Error("Cart is empty");
  assertPlatformOrderId(store);

  // Clear zero/leftover discount so nothing blocks kitchen
  if (num(store.discount?.value) <= 0 && store.discount?.type !== "none" && store.discount?.type !== "item") {
    store.setDiscount({ type: "none", value: 0, reason: "" });
  }

  let settings: Awaited<ReturnType<typeof getPosSettings>>;
  try {
    settings = await getPosSettings();
  } catch {
    settings = {
      id: "pos",
      restaurantName: "The Kilogram",
      tax: { cgstRate: 0, sgstRate: 0, igstRate: 0, mode: "exclusive", enableIgst: false },
      invoicePrefix: "KG",
      nextInvoiceNo: 1,
      maxDiscountPct: 100,
      allowNegativeStock: true,
      roundOffEnabled: true
    } as Awaited<ReturnType<typeof getPosSettings>>;
  }

  const tax = { ...store.tax, cgstRate: 0, sgstRate: 0, igstRate: 0, enableIgst: false, mode: "exclusive" as const };
  const totals = computeBillTotals({
    lines: store.lines,
    discount: store.discount,
    couponCode: store.couponCode,
    charges: store.charges,
    tax,
    maxDiscountPct: settings.maxDiscountPct ?? store.maxDiscountPct ?? 100,
    roundOffEnabled: settings.roundOffEnabled
  });

  let invoiceNo: string;
  let tokenNumber: string;
  try {
    ({ invoiceNo, tokenNumber } = await allocateInvoiceAndKitchenToken({
      orderType: store.orderType,
      platformOrderId: store.platformOrderId,
      existingInvoice: store.invoiceNo,
      existingToken: store.orderId ? store.tokenNumber : null
    }));
  } catch {
    // Never block kitchen if counter transaction fails
    const n = Date.now().toString().slice(-5);
    invoiceNo = store.invoiceNo || `KG-${new Date().getFullYear()}-${n}`;
    tokenNumber = String(store.platformOrderId || store.tokenNumber || n).replace(/^0+/, "") || n;
  }

  const nowIso = new Date().toISOString();
  const eta = kitchenEtaFields(store, nowIso);

  const platformOrderId = String(store.platformOrderId || "").trim() || undefined;
  const orderId = await saveOrderDoc(store.orderId, {
    date: isoDate(),
    invoiceNo,
    tokenNumber: platformOrderId || tokenNumber,
    orderType: store.orderType,
    platform: store.orderType === "swiggy" || store.orderType === "zomato" ? store.orderType : undefined,
    platformOrderId,
    items: store.lines,
    notes: store.notes,
    kitchenNote: store.kitchenNote,
    customerNote: store.customerNote,
    customerId: store.customerId,
    customerName: store.customerName || "Walk-in",
    customerPhone: store.customerPhone,
    tableId: store.tableId,
    tableName: store.tableName,
    subtotal: totals.subtotal,
    itemDiscountTotal: totals.itemDiscountTotal,
    billDiscount: totals.billDiscount,
    couponDiscount: totals.couponDiscount,
    taxAmount: totals.taxAmount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    charges: store.charges,
    chargesTotal: totals.chargesTotal,
    roundOff: totals.roundOff,
    total: totals.total,
    paidTotal: 0,
    balanceDue: totals.total,
    payments: [],
    discount: store.discount?.type === "none" || num(store.discount?.value) <= 0
      ? { type: "none", value: 0, reason: "" }
      : {
          type: store.discount.type,
          value: num(store.discount.value),
          reason: String(store.discount.reason || "Bill discount")
        },
    couponCode: store.couponCode,
    taxMode: "exclusive",
    held: false,
    heldAt: nowIso,
    payLater: true,
    paymentStatus: "unpaid",
    kitchenStatus: "new",
    countsAsRevenue: !(
      String(store.orderType || "").toLowerCase().includes("swiggy") ||
      String(store.orderType || "").toLowerCase().includes("zomato")
    ),
    ...nextKotMeta(store, nowIso),
    ...(store.orderId ? {} : { acceptedAt: nowIso }),
    etaMinutes: eta.etaMinutes,
    expectedReadyAt: eta.expectedReadyAt,
    // confirmed so KDS / POS strip always pick it up (held was easy to miss)
    status: "confirmed"
  });

  // Best-effort kitchen ticket — order is already saved for KDS via orders collection
  try {
    await Promise.all([
      createKitchenTicket({
        orderId,
        tableName: store.tableName,
        orderType: store.orderType,
        kitchenNote: store.kitchenNote,
        items: store.lines.map((l) => ({
          lineId: l.lineId,
          name: l.name,
          nameHi: l.nameHi || "",
          qty: l.qty,
          note: l.note,
          kitchenNote: l.kitchenNote || l.note || store.kitchenNote
        }))
      }),
      store.tableId ? setTableStatus(store.tableId, "occupied", orderId) : Promise.resolve()
    ]);
  } catch (e) {
    console.warn("Kitchen ticket secondary write failed (order still saved)", e);
  }

  void logActivity({
    action: "bill_pay_later",
    entityType: "orders",
    entityId: orderId,
    message: `Pay later ${invoiceNo} · sent to kitchen · ${totals.total}`,
    actorRole: role
  });

  const itemNotes = store.lines
    .map((l) => String(l.kitchenNote || l.note || "").trim())
    .filter(Boolean);
  const notes = [store.kitchenNote, store.notes, ...itemNotes].map((n) => String(n || "").trim()).filter(Boolean);

  return {
    orderId,
    invoiceNo,
    tokenNumber: platformOrderId || tokenNumber,
    totals,
    kitchenNote: store.kitchenNote || "",
    notes,
    lines: store.lines.slice(),
    orderType: store.orderType,
    tableName: store.tableName,
    customerName: store.customerName
  };
}

export async function chargeCurrentBill(args: {
  store: Store;
  role: PosRole;
  menuItems: Array<WithId<MenuItemDoc>>;
  coupons?: CouponDoc[];
}) {
  const { store, role, menuItems } = args;
  if (!store.lines.length) throw new Error("Cannot bill without items");
  assertPlatformOrderId(store);

  for (const line of store.lines) {
    if (num(line.qty) <= 0) throw new Error("Negative or zero quantity is not allowed");
    if (line.complimentary) {
      if (!canComplimentary(role)) throw new Error("Manager permission required for complimentary items");
      if (!String(line.complimentaryReason || "").trim()) throw new Error("Complimentary reason required");
    }
  }

  const isPlatform =
    String(store.orderType || "").toLowerCase().includes("swiggy") ||
    String(store.orderType || "").toLowerCase().includes("zomato");

  // Settings + inventory in parallel (skip inventory for platform kitchen-only tickets)
  const [settings, inventory] = await Promise.all([
    getPosSettings().catch(
      () =>
        ({
          id: "pos",
          maxDiscountPct: 100,
          allowNegativeStock: true,
          roundOffEnabled: true
        }) as Awaited<ReturnType<typeof getPosSettings>>
    ),
    isPlatform ? Promise.resolve([]) : loadInventory().catch(() => [])
  ]);
  const tax = {
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
    mode: "exclusive" as const,
    enableIgst: false
  };
  store.setTaxConfig({
    ...tax,
    maxDiscountPct: settings.maxDiscountPct ?? 100,
    roundOffEnabled: settings.roundOffEnabled
  });

  // Normalize empty / zero discount so it never blocks kitchen settle
  const discVal = num(store.discount?.value);
  const discType = String(store.discount?.type || "none");
  if (discType !== "none" && discType !== "item" && discVal <= 0) {
    store.setDiscount({ type: "none", value: 0, reason: "" });
  } else if ((discType === "percent" || discType === "bill") && discVal > 0) {
    if (!canApplyDiscount(role, discVal, settings.maxDiscountPct ?? 20)) {
      throw new Error("Discount exceeds allowed limit for your role");
    }
  } else if (discType === "fixed" && discVal > 0) {
    if (!canApplyDiscount(role, 0, settings.maxDiscountPct ?? 20)) {
      throw new Error("You cannot apply bill discounts");
    }
  }
  // Reason optional — default label when cashier skips it
  if (discVal > 0 && (discType === "percent" || discType === "fixed" || discType === "bill") && !String(store.discount?.reason || "").trim()) {
    store.setDiscount({
      type: discType as "percent" | "fixed" | "bill",
      value: discVal,
      reason: "Bill discount"
    });
  }

  const totals = computeBillTotals({
    lines: store.lines,
    discount: store.discount,
    couponCode: store.couponCode,
    coupons: args.coupons,
    charges: store.charges,
    tax,
    taxMode: "exclusive",
    maxDiscountPct: settings.maxDiscountPct ?? 20,
    roundOffEnabled: settings.roundOffEnabled !== false
  });

  const paid = isPlatform ? 0 : paidTotal(store.payments);
  if (!isPlatform) {
    if (paid + 0.009 < totals.total) {
      throw new Error(`Payment incomplete. Balance due ${totals.total - paid}`);
    }
    if (store.payments.length === 0) throw new Error("Add at least one payment");
  }

  const plan = isPlatform
    ? { adjustments: [] as Array<{ id: string; delta: number; item: string; unit?: string }>, missing: [] as string[], insufficient: [] as string[] }
    : planRecipeDeductions({
        cart: store.lines,
        menuItems,
        inventory,
        allowNegative: true
      });
  // Never block kitchen / settle on stock — deduct what we can; rest is ignored
  if (plan.insufficient.length) {
    const blocked = new Set(
      plan.insufficient.map((s) => String(s).split(" (need")[0].trim().toLowerCase())
    );
    plan.adjustments = plan.adjustments.filter((a) => !blocked.has(String(a.item || "").toLowerCase()));
  }

  let invoiceNo: string;
  let tokenNumber: string;
  try {
    ({ invoiceNo, tokenNumber } = await allocateInvoiceAndKitchenToken({
      orderType: store.orderType,
      platformOrderId: store.platformOrderId,
      existingInvoice: store.invoiceNo,
      existingToken: store.orderId ? store.tokenNumber : null
    }));
  } catch {
    const n = Date.now().toString().slice(-5);
    invoiceNo = store.invoiceNo || `KG-${new Date().getFullYear()}-${n}`;
    tokenNumber = String(store.platformOrderId || store.tokenNumber || n).replace(/^0+/, "") || n;
  }
  const cash = store.payments.filter((p) => p.mode === "cash").reduce((s, p) => s + p.amount, 0);
  const online = store.payments
    .filter((p) => p.mode !== "cash" && p.mode !== "credit")
    .reduce((s, p) => s + p.amount, 0);

  const nowIso = new Date().toISOString();
  const eta = kitchenEtaFields(store, nowIso);
  const platformOrderId = String(store.platformOrderId || "").trim() || undefined;

  const orderPayload: OrderDoc = {
    date: isoDate(),
    invoiceNo,
    tokenNumber: platformOrderId || tokenNumber,
    orderType: store.orderType,
    platform: store.orderType === "swiggy" || store.orderType === "zomato" ? store.orderType : undefined,
    platformOrderId,
    items: store.lines,
    notes: store.notes || "",
    kitchenNote: store.kitchenNote || "",
    customerNote: store.customerNote || "",
    customerId: store.customerId ?? null,
    customerName: store.customerName || "Walk-in",
    customerPhone: store.customerPhone ?? null,
    tableId: store.tableId ?? null,
    tableName: store.tableName ?? null,
    subtotal: totals.subtotal,
    itemDiscountTotal: totals.itemDiscountTotal,
    billDiscount: totals.billDiscount,
    couponDiscount: totals.couponDiscount,
    taxAmount: totals.taxAmount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    charges: store.charges || [],
    chargesTotal: totals.chargesTotal,
    roundOff: totals.roundOff,
    total: totals.total,
    paidTotal: isPlatform ? 0 : paid,
    balanceDue: isPlatform ? totals.total : 0,
    payments: isPlatform
      ? []
      : store.payments.map((p) => ({
          id: p.id,
          mode: p.mode,
          amount: p.amount,
          ...(p.reference ? { reference: p.reference } : {}),
          ...(p.paidAt ? { paidAt: p.paidAt } : {})
        })),
    discount: {
      type: store.discount?.type || "none",
      value: num(store.discount?.value),
      reason: store.discount?.reason || ""
    },
    couponCode: store.couponCode ?? null,
    taxMode: "exclusive",
    held: false,
    payLater: isPlatform,
    paymentStatus: isPlatform ? "unpaid" : "paid",
    kitchenStatus: "new",
    status: "confirmed",
    countsAsRevenue: !isPlatform,
    ...nextKotMeta(store, nowIso),
    ...(store.orderId ? {} : { acceptedAt: nowIso }),
    etaMinutes: eta.etaMinutes,
    expectedReadyAt: eta.expectedReadyAt
  };

  const paymentDocs: Array<Omit<PaymentDoc, "createdAt" | "updatedAt" | "createdBy" | "updatedBy">> =
    isPlatform
      ? []
      : store.payments.map((p) => ({
          orderId: "",
          invoiceNo,
          mode: p.mode,
          amount: p.amount,
          ...(p.reference ? { reference: p.reference } : {}),
          date: isoDate(),
          status: "captured",
          isDeleted: false
        }));

  // Swiggy/Zomato: kitchen ticket only — sales entered manually every week (not in shop balance)
  const result = await completeOrderTransaction({
    orderPayload,
    existingOrderId: store.orderId,
    sendToKitchen: true,
    kitchenOnlyNoSale: isPlatform,
    salePayload: isPlatform
      ? null
      : {
          date: isoDate(),
          invoiceNo,
          cashAmount: cash,
          otherOnlineAmount: online,
          onlineAmount: online,
          swiggyAmount: 0,
          zomatoAmount: 0,
          totalAmount: totals.total,
          countsAsRevenue: true,
          notes: `POS ${invoiceNo} · ${store.lines.map((l) => `${l.name}×${l.qty}`).join(", ")}`.slice(0, 500),
          method: store.payments.length > 1 ? "mixed" : store.payments[0]?.mode || "cash"
        },
    paymentDocs,
    kitchenTicket: {
      orderId: "",
      tableName: store.tableName ?? null,
      orderType: store.orderType,
      items: store.lines.map((l) => ({
        lineId: l.lineId,
        name: l.name,
        nameHi: l.nameHi || "",
        qty: l.qty,
        note: l.note || "",
        kitchenNote: l.kitchenNote || store.kitchenNote || ""
      })),
      version: 1,
      printedAt: null,
      status: "sent",
      isDeleted: false
    },
    inventoryAdjustments: plan.adjustments,
    tableId: store.tableId,
    couponId: null
  });

  return { ...result, invoiceNo, tokenNumber: platformOrderId || tokenNumber, totals, missingRecipes: plan.missing };
}

export async function cancelOrder(orderId: string, reason: string, role: PosRole) {
  if (!reason.trim()) throw new Error("Cancel reason required");
  await softCancelOrder(orderId, reason);
  await logActivity({
    action: "bill_cancelled",
    entityType: "orders",
    entityId: orderId,
    message: reason,
    actorRole: role
  });
}

/** Collect cash/UPI (or split) on a pay-later / unpaid kitchen order. */
export async function collectUnpaidOrder(args: {
  orderId: string;
  mode?: "cash" | "upi";
  cash?: number;
  upi?: number;
  role: PosRole;
  markServed?: boolean;
}) {
  const result = await collectUnpaidPayment({
    orderId: args.orderId,
    mode: args.mode,
    cash: args.cash,
    upi: args.upi,
    markServed: args.markServed
  });
  await logActivity({
    action: "payment_collected",
    entityType: "orders",
    entityId: args.orderId,
    message: `Collected ${result.amount} for ${result.invoiceNo || args.orderId}`,
    actorRole: args.role
  });
  return result;
}

export async function deliverPaidOrder(orderId: string, role: PosRole) {
  await markOrderDelivered(orderId);
  await logActivity({
    action: "order_delivered",
    entityType: "orders",
    entityId: orderId,
    message: `Delivered ${orderId}`,
    actorRole: role
  });
}

export async function refundOrder(args: {
  orderId: string;
  invoiceNo?: string;
  amount: number;
  reason: string;
  type: "full" | "partial" | "item" | "payment";
  role: PosRole;
}) {
  if (!args.reason.trim()) throw new Error("Refund reason required");
  return createRefund({
    orderId: args.orderId,
    invoiceNo: args.invoiceNo,
    type: args.type,
    amount: args.amount,
    reason: args.reason,
    approvedBy: null,
    inventoryRestored: false,
    status: "approved",
    isDeleted: false
  });
}

export function splitLinesByEqual(lines: CartLine[], parts: number): CartLine[][] {
  const n = Math.max(2, Math.floor(parts));
  const buckets: CartLine[][] = Array.from({ length: n }, () => []);
  lines.forEach((line, i) => {
    buckets[i % n].push({ ...line, lineId: `${line.lineId}_s${i % n}` });
  });
  return buckets;
}
