import { inr } from "@/lib/utils";
import { escapeHtml, printHtmlDocument } from "@/lib/printHtmlDocument";
import type { OrderDoc } from "../types";

/** GST-style receipt via iframe print (no pop-up). */
export function printGstReceipt(order: Partial<OrderDoc> & { restaurantName?: string; gstin?: string }) {
  const lines = (order.items || [])
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.name)} x${l.qty}</td><td style="text-align:right">${inr(l.complimentary ? 0 : l.price * l.qty)}</td></tr>`
    )
    .join("");
  printHtmlDocument(
    `<div style="font-family:ui-monospace,Menlo,monospace;color:#111">
      <h1 style="font-size:16px;margin:0 0 4px">${escapeHtml(order.restaurantName || "The Kilogram")}</h1>
      <p style="opacity:.7;font-size:12px;margin:0">RestaurantPilot ERP</p>
      <div style="color:#666;font-size:12px">Invoice: ${escapeHtml(order.invoiceNo || "—")} · ${escapeHtml(order.date || "")}</div>
      <div style="color:#666;font-size:12px">${escapeHtml(order.orderType || "")} · ${escapeHtml(order.tableName || order.customerName || "Walk-in")}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px">${lines}</table>
      <div style="color:#666;font-size:12px;margin-top:8px">Subtotal ${inr(order.subtotal || 0)}</div>
      <div style="font-weight:700;font-size:15px;margin-top:10px">Grand Total ${inr(order.total || 0)}</div>
      <div style="color:#666;font-size:12px;margin-top:16px">Thank you · Scan QR on counter for digital invoice</div>
    </div>`,
    { title: String(order.invoiceNo || "Receipt") }
  );
}

export function printKitchenTicket(order: Partial<OrderDoc>) {
  const lines = (order.items || [])
    .map(
      (l) =>
        `<div><strong>${escapeHtml(l.name)}</strong> × ${l.qty}${
          l.kitchenNote || l.note
            ? `<div style="font-size:12px;color:#444;margin-top:2px">${escapeHtml(l.kitchenNote || l.note)}</div>`
            : ""
        }</div>`
    )
    .join("");
  const headNote = order.kitchenNote || order.notes || "";
  printHtmlDocument(
    `<div>
      <h2>KOT · ${escapeHtml(order.invoiceNo || order.tokenNumber || "—")}</h2>
      <div style="opacity:.7;font-size:12px;margin:4px 0 10px">${escapeHtml(order.orderType || "")}${
        order.tableName ? ` · ${escapeHtml(order.tableName)}` : ""
      }${order.customerName ? ` · ${escapeHtml(order.customerName)}` : ""}</div>
      ${headNote ? `<div style="font-size:12px;color:#444"><strong>Notes:</strong> ${escapeHtml(headNote)}</div>` : ""}
      ${lines}
    </div>`,
    { title: "KOT" }
  );
}
