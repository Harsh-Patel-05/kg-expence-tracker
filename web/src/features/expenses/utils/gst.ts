import { num } from "@/lib/utils";
import type { ExpenseDoc } from "@/features/tasks/types";

export function splitGst(args: {
  amount: number;
  taxInclusive?: boolean;
  rate?: number;
  interstate?: boolean;
}): { taxable: number; cgst: number; sgst: number; igst: number; total: number } {
  const amount = Math.max(0, num(args.amount));
  const rate = Math.max(0, num(args.rate ?? 5));
  const inclusive = !!args.taxInclusive;
  let taxable = amount;
  let tax = 0;
  if (rate > 0) {
    if (inclusive) {
      taxable = amount / (1 + rate / 100);
      tax = amount - taxable;
    } else {
      tax = (amount * rate) / 100;
      taxable = amount;
    }
  }
  const half = tax / 2;
  if (args.interstate) {
    return { taxable: round2(taxable), cgst: 0, sgst: 0, igst: round2(tax), total: round2(taxable + tax) };
  }
  return { taxable: round2(taxable), cgst: round2(half), sgst: round2(half), igst: 0, total: round2(taxable + tax) };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Map paidFrom ↔ paymentMethod for dual dashboard compatibility */
export function toPaidFrom(method: string): "cash" | "bank" {
  return method === "cash" ? "cash" : "bank";
}

export function toVanillaPaymentMethod(status: "paid" | "unpaid", paidFrom: "cash" | "bank" | "online"): "cash" | "online" | "unpaid" {
  if (status === "unpaid") return "unpaid";
  return paidFrom === "cash" ? "cash" : "online";
}

export function expenseMonthKey(e: Pick<ExpenseDoc, "date">) {
  return String(e.date || "").slice(0, 7);
}

export function sumByCategory(expenses: ExpenseDoc[]) {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (e.isDeleted || e.archived) continue;
    const key = e.category || "misc";
    map.set(key, (map.get(key) || 0) + num(e.amount));
  }
  return [...map.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}

export function sumByVendor(expenses: ExpenseDoc[]) {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (e.isDeleted || e.archived) continue;
    const key = e.vendorName || "Unassigned";
    map.set(key, (map.get(key) || 0) + num(e.amount));
  }
  return [...map.entries()].map(([vendor, total]) => ({ vendor, total })).sort((a, b) => b.total - a.total);
}

export function gstSummary(expenses: ExpenseDoc[]) {
  return expenses.reduce(
    (acc, e) => {
      if (e.isDeleted || e.archived) return acc;
      acc.taxable += num(e.taxableAmount);
      acc.cgst += num(e.cgst);
      acc.sgst += num(e.sgst);
      acc.igst += num(e.igst);
      acc.tds += num(e.tds);
      acc.gross += num(e.amount);
      return acc;
    },
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, tds: 0, gross: 0 }
  );
}

export function validateInvoiceUnique(
  invoiceNumber: string | undefined,
  existing: Array<ExpenseDoc & { id?: string }>,
  excludeId?: string
) {
  if (!invoiceNumber?.trim()) return true;
  const needle = invoiceNumber.trim().toLowerCase();
  return !existing.some((e) => e.id !== excludeId && String(e.invoiceNumber || "").toLowerCase() === needle && !e.isDeleted);
}

export function checklistProgress(checklist?: Array<{ done: boolean }>) {
  if (!checklist?.length) return 0;
  const done = checklist.filter((c) => c.done).length;
  return Math.round((done / checklist.length) * 100);
}
