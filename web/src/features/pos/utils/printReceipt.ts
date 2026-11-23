import { inr } from "@/lib/utils";
import type { OrderDoc } from "../types";

/** Opens a printable GST-style receipt in a new window (browser print / PDF). */
export function printGstReceipt(order: Partial<OrderDoc> & { restaurantName?: string; gstin?: string }) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=420,height=720");
  if (!win) throw new Error("Pop-up blocked — allow pop-ups to print");
  const lines = (order.items || [])
    .map(
      (l) =>
        `<tr><td>${escape(l.name)} x${l.qty}</td><td style="text-align:right">${inr(l.complimentary ? 0 : l.price * l.qty)}</td></tr>`
    )
    .join("");
  win.document.write(`<!doctype html><html><head><title>${order.invoiceNo || "Receipt"}</title>
    <style>
      body{font-family:ui-monospace,Menlo,monospace;padding:16px;color:#111}
      h1{font-size:16px;margin:0 0 4px} .muted{color:#666;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
      td{padding:4px 0;border-bottom:1px dashed #ddd}
      .tot{font-weight:700;font-size:15px;margin-top:10px}
    </style></head><body>
    <h1>${escape(order.restaurantName || "The Kilogram")}</h1>
    <p style="opacity:.7;font-size:12px">RestaurantPilot ERP</p>
    <div class="muted">GSTIN: ${escape(order.gstin || "—")}</div>
    <div class="muted">Invoice: ${escape(order.invoiceNo || "—")} · ${escape(order.date || "")}</div>
    <div class="muted">${escape(order.orderType || "")} · ${escape(order.tableName || order.customerName || "Walk-in")}</div>
    <table>${lines}</table>
    <div class="muted">Subtotal ${inr(order.subtotal || 0)}</div>
    <div class="muted">CGST ${inr(order.cgst || 0)} · SGST ${inr(order.sgst || 0)}</div>
    <div class="tot">Grand Total ${inr(order.total || 0)}</div>
    <div class="muted" style="margin-top:16px">Thank you · Scan QR on counter for digital invoice</div>
    <script>window.print()</script>
    </body></html>`);
  win.document.close();
}

function escape(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printKitchenTicket(order: Partial<OrderDoc>) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=360,height=560");
  if (!win) throw new Error("Pop-up blocked");
  const lines = (order.items || [])
    .map((l) => `<div><strong>${escape(l.name)}</strong> × ${l.qty}${l.kitchenNote || l.note ? `<div class="n">${escape(l.kitchenNote || l.note)}</div>` : ""}</div>`)
    .join("");
  win.document.write(`<!doctype html><html><head><title>KOT</title>
    <style>body{font-family:sans-serif;padding:12px} .n{font-size:12px;color:#444}</style></head>
    <body><h2>KOT · ${escape(order.tableName || order.orderType)}</h2>${lines}<script>window.print()</script></body></html>`);
  win.document.close();
}
