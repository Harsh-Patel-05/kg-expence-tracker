import { num } from "@/lib/utils";
import { countsAsRevenueSale, isPaidExpense, saleAmounts } from "@/lib/balanceMath";

export type TxKind = "Sale" | "Expense" | "Supplier paid" | "Supplier payment";

export type TransactionRow = {
  id: string;
  kind: TxKind;
  date: string;
  amount: number;
  label?: string;
};

export function buildTransactionHistory(args: {
  sales?: any[];
  expenses?: any[];
  supplierBills?: any[];
  supplierPayments?: any[];
}): TransactionRow[] {
  const sales = args.sales || [];
  const expenses = args.expenses || [];
  const supplierBills = args.supplierBills || [];
  const supplierPayments = args.supplierPayments || [];

  const rows: TransactionRow[] = [];

  for (const s of sales) {
    if (!countsAsRevenueSale(s)) continue;
    const a = saleAmounts(s);
    const date = String(s.date || "").slice(0, 10);
    // Shop sales only in default Sale rows (Swiggy/Zomato listed separately — not shop total)
    if (a.retail > 0) {
      rows.push({
        id: `sale-${s.id}`,
        kind: "Sale",
        date,
        amount: a.retail,
        label: s.billNo || s.notes || undefined
      });
    }
    if (a.swiggy > 0) {
      rows.push({
        id: `swiggy-${s.id}`,
        kind: "Sale",
        date,
        amount: a.swiggy,
        label: `Swiggy · ${s.billNo || s.id || ""}`.trim()
      });
    }
    if (a.zomato > 0) {
      rows.push({
        id: `zomato-${s.id}`,
        kind: "Sale",
        date,
        amount: a.zomato,
        label: `Zomato · ${s.billNo || s.id || ""}`.trim()
      });
    }
  }

  for (const e of expenses) {
    if (!isPaidExpense(e)) continue;
    const amount = num(e.amount);
    if (!(amount > 0)) continue;
    rows.push({
      id: `exp-${e.id}`,
      kind: "Expense",
      date: String(e.date || "").slice(0, 10),
      amount: -amount,
      label: e.title || e.category || undefined
    });
  }

  for (const b of supplierBills) {
    if (b?.isDeleted || b?.archived || String(b.status || "").toLowerCase() === "void") continue;
    if (String(b.status || "").toLowerCase() !== "paid") continue;
    const amount = num(b.amount);
    if (!(amount > 0)) continue;
    rows.push({
      id: `sb-${b.id}`,
      kind: "Supplier paid",
      date: String(b.paidAt || b.billDate || b.date || "").slice(0, 10),
      amount: -amount,
      label: b.supplierName || b.title || undefined
    });
  }

  for (const p of supplierPayments) {
    if (p?.isDeleted) continue;
    const amount = num(p.amount);
    if (!(amount > 0)) continue;
    rows.push({
      id: `sp-${p.id}`,
      kind: "Supplier payment",
      date: String(p.date || p.paidAt || "").slice(0, 10),
      amount: -amount,
      label: p.supplierName || p.note || undefined
    });
  }

  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function filterTransactions(
  rows: TransactionRow[],
  opts: { from?: string; to?: string; minAmount?: number; maxAmount?: number; kind?: string }
) {
  const from = String(opts.from || "").slice(0, 10);
  const to = String(opts.to || "").slice(0, 10);
  const minA = opts.minAmount != null && Number.isFinite(opts.minAmount) ? opts.minAmount : null;
  const maxA = opts.maxAmount != null && Number.isFinite(opts.maxAmount) ? opts.maxAmount : null;
  const kind = String(opts.kind || "all").toLowerCase();

  return rows.filter((r) => {
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    const abs = Math.abs(r.amount);
    if (minA != null && abs < minA) return false;
    if (maxA != null && abs > maxA) return false;
    if (kind !== "all" && r.kind.toLowerCase() !== kind) return false;
    return true;
  });
}
