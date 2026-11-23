import { isoDate, num } from "@/lib/utils";
import type { CartLine, CouponDoc, MenuItemDoc, OrderDoc, PaymentDoc, PosRole } from "../types";
import { canApplyDiscount, canComplimentary } from "../utils/permissions";
import { computeBillTotals, paidTotal } from "../utils/pricing";
import { planRecipeDeductions, loadInventory } from "./inventoryPos";
import {
  completeOrderTransaction,
  getPosSettings,
  logActivity,
  nextInvoiceNumber,
  saveOrderDoc,
  softCancelOrder,
  createRefund,
  setTableStatus
} from "./posFirestore";
import type { WithId } from "../hooks/useRestaurantCollection";
import type { usePosStore } from "../store/posStore";

type Store = ReturnType<typeof usePosStore.getState>;

export async function holdCurrentBill(store: Store, role: PosRole) {
  if (!store.lines.length) throw new Error("Cart is empty");
  const settings = await getPosSettings();
  const totals = computeBillTotals({
    lines: store.lines,
    discount: store.discount,
    couponCode: store.couponCode,
    charges: store.charges,
    tax: store.tax,
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
    taxMode: store.tax.mode,
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

export async function chargeCurrentBill(args: {
  store: Store;
  role: PosRole;
  menuItems: Array<WithId<MenuItemDoc>>;
  coupons?: CouponDoc[];
}) {
  const { store, role, menuItems } = args;
  if (!store.lines.length) throw new Error("Cannot bill without items");

  for (const line of store.lines) {
    if (num(line.qty) <= 0) throw new Error("Negative or zero quantity is not allowed");
    if (line.complimentary) {
      if (!canComplimentary(role)) throw new Error("Manager permission required for complimentary items");
      if (!String(line.complimentaryReason || "").trim()) throw new Error("Complimentary reason required");
    }
  }

  const settings = await getPosSettings();
  store.setTaxConfig({
    ...settings.tax,
    maxDiscountPct: settings.maxDiscountPct,
    roundOffEnabled: settings.roundOffEnabled
  });

  if (store.discount.type === "percent" || store.discount.type === "bill") {
    if (!canApplyDiscount(role, num(store.discount.value), settings.maxDiscountPct ?? 20)) {
      throw new Error("Discount exceeds allowed limit for your role");
    }
  }
  if ((store.discount.type === "percent" || store.discount.type === "fixed" || store.discount.type === "bill") && !store.discount.reason) {
    throw new Error("Discount reason is required");
  }

  const totals = computeBillTotals({
    lines: store.lines,
    discount: store.discount,
    couponCode: store.couponCode,
    coupons: args.coupons,
    charges: store.charges,
    tax: { ...defaultTaxMerge(store, settings) },
    taxMode: settings.tax?.mode || store.tax.mode,
    maxDiscountPct: settings.maxDiscountPct ?? 20,
    roundOffEnabled: settings.roundOffEnabled !== false
  });

  const paid = paidTotal(store.payments);
  if (paid + 0.009 < totals.total && store.orderType !== "dine_in") {
    // allow credit / part payment only when explicitly using credit mode covering balance
    const hasCredit = store.payments.some((p) => p.mode === "credit");
    if (!hasCredit) throw new Error(`Payment incomplete. Balance due ${totals.total - paid}`);
  }
  if (store.payments.length === 0) throw new Error("Add at least one payment");

  const inventory = await loadInventory();
  const plan = planRecipeDeductions({
    cart: store.lines,
    menuItems,
    inventory,
    allowNegative: settings.allowNegativeStock === true
  });
  if (plan.insufficient.length) {
    throw new Error(`Insufficient stock: ${plan.insufficient.join(", ")}`);
  }

  const invoiceNo = store.invoiceNo || (await nextInvoiceNumber());
  const cash = store.payments.filter((p) => p.mode === "cash").reduce((s, p) => s + p.amount, 0);
  const online = store.payments
    .filter((p) => p.mode !== "cash" && p.mode !== "credit")
    .reduce((s, p) => s + p.amount, 0);

  const orderPayload: OrderDoc = {
    date: isoDate(),
    invoiceNo,
    orderType: store.orderType,
    items: store.lines,
    notes: store.notes,
    kitchenNote: store.kitchenNote,
    customerNote: store.customerNote,
    customerId: store.customerId,
    customerName: store.customerName || (store.customerId ? null : "Walk-in"),
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
    paidTotal: paid,
    balanceDue: Math.max(0, totals.total - paid),
    payments: store.payments,
    discount: store.discount,
    couponCode: store.couponCode,
    taxMode: settings.tax?.mode || "exclusive",
    held: false,
    status: "completed",
    kotSentAt: new Date().toISOString(),
    kotVersion: 1
  };

  const paymentDocs: Array<Omit<PaymentDoc, "createdAt" | "updatedAt" | "createdBy" | "updatedBy">> =
    store.payments.map((p) => ({
      orderId: "",
      invoiceNo,
      mode: p.mode,
      amount: p.amount,
      reference: p.reference,
      date: isoDate(),
      status: "captured",
      isDeleted: false
    }));

  const result = await completeOrderTransaction({
    orderPayload,
    existingOrderId: store.orderId,
    salePayload: {
      date: isoDate(),
      cashAmount: cash,
      otherOnlineAmount: online,
      onlineAmount: online,
      swiggyAmount: store.orderType === "swiggy" ? totals.total : 0,
      zomatoAmount: store.orderType === "zomato" ? totals.total : 0,
      totalAmount: totals.total,
      notes: `POS ${invoiceNo} · ${store.lines.map((l) => `${l.name}×${l.qty}`).join(", ")}`.slice(0, 500),
      method: store.payments.length > 1 ? "mixed" : store.payments[0]?.mode || "cash"
    },
    paymentDocs,
    kitchenTicket: {
      orderId: "",
      tableName: store.tableName,
      orderType: store.orderType,
      items: store.lines.map((l) => ({
        lineId: l.lineId,
        name: l.name,
        qty: l.qty,
        note: l.note,
        kitchenNote: l.kitchenNote || store.kitchenNote
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

  return { ...result, invoiceNo, totals, missingRecipes: plan.missing };
}

function defaultTaxMerge(store: Store, settings: Awaited<ReturnType<typeof getPosSettings>>) {
  return {
    cgstRate: settings.tax?.cgstRate ?? store.tax.cgstRate,
    sgstRate: settings.tax?.sgstRate ?? store.tax.sgstRate,
    igstRate: settings.tax?.igstRate ?? store.tax.igstRate,
    mode: settings.tax?.mode ?? store.tax.mode,
    enableIgst: settings.tax?.enableIgst ?? false,
    gstin: settings.gstin || settings.tax?.gstin
  };
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
