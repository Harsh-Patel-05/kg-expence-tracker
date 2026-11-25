import type { CartLine, OrderType, PaymentLine } from "../types";
import type { WhatsAppBillPayload } from "./whatsappBill";

const STORAGE_KEY = "kg_pos_last_bill_v1";

let memoryBill: WhatsAppBillPayload | null = null;

function readStorage(): WhatsAppBillPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WhatsAppBillPayload;
  } catch {
    return null;
  }
}

function writeStorage(bill: WhatsAppBillPayload | null) {
  try {
    if (!bill) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(bill));
  } catch {
    /* ignore quota / private mode */
  }
}

export function getLastPosBill(): WhatsAppBillPayload | null {
  return memoryBill || readStorage();
}

export function setLastPosBill(bill: WhatsAppBillPayload) {
  memoryBill = bill;
  writeStorage(bill);
}

export function clearLastPosBill() {
  memoryBill = null;
  writeStorage(null);
}

function paymentLabelFromPayments(payments: PaymentLine[], orderType: OrderType) {
  const cash = payments.filter((p) => p.mode === "cash").reduce((s, p) => s + p.amount, 0);
  const online = payments.filter((p) => p.mode !== "cash" && p.mode !== "credit").reduce((s, p) => s + p.amount, 0);
  const parts: string[] = [];
  if (cash > 0) parts.push("Cash");
  if (online > 0) parts.push("Online");
  if (orderType === "swiggy") parts.push("Swiggy");
  if (orderType === "zomato") parts.push("Zomato");
  return parts.join(" + ") || "Paid";
}

export function buildLastPosBillPayload(args: {
  invoiceNo: string;
  orderType: OrderType;
  lines: CartLine[];
  customerName?: string | null;
  customerPhone?: string | null;
  totals: {
    subtotal: number;
    itemDiscountTotal: number;
    billDiscount: number;
    couponDiscount: number;
    chargesTotal: number;
    total: number;
  };
  payments: PaymentLine[];
}): WhatsAppBillPayload {
  const cash = args.payments.filter((p) => p.mode === "cash").reduce((s, p) => s + p.amount, 0);
  const online = args.payments.filter((p) => p.mode !== "cash" && p.mode !== "credit").reduce((s, p) => s + p.amount, 0);
  const discount =
    Math.round(
      (args.totals.itemDiscountTotal + args.totals.billDiscount + args.totals.couponDiscount) * 100
    ) / 100;

  return {
    billNo: args.invoiceNo,
    at: new Date().toISOString(),
    customerName: args.customerName || undefined,
    customerPhone: args.customerPhone || undefined,
    orderType: args.orderType,
    channel: args.orderType,
    items: args.lines.map((l) => ({
      name: l.name,
      nameHi: l.nameHi,
      qty: l.qty,
      price: l.complimentary ? 0 : l.price,
      note: l.note || l.kitchenNote,
      variantLabel: l.nameSub || l.selection?.size
    })),
    subtotal: args.totals.subtotal,
    discount: discount > 0 ? discount : undefined,
    charges: args.totals.chargesTotal > 0 ? args.totals.chargesTotal : undefined,
    total: args.totals.total,
    grandTotal: args.totals.total,
    cashAmount: cash > 0 ? cash : undefined,
    onlineAmount: online > 0 ? online : undefined,
    paymentLabel: paymentLabelFromPayments(args.payments, args.orderType)
  };
}