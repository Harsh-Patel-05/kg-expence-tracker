import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { ExpenseDoc, RecurringExpenseDoc } from "@/features/tasks/types";
import { expenseMonthKey, gstSummary, sumByCategory, sumByVendor } from "../utils/gst";
import { processRecurringExpenses } from "../services/expenseService";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </motion.div>
  );
}

export function ExpensesDashboardPage() {
  const today = isoDate();
  const month = today.slice(0, 7);
  const { data: expenses, loading } = useRestaurantCollection<ExpenseDoc>({ path: "expenses" });
  const { data: recurring } = useRestaurantCollection<RecurringExpenseDoc>({ path: "recurring_expenses" });
  const [processed, setProcessed] = useState(false);

  useEffect(() => {
    if (processed) return;
    processRecurringExpenses()
      .catch(() => null)
      .finally(() => setProcessed(true));
  }, [processed]);

  const active = useMemo(() => expenses.filter((e) => !e.archived), [expenses]);
  const todayRows = active.filter((e) => String(e.date || "").slice(0, 10) === today);
  const monthRows = active.filter((e) => expenseMonthKey(e) === month);
  const unpaid = active.filter((e) => e.status === "unpaid" || e.paymentStatus === "pending" || e.paymentStatus === "partial");
  const pendingApproval = active.filter((e) => e.approvalStatus === "pending");
  const todayTotal = todayRows.reduce((s, e) => s + num(e.amount), 0);
  const monthTotal = monthRows.reduce((s, e) => s + num(e.amount), 0);
  const unpaidTotal = unpaid.reduce((s, e) => s + Math.max(0, num(e.amount) - num(e.paidAmount)), 0);
  const paidMonth = monthRows.filter((e) => e.status === "paid").reduce((s, e) => s + num(e.amount), 0);
  const cats = sumByCategory(monthRows);
  const vendors = sumByVendor(monthRows);
  const gst = gstSummary(monthRows);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Finance</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Expense command</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/expenses/list" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            All expenses
          </Link>
          <Link to="/expenses/recurring" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Recurring
          </Link>
          <Link to="/expenses/approvals" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Approvals
          </Link>
          <Link to="/suppliers" className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white">
            Vendors
          </Link>
        </div>
      </div>

      {loading ? <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today" value={inr(todayTotal)} hint={`${todayRows.length} entries`} />
        <Stat label="This month" value={inr(monthTotal)} hint={month} />
        <Stat label="Paid this month" value={inr(paidMonth)} />
        <Stat label="Unpaid outstanding" value={inr(unpaidTotal)} hint={`${unpaid.length} bills`} />
        <Stat label="Pending approvals" value={pendingApproval.length} />
        <Stat label="Active recurring" value={recurring.filter((r) => r.active !== false).length} />
        <Stat label="GST (month)" value={inr(gst.cgst + gst.sgst + gst.igst)} hint={`Taxable ${inr(gst.taxable)}`} />
        <Stat label="Cash flow out (paid)" value={inr(paidMonth)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">Top categories ({month})</div>
          <div className="space-y-2">
            {cats.slice(0, 8).map((c) => (
              <div key={c.category} className="flex justify-between text-sm">
                <span className="font-semibold capitalize">{c.category.replace(/_/g, " ")}</span>
                <span>{inr(c.total)}</span>
              </div>
            ))}
            {!cats.length ? <div className="py-8 text-center text-sm text-slate-500">No expenses this month.</div> : null}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">Top vendors</div>
          <div className="space-y-2">
            {vendors.slice(0, 8).map((v) => (
              <div key={v.vendor} className="flex justify-between text-sm">
                <span className="font-semibold">{v.vendor}</span>
                <span>{inr(v.total)}</span>
              </div>
            ))}
            {!vendors.length ? <div className="py-8 text-center text-sm text-slate-500">No vendor-linked expenses.</div> : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-bold">Recent expenses</div>
        <div className="max-h-72 space-y-2 overflow-auto">
          {[...active]
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .slice(0, 12)
            .map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <div>
                  <div className="font-semibold">
                    {e.expenseNumber || e.id.slice(0, 6)} · {e.category}
                  </div>
                  <div className="text-xs text-slate-500">
                    {e.date} · {e.vendorName || "—"} · {e.paymentMethod}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{inr(e.amount)}</div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">{e.status}</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
