import { num } from "@/lib/utils";
import { countsAsRevenueSale, isPaidExpense } from "@/lib/balanceMath";
import type { ExpenseDoc } from "@/features/tasks/types";
import type { InventoryItemDoc, PurchaseEntryDoc, WastageDoc } from "@/features/inventory/types";
import { availableQty } from "@/features/inventory/utils/alerts";
import { gstSummary, sumByCategory, sumByVendor } from "@/features/expenses/utils/gst";
import type { SupplierLedgerRow } from "@/features/suppliers/types";
import type { AttendanceDoc, EmployeeDoc, SalaryDoc } from "@/features/hr/types";
import { attendanceStatsForMonth } from "@/features/hr/utils/payroll";

export type ReportFilters = {
  from: string;
  to: string;
  branch?: string;
  category?: string;
  supplier?: string;
  paymentMode?: string;
  status?: string;
};

export type SaleLike = {
  date?: string;
  cashAmount?: number;
  onlineAmount?: number;
  total?: number;
  amount?: number;
  paymentMethod?: string;
  channel?: string;
  item?: string;
  category?: string;
  staffName?: string;
  branch?: string;
};

export function inDateRange(date: string | undefined, from: string, to: string) {
  const d = String(date || "").slice(0, 10);
  if (!d) return false;
  return d >= from && d <= to;
}

export function salesSummary(sales: SaleLike[], filters: ReportFilters) {
  const rows = sales.filter(
    (s) => countsAsRevenueSale(s) && inDateRange(s.date, filters.from, filters.to)
  );
  const cash = rows.reduce((a, s) => a + num(s.cashAmount), 0);
  const online = rows.reduce((a, s) => a + num(s.onlineAmount), 0);
  const total = rows.reduce((a, s) => a + (num(s.total) || num(s.amount) || num(s.cashAmount) + num(s.onlineAmount)), 0);
  const byDay = new Map<string, number>();
  const byHour = new Array(24).fill(0);
  rows.forEach((s) => {
    const d = String(s.date || "").slice(0, 10);
    const amt = num(s.total) || num(s.amount) || num(s.cashAmount) + num(s.onlineAmount);
    byDay.set(d, (byDay.get(d) || 0) + amt);
    // if timestamp-like not available, skip hour
  });
  return {
    count: rows.length,
    cash,
    online,
    total: total || cash + online,
    daily: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value })),
    byHour
  };
}

export function expenseReport(expenses: ExpenseDoc[], filters: ReportFilters) {
  const rows = expenses.filter((e) => !e.isDeleted && !e.archived && inDateRange(e.date, filters.from, filters.to));
  const filtered = filters.category && filters.category !== "all" ? rows.filter((e) => e.category === filters.category) : rows;
  const vendorFiltered =
    filters.supplier && filters.supplier !== "all" ? filtered.filter((e) => (e.vendorName || "") === filters.supplier) : filtered;
  const total = vendorFiltered.reduce((a, e) => a + num(e.amount), 0);
  const paid = vendorFiltered.filter((e) => isPaidExpense(e)).reduce((a, e) => a + num(e.amount), 0);
  const unpaid = vendorFiltered.filter((e) => !isPaidExpense(e)).reduce((a, e) => a + num(e.amount), 0);
  return {
    total,
    paid,
    unpaid,
    count: vendorFiltered.length,
    byCategory: sumByCategory(vendorFiltered),
    byVendor: sumByVendor(vendorFiltered),
    gst: gstSummary(vendorFiltered)
  };
}

export function purchaseReport(purchases: PurchaseEntryDoc[], filters: ReportFilters) {
  const rows = purchases.filter((p) => !p.isDeleted && inDateRange(p.date || p.invoiceDate, filters.from, filters.to));
  const filtered =
    filters.supplier && filters.supplier !== "all"
      ? rows.filter((p) => (p.seller || p.vendorName || "") === filters.supplier)
      : rows;
  const total = filtered.reduce((a, p) => a + num(p.price ?? p.total), 0);
  const unpaid = filtered.filter((p) => (p.paidStatus || p.paymentStatus) !== "paid").reduce((a, p) => a + num(p.price ?? p.total), 0);
  const bySupplier = new Map<string, number>();
  filtered.forEach((p) => {
    const k = p.seller || p.vendorName || "Unknown";
    bySupplier.set(k, (bySupplier.get(k) || 0) + num(p.price ?? p.total));
  });
  return {
    total,
    unpaid,
    count: filtered.length,
    gst: filtered.reduce((a, p) => a + num(p.gstAmount), 0),
    bySupplier: [...bySupplier.entries()].map(([supplier, value]) => ({ supplier, value })).sort((a, b) => b.value - a.value)
  };
}

export function inventoryReport(items: InventoryItemDoc[]) {
  const active = items.filter((i) => !i.isDeleted && !i.archived);
  const low = active.filter((i) => {
    const avail = availableQty(i);
    const thr = num(i.threshold || i.minStock);
    return thr > 0 && avail <= thr;
  });
  const out = active.filter((i) => availableQty(i) <= 0);
  const value = active.reduce((a, i) => a + availableQty(i) * num(i.avgCost || i.lastPurchaseCost || i.costPrice), 0);
  return { skus: active.length, low: low.length, out: out.length, value, lowItems: low.slice(0, 20), outItems: out.slice(0, 20) };
}

export function wastageReport(wastage: WastageDoc[], filters: ReportFilters) {
  const rows = wastage.filter((w) => !w.isDeleted && inDateRange(w.date, filters.from, filters.to));
  const cost = rows.reduce((a, w) => a + num(w.costImpact), 0);
  const byReason = new Map<string, number>();
  rows.forEach((w) => byReason.set(w.reason || "other", (byReason.get(w.reason || "other") || 0) + num(w.costImpact)));
  return {
    count: rows.length,
    cost,
    byReason: [...byReason.entries()].map(([reason, value]) => ({ reason, value })).sort((a, b) => b.value - a.value)
  };
}

export function profitReport(args: {
  salesTotal: number;
  expenseTotal: number;
  purchasePaid: number;
  foodCost?: number;
}) {
  const gross = args.salesTotal - num(args.foodCost ?? args.purchasePaid);
  const net = args.salesTotal - args.expenseTotal - args.purchasePaid;
  const margin = args.salesTotal > 0 ? (net / args.salesTotal) * 100 : 0;
  const foodCostPct = args.salesTotal > 0 ? (num(args.foodCost ?? args.purchasePaid) / args.salesTotal) * 100 : 0;
  return { gross, net, margin, foodCostPct, sales: args.salesTotal, expenses: args.expenseTotal, cogs: num(args.foodCost ?? args.purchasePaid) };
}

export function staffAttendanceReport(staff: EmployeeDoc[], attendance: AttendanceDoc[], month: string) {
  return staff
    .filter((s) => s.active !== false)
    .map((s) => {
      const stats = attendanceStatsForMonth(s.name, month, attendance);
      return { name: s.name, department: s.department || "", ...stats };
    });
}

export function salaryReport(salaries: SalaryDoc[], filters: ReportFilters) {
  const rows = salaries.filter((s) => {
    const m = String(s.month || "").slice(0, 7);
    const from = filters.from.slice(0, 7);
    const to = filters.to.slice(0, 7);
    return m >= from && m <= to;
  });
  return {
    total: rows.reduce((a, s) => a + num(s.netSalary ?? s.amount), 0),
    paid: rows.filter((s) => s.status === "paid").reduce((a, s) => a + num(s.netSalary ?? s.amount), 0),
    unpaid: rows.filter((s) => s.status !== "paid").reduce((a, s) => a + num(s.netSalary ?? s.amount), 0),
    rows
  };
}

export function supplierAnalytics(ledger: SupplierLedgerRow[]) {
  return {
    topBySpend: [...ledger].sort((a, b) => b.purchases - a.purchases).slice(0, 10),
    topOutstanding: [...ledger].filter((l) => l.outstanding > 0).slice(0, 10),
    creditAlerts: ledger.filter((l) => l.creditLimit > 0 && l.creditUsed >= l.creditLimit * 0.9),
    overdue: ledger.filter((l) => l.overdue > 0)
  };
}

/** CSV helper */
export function toCsv(headers: string[], rows: Array<Array<string | number>>) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function escapeHtml(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function printReport(title: string, htmlBody: string) {
  // Lazy import path avoided — duplicate thin wrapper using same iframe approach as printHtmlDocument
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const idoc = iframe.contentDocument || win?.document;
  if (!win || !idoc) {
    iframe.remove();
    return;
  }
  const safeTitle = escapeHtml(title);
  idoc.open();
  idoc.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${safeTitle}</title>
    <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px;text-align:left} h1{font-size:18px}</style>
    </head><body><h1>${safeTitle}</h1>${htmlBody}</body></html>`);
  idoc.close();
  window.setTimeout(() => {
    try {
      win.focus();
      win.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 1500);
    }
  }, 300);
}
