import { escapeHtml, printHtmlDocument } from "@/lib/printHtmlDocument";
import { inr, num } from "@/lib/utils";
import type { WhatsAppBillPayload, WhatsAppShopSettings } from "./whatsappBill";

/** Printable bill HTML — Save as PDF from the browser dialog. Includes regards. */
export function buildBillPdfHtml(bill: WhatsAppBillPayload, settings?: WhatsAppShopSettings | null) {
  const shop = escapeHtml(settings?.shopName || "The Kilogram");
  const address = escapeHtml(settings?.address || "");
  const phone = escapeHtml(settings?.phone || "");
  const when = new Date(bill.at || Date.now()).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const cust = escapeHtml(bill.customerName || "Guest");
  const custPhone = escapeHtml(bill.customerPhone || "");
  const billNo = escapeHtml(bill.billNo || bill.billId || "—");
  const rows = (bill.items || [])
    .map((it) => {
      const qty = num(it.qty) || 1;
      const line = num(it.price) * qty;
      const title = escapeHtml(
        [it.name, it.variantLabel || it.variant].filter(Boolean).join(" · ") || "Item"
      );
      return `<tr>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;">${title}${it.note ? `<div style="font-size:11px;color:#666;">${escapeHtml(it.note)}</div>` : ""}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:center;">${qty}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(inr(line))}</td>
      </tr>`;
    })
    .join("");
  const total = bill.grandTotal != null ? bill.grandTotal : bill.total ?? 0;
  return `
  <div style="font-family:Segoe UI,system-ui,sans-serif;max-width:420px;margin:0 auto;color:#111;">
    <div style="text-align:center;margin-bottom:14px;">
      <div style="font-size:22px;font-weight:900;color:#E56B2C;">${shop}</div>
      ${address ? `<div style="font-size:12px;margin-top:4px;">${address}</div>` : ""}
      ${phone ? `<div style="font-size:12px;">📞 ${phone}</div>` : ""}
    </div>
    <div style="font-size:13px;margin-bottom:10px;line-height:1.5;">
      <div><strong>Bill:</strong> ${billNo}</div>
      <div><strong>Date:</strong> ${escapeHtml(when)}</div>
      <div><strong>Customer:</strong> ${cust}${custPhone ? ` · ${custPhone}` : ""}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f7f7f7;">
          <th style="text-align:left;padding:6px 4px;">Item</th>
          <th style="text-align:center;padding:6px 4px;">Qty</th>
          <th style="text-align:right;padding:6px 4px;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="3" style="padding:8px;color:#888;">No items</td></tr>`}</tbody>
    </table>
    <div style="margin-top:12px;font-size:15px;font-weight:800;text-align:right;">
      Total: ${escapeHtml(inr(total))}
    </div>
    <div style="margin-top:28px;padding-top:12px;border-top:1px dashed #ccc;text-align:center;font-size:13px;line-height:1.6;">
      <div>Thank you for ordering from ${shop}.</div>
      <div style="margin-top:10px;font-weight:700;">With regards,</div>
      <div style="font-weight:800;color:#E56B2C;">${shop}</div>
    </div>
  </div>`;
}

export function printBillPdf(bill: WhatsAppBillPayload, settings?: WhatsAppShopSettings | null) {
  printHtmlDocument(buildBillPdfHtml(bill, settings), {
    title: `Bill ${bill.billNo || bill.billId || ""}`
  });
}
