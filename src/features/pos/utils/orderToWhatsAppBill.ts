import { num } from "@/lib/utils";
import type { WhatsAppBillPayload } from "./whatsappBill";

/** Map a live/history order (or advance sale) into WhatsApp bill payload. */
export function liveOrderToWhatsAppBill(o: Record<string, any>): WhatsAppBillPayload {
  const rawItems: any[] = Array.isArray(o.items) && o.items.length ? o.items : Array.isArray(o.lines) ? o.lines : [];
  const items = rawItems.map((it) => ({
    name: String(it?.name || it?.nameHi || "Item"),
    nameHi: it?.nameHi ? String(it.nameHi) : undefined,
    qty: num(it?.qty) || 1,
    price: num(it?.price ?? it?.unitPrice),
    note: it?.note ? String(it.note) : undefined,
    variantLabel: it?.variantLabel || it?.variant ? String(it.variantLabel || it.variant) : undefined
  }));
  const total = num(o.grandTotal ?? o.total);
  return {
    billNo: String(o.invoiceNo || o.tokenNumber || o.id || "—"),
    billId: o.id ? String(o.id) : undefined,
    at: typeof o.createdAt === "string" ? o.createdAt : o.date || new Date().toISOString(),
    customerName: o.customerName ? String(o.customerName) : "",
    customerPhone: o.customerPhone ? String(o.customerPhone) : "",
    orderType: o.orderType ? String(o.orderType) : "takeaway",
    channel: String(o.channel || o.orderType || "takeaway"),
    items,
    subtotal: num(o.subtotal) || total,
    discount: num(o.discount),
    charges: num(o.chargesTotal),
    total,
    grandTotal: total,
    cashAmount: num(o.cashAmount),
    onlineAmount: num(o.onlineAmount),
    otherOnlineAmount: num(o.otherOnlineAmount),
    swiggyAmount: num(o.swiggyAmount),
    zomatoAmount: num(o.zomatoAmount)
  };
}

export function advanceSaleToWhatsAppBill(s: {
  id?: string;
  billNo?: string;
  date?: string;
  customerName?: string;
  notes?: string;
  cashAmount?: number;
  otherOnlineAmount?: number;
  onlineAmount?: number;
  totalAmount?: number;
}): WhatsAppBillPayload {
  const cash = num(s.cashAmount);
  const online = num(s.otherOnlineAmount ?? s.onlineAmount);
  const total = num(s.totalAmount) || cash + online;
  return {
    billNo: s.billNo || s.id,
    billId: s.id,
    at: s.date || new Date().toISOString(),
    customerName: s.customerName || "",
    orderType: "Scheduled",
    channel: "takeaway",
    items: [
      {
        name: s.notes || "Advance payment",
        qty: 1,
        price: total
      }
    ],
    subtotal: total,
    total,
    grandTotal: total,
    cashAmount: cash,
    otherOnlineAmount: online,
    onlineAmount: online,
    paymentLabel: cash && online ? "Cash + Online" : online ? "Online" : "Cash"
  };
}
