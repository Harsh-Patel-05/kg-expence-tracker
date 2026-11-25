import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";

export type BookAdvanceItem = {
  productId?: string;
  name: string;
  qty: number;
  price: number;
  note?: string;
};

export type BookAdvanceInput = {
  scheduledAt: string;
  customerName: string;
  customerPhone?: string;
  grandTotal: number;
  advanceCash: number;
  advanceOnline: number;
  paymentReference?: string;
  customerNotes?: string;
  prepNotes?: string;
  fulfillmentType?: "pickup" | "delivery";
  items?: BookAdvanceItem[];
};

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function nextOrderNo(): Promise<{ orderNo: string; bookDate: string }> {
  const bookDate = isoDate();
  const ymd = bookDate.replace(/-/g, "");
  const counterId = `SO_${ymd}`;
  const counterRef = doc(db, "billCounters", counterId);
  try {
    const seq = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const n = (snap.exists() ? num(snap.data()?.seq) : 0) + 1;
      tx.set(
        counterRef,
        { seq: n, date: bookDate, kind: "scheduled", updatedAt: serverTimestamp() },
        { merge: true }
      );
      return n;
    });
    return { orderNo: `SO-${ymd}-${String(seq).padStart(4, "0")}`, bookDate };
  } catch {
    const seq = Number(String(Date.now()).slice(-4)) || 1;
    return { orderNo: `SO-${ymd}-${String(seq).padStart(4, "0")}`, bookDate };
  }
}

async function postAdvanceSale(
  payment: {
    id: string;
    cashAmount: number;
    onlineAmount: number;
    kind: string;
    at: string;
    businessDate: string;
  },
  order: { id: string; orderNo: string; customerName: string }
) {
  const cash = Math.max(0, num(payment.cashAmount));
  const online = Math.max(0, num(payment.onlineAmount));
  const amount = cash + online;
  if (!(amount > 0)) return null;
  const saleId = `SOADV-${payment.id}`;
  const payload = {
    userId: auth.currentUser?.uid ?? "owner",
    date: payment.businessDate,
    cashAmount: cash,
    swiggyAmount: 0,
    zomatoAmount: 0,
    otherOnlineAmount: online,
    onlineAmount: online,
    totalAmount: amount,
    method: cash > 0 && online > 0 ? "mixed" : online > 0 ? "online" : "cash",
    source: "scheduled_advance",
    revenueKind: "sale",
    /** Counts in today's total sales (Cash/Online) — owner request */
    countsAsRevenue: true,
    billId: saleId,
    billNo: order.orderNo,
    orderType: "Scheduled",
    scheduledOrderId: order.id,
    customerName: order.customerName,
    itemsCount: 0,
    status: "settled",
    notes: `${payment.kind || "advance"} · ${order.orderNo} · ${order.customerName || ""}`.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, "sales", saleId), payload, { merge: true });
  return saleId;
}

export async function bookScheduledAdvance(input: BookAdvanceInput) {
  const { orderNo, bookDate } = await nextOrderNo();
  const id = uid("so");
  let scheduledAt = String(input.scheduledAt || "").trim();
  if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0);
    scheduledAt = d.toISOString();
  }
  const items = (input.items || [])
    .filter((it) => String(it.name || "").trim() && num(it.qty) > 0)
    .map((it) => ({
      productId: it.productId || null,
      name: String(it.name).trim(),
      qty: Math.max(1, Math.round(num(it.qty))),
      price: Math.max(0, num(it.price)),
      note: String(it.note || "").trim()
    }));
  const itemsSubtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
  const grandTotal = Math.max(0, num(input.grandTotal) || itemsSubtotal);
  let advanceCash = Math.max(0, num(input.advanceCash));
  let advanceOnline = Math.max(0, num(input.advanceOnline));
  let advanceTotal = advanceCash + advanceOnline;
  if (grandTotal > 0 && advanceTotal > grandTotal + 0.009) {
    const scale = grandTotal / advanceTotal;
    advanceCash = Math.round(advanceCash * scale * 100) / 100;
    advanceOnline = Math.round(advanceOnline * scale * 100) / 100;
    advanceTotal = advanceCash + advanceOnline;
  }

  const payments: Array<Record<string, unknown>> = [];
  if (advanceTotal > 0) {
    const payId = uid("sopay");
    const payment = {
      id: payId,
      amount: advanceTotal,
      cashAmount: advanceCash,
      onlineAmount: advanceOnline,
      method: advanceCash > 0 && advanceOnline > 0 ? "mixed" : advanceOnline > 0 ? "online" : "cash",
      kind: grandTotal > 0 && advanceTotal + 0.009 >= grandTotal ? "full_advance" : "advance",
      reference: String(input.paymentReference || "").trim(),
      at: new Date().toISOString(),
      businessDate: isoDate(),
      saleId: null as string | null
    };
    payment.saleId = await postAdvanceSale(payment, {
      id,
      orderNo,
      customerName: input.customerName
    });
    payments.push(payment);
  }

  const received = payments.reduce((s, p) => s + num(p.amount), 0);
  const remaining = Math.max(0, Math.round((grandTotal - received) * 100) / 100);
  let paymentStatus = "unpaid";
  if (grandTotal <= 0) paymentStatus = received > 0 ? "paid" : "unpaid";
  else if (received <= 0.009) paymentStatus = "unpaid";
  else if (received + 0.009 >= grandTotal) paymentStatus = "paid";
  else paymentStatus = "partial";

  const fulfillmentType = input.fulfillmentType === "delivery" ? "delivery" : "pickup";
  const customerName = String(input.customerName || "").trim() || "Guest";

  const order = {
    id,
    orderNo,
    bookDate,
    orderCategory: "scheduled",
    customerName,
    customerPhone: String(input.customerPhone || "").trim(),
    items,
    subtotal: grandTotal || itemsSubtotal,
    discount: 0,
    deliveryCharge: 0,
    grandTotal,
    fulfillmentType,
    pickupNotes: "",
    prepNotes: String(input.prepNotes || "").trim(),
    customerNotes: String(input.customerNotes || "").trim(),
    scheduledAt,
    status: "confirmed",
    payments,
    amountReceived: Math.round(received * 100) / 100,
    remainingBalance: remaining,
    paymentStatus,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: auth.currentUser?.email || "staff"
  };

  await setDoc(doc(db, "scheduledOrders", id), {
    ...order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return { id, orderNo, salePosted: payments.some((p) => p.saleId) };
}