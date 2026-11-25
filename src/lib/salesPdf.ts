import { countsAsRevenueSale } from "@/lib/balanceMath";
import { escapeHtml, printHtmlDocument } from "@/lib/printHtmlDocument";
import { inr, num } from "@/lib/utils";

export type SaleRow = Record<string, unknown> & { id?: string; date?: string };

export function saleAmountsDetailed(s: SaleRow) {
  const cash = num(s.cashAmount);
  const swiggy = num(s.swiggyAmount);
  const zomato = num(s.zomatoAmount);
  const otherOnline = num(s.otherOnlineAmount);
  const legacyOnline = num(s.onlineAmount);
  const online =
    swiggy > 0 || zomato > 0 || otherOnline > 0 ? otherOnline : legacyOnline;
  const total = cash + online + swiggy + zomato;
  return { cash, swiggy, zomato, otherOnline, legacyOnline, online, total };
}

export function salePaymentModeLabel(s: SaleRow): string {
  const a = saleAmountsDetailed(s);
  const parts: string[] = [];
  if (a.cash > 0) parts.push(`Cash ${inr(a.cash)}`);
  if (a.otherOnline > 0 || (a.legacyOnline > 0 && a.swiggy === 0 && a.zomato === 0)) {
    const upi = a.otherOnline > 0 ? a.otherOnline : a.legacyOnline;
    parts.push(`Online ${inr(upi)}`);
  }
  if (a.swiggy > 0) parts.push(`Swiggy ${inr(a.swiggy)}`);
  if (a.zomato > 0) parts.push(`Zomato ${inr(a.zomato)}`);
  if (!parts.length) {
    const m = String(s.method || "—");
    return m.charAt(0).toUpperCase() + m.slice(1);
  }
  return parts.join(" + ");
}

function saleCreatedAtMillis(s: SaleRow): number {
  const ca = s.createdAt as { toMillis?: () => number; toDate?: () => Date } | string | undefined;
  if (ca && typeof ca === "object" && typeof ca.toMillis === "function") return ca.toMillis();
  if (ca && typeof ca === "object" && typeof ca.toDate === "function") return ca.toDate().getTime();
  if (typeof ca === "string") return Date.parse(ca) || 0;
  return Date.parse(String(s.date || "")) || 0;
}

export function saleOrderTimeLabel(s: SaleRow): string {
  const ca = s.createdAt as { toDate?: () => Date } | string | undefined;
  let d: Date | null = null;
  if (ca && typeof ca === "object" && typeof ca.toDate === "function") d = ca.toDate();
  else if (typeof ca === "string") {
    const t = new Date(ca);
    if (!Number.isNaN(t.getTime())) d = t;
  }
  if (d) {
    return d.toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  return String(s.date || "").slice(0, 10) || "—";
}

function dateInPeriod(date: string, from: string, to: string) {
  const d = String(date || "").slice(0, 10);
  return d >= from && d <= to;
}

export function downloadSalesPdf(
  kind: "simple" | "full",
  sales: SaleRow[],
  from: string,
  to: string
): string | null {
  let toDate = to;
  if (toDate < from) toDate = from;
  const rows = [...sales]
    .filter((s) => countsAsRevenueSale(s) && s?.date && dateInPeriod(String(s.date), from, toDate))
    .sort((a, b) => saleCreatedAtMillis(a) - saleCreatedAtMillis(b));

  if (!rows.length) return "No sales for selected dates";

  let cashT = 0;
  let onlineT = 0;
  let swiggyT = 0;
  let zomatoT = 0;
  let totalT = 0;
  rows.forEach((s) => {
    const a = saleAmountsDetailed(s);
    cashT += a.cash;
    onlineT += a.otherOnline > 0 || a.swiggy > 0 || a.zomato > 0 ? a.otherOnline : a.legacyOnline;
    swiggyT += a.swiggy;
    zomatoT += a.zomato;
    totalT += a.total;
  });

  const title =
    from === toDate ? `Sales report · ${from}` : `Sales report · ${from} to ${toDate}`;
  const mode = kind === "full" ? "full" : "simple";

  const simpleRows = rows
    .map((s) => {
      const a = saleAmountsDetailed(s);
      return `<tr>
        <td>${escapeHtml(saleOrderTimeLabel(s))}</td>
        <td style="text-align:right">${escapeHtml(inr(a.total))}</td>
        <td>${escapeHtml(salePaymentModeLabel(s))}</td>
      </tr>`;
    })
    .join("");

  const fullRows = rows
    .map((s) => {
      const a = saleAmountsDetailed(s);
      return `<tr>
        <td>${escapeHtml(saleOrderTimeLabel(s))}</td>
        <td>${escapeHtml(String(s.billNo || s.billId || s.id || "—"))}</td>
        <td>${escapeHtml(String(s.orderType || s.source || "—"))}</td>
        <td style="text-align:right">${escapeHtml(inr(a.cash))}</td>
        <td style="text-align:right">${escapeHtml(inr(a.otherOnline || (a.swiggy || a.zomato ? 0 : a.legacyOnline)))}</td>
        <td style="text-align:right">${escapeHtml(inr(a.swiggy))}</td>
        <td style="text-align:right">${escapeHtml(inr(a.zomato))}</td>
        <td style="text-align:right"><b>${escapeHtml(inr(a.total))}</b></td>
        <td>${escapeHtml(salePaymentModeLabel(s))}</td>
      </tr>`;
    })
    .join("");

  const body =
    mode === "simple"
      ? `<style>
          .sales-pdf{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:8px;color:#111;background:#fff}
          .sales-pdf h1{font-size:20px;margin:0 0 4px}
          .sales-pdf h2{font-size:15px;margin:0 0 12px;font-weight:600}
          .sales-pdf .muted{color:#666;font-size:12px;margin:0 0 12px}
          .sales-pdf table{width:100%;border-collapse:collapse;font-size:12px}
          .sales-pdf th,.sales-pdf td{border-bottom:1px solid #e5e5e5;padding:8px 6px;text-align:left;vertical-align:top}
          .sales-pdf th{font-size:11px;text-transform:uppercase;letter-spacing:.02em;color:#444}
          .sales-pdf tfoot td{border-top:2px solid #111;padding-top:10px}
        </style>
        <div class="sales-pdf">
         <h1>The Kilogram</h1>
         <h2>${escapeHtml(title)}</h2>
         <p class="muted">Order time · Amount · Payment mode · ${rows.length} bills</p>
         <table>
           <thead><tr><th>Order time</th><th>Amount</th><th>Payment mode</th></tr></thead>
           <tbody>${simpleRows}</tbody>
           <tfoot><tr><td><b>Total</b></td><td style="text-align:right"><b>${escapeHtml(inr(totalT))}</b></td><td></td></tr></tfoot>
         </table>
        </div>`
      : `<style>
          .sales-pdf{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:8px;color:#111;background:#fff}
          .sales-pdf h1{font-size:20px;margin:0 0 4px}
          .sales-pdf h2{font-size:15px;margin:0 0 12px;font-weight:600}
          .sales-pdf .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:0 0 16px;padding:12px;border:1px solid #ddd;border-radius:8px}
          .sales-pdf table{width:100%;border-collapse:collapse;font-size:12px}
          .sales-pdf th,.sales-pdf td{border-bottom:1px solid #e5e5e5;padding:8px 6px;text-align:left;vertical-align:top}
          .sales-pdf th{font-size:11px;text-transform:uppercase;letter-spacing:.02em;color:#444}
        </style>
        <div class="sales-pdf">
         <h1>The Kilogram</h1>
         <h2>${escapeHtml(title)} · Full details</h2>
         <div class="summary">
           <div><b>Bills:</b> ${rows.length}</div>
           <div><b>Total sales:</b> ${escapeHtml(inr(totalT))}</div>
           <div><b>Cash:</b> ${escapeHtml(inr(cashT))}</div>
           <div><b>Online / UPI:</b> ${escapeHtml(inr(onlineT))}</div>
           <div><b>Swiggy:</b> ${escapeHtml(inr(swiggyT))}</div>
           <div><b>Zomato:</b> ${escapeHtml(inr(zomatoT))}</div>
         </div>
         <table>
           <thead>
             <tr>
               <th>Order time</th><th>Bill</th><th>Type</th>
               <th>Cash</th><th>Online</th><th>Swiggy</th><th>Zomato</th>
               <th>Total</th><th>Payment mode</th>
             </tr>
           </thead>
           <tbody>${fullRows}</tbody>
         </table>
        </div>`;

  printHtmlDocument(body, { title });
  return null;
}