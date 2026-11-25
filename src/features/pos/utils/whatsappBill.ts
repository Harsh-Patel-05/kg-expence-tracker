import { inr } from "@/lib/utils";

export type WhatsAppBillItem = {
  name: string;
  nameHi?: string;
  qty: number;
  price: number;
  note?: string;
  variantLabel?: string;
  variant?: string;
};

export type WhatsAppBillPayload = {
  billNo?: string;
  billId?: string;
  at?: string;
  customerName?: string;
  customerPhone?: string;
  orderType?: string;
  channel?: string;
  items: WhatsAppBillItem[];
  subtotal?: number;
  discount?: number;
  charges?: number;
  total?: number;
  grandTotal?: number;
  paymentLabel?: string;
  cashAmount?: number;
  onlineAmount?: number;
  otherOnlineAmount?: number;
  swiggyAmount?: number;
  zomatoAmount?: number;
};

export type WhatsAppShopSettings = {
  shopName?: string;
  address?: string;
  phone?: string;
  upiId?: string;
  ratingsUrl?: string;
};

function cleanVar(v: unknown) {
  const s = String(v || "").trim();
  return !s || /^default$/i.test(s) ? "" : s;
}

/** Normalize to international digits without + (e.g. 9198XXXXXXXX). */
export function normalizeWhatsAppPhone(raw: string | null | undefined) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  if (d.length < 11 || d.length > 15) return "";
  return d;
}

function paymentLabel(bill: WhatsAppBillPayload) {
  if (bill.paymentLabel) return bill.paymentLabel;
  const parts: string[] = [];
  if (bill.cashAmount) parts.push("Cash");
  if (bill.otherOnlineAmount || bill.onlineAmount) parts.push("Online");
  if (bill.swiggyAmount) parts.push("Swiggy");
  if (bill.zomatoAmount) parts.push("Zomato");
  return parts.join(" + ") || "Paid";
}

function lineTitle(it: WhatsAppBillItem) {
  const name = String(it.name || it.nameHi || "Item").trim();
  const size = cleanVar(it.variantLabel || it.variant);
  if (!size) return name;
  const compact = (x: string) =>
    String(x || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/gms?/g, "g");
  if (compact(name).includes(compact(size))) return name;
  return `${name} (${size})`;
}

function orderChannelLabel(bill: WhatsAppBillPayload) {
  const ch = String(bill.channel || bill.orderType || "takeaway").toLowerCase();
  if (ch.includes("swiggy")) return "Swiggy";
  if (ch.includes("zomato")) return "Zomato";
  if (ch.includes("delivery")) return "Delivery";
  return "Takeaway";
}

export function buildWhatsAppBillMessage(bill: WhatsAppBillPayload, settings?: WhatsAppShopSettings | null) {
  const shopName = String(settings?.shopName || "The Kilogram").trim() || "The Kilogram";
  const when = new Date(bill.at || Date.now()).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const cust = String(bill.customerName || "").trim();
  const lines = [
    `🙏 Thank you for ordering from *${shopName}*!`,
    "",
    cust ? `👤 Customer: ${cust}` : null,
    `🧾 Bill: ${bill.billNo || bill.billId || "—"}`,
    `📅 ${when}`,
    `🥡 ${orderChannelLabel(bill)}`,
    "",
    "*Your order*"
  ].filter((x) => x != null) as string[];

  (bill.items || []).forEach((it) => {
    const qty = Number(it.qty) || 1;
    const amt = (Number(it.price) || 0) * qty;
    lines.push(`• ${qty}× ${lineTitle(it)} — ${inr(amt)}`);
    if (it.note) lines.push(`   📝 ${it.note}`);
  });

  lines.push("");
  if (bill.subtotal != null) lines.push(`Subtotal: ${inr(bill.subtotal)}`);
  if (bill.discount) lines.push(`Discount: −${inr(bill.discount)}`);
  if (bill.charges) lines.push(`Charges: ${inr(bill.charges)}`);
  lines.push(`*Total: ${inr(bill.grandTotal != null ? bill.grandTotal : bill.total ?? 0)}*`);
  lines.push(`Paid: ${paymentLabel(bill)}`);

  lines.push("");
  const address = String(settings?.address || "").trim();
  const phone = String(settings?.phone || "").trim();
  const upiId = String(settings?.upiId || "").trim();
  const ratingsUrl = String(settings?.ratingsUrl || "").trim();
  if (address) lines.push(`📍 ${address}`);
  if (phone) lines.push(`📞 ${phone}`);
  if (upiId) lines.push(`💳 UPI: ${upiId}`);
  if (ratingsUrl) {
    lines.push("");
    lines.push("⭐ Loved the food? Rate us here:");
    lines.push(ratingsUrl);
  }
  lines.push("");
  lines.push("Thank you for ordering with us.");
  lines.push("With regards,");
  lines.push(shopName);

  return lines.join("\n");
}

export function whatsAppShareUrl(phoneDigits: string, text: string) {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

export function shareBillOnWhatsApp(
  bill: WhatsAppBillPayload,
  opts?: { phone?: string; settings?: WhatsAppShopSettings | null; open?: boolean }
) {
  const phone = normalizeWhatsAppPhone(opts?.phone || bill.customerPhone || "");
  if (!phone) {
    return { ok: false as const, error: "Enter customer mobile (10-digit WhatsApp number)" };
  }
  const text = buildWhatsAppBillMessage(bill, opts?.settings);
  const url = whatsAppShareUrl(phone, text);
  if (opts?.open !== false) {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) return { ok: true as const, url, phone, blocked: true as const };
  }
  return { ok: true as const, url, phone };
}

export function canShareWhatsAppBill(bill: WhatsAppBillPayload | null | undefined) {
  if (!bill?.items?.length) return false;
  const ch = String(bill.channel || bill.orderType || "takeaway").toLowerCase();
  if (ch.includes("swiggy") || ch.includes("zomato")) return false;
  return true;
}