import { useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { ExpenseDoc, RecurringExpenseDoc } from "@/features/tasks/types";
import { expenseMonthKey, gstSummary, sumByCategory, sumByVendor } from "../utils/gst";
import { processRecurringExpenses } from "../services/expenseService";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";

import { ContentLoading } from "@/components/ui/Loading";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <KpiCard title={label} value={String(value)} hint={hint} />;
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
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Finance"
        title="Expense command"
        actions={
          <>
          <Link to="/expenses/list" className="kg-btn kg-btn-primary">
            All expenses
          </Link>
          <Link to="/expenses/recurring" className="kg-btn kg-btn-secondary">
            Recurring
          </Link>
          <Link to="/expenses/approvals" className="kg-btn kg-btn-secondary">
            Approvals
          </Link>
          <Link to="/suppliers" className="kg-btn kg-btn-secondary">
            Vendors
          </Link>
          </>
        }
      />

      {loading ? <ContentLoading variant="block" label="Loading" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        <Card padding="sm" hover={false}>
          <SectionTitle title={`Top categories (${month})`} />
          <div className="space-y-2">
            {cats.slice(0, 8).map((c) => (
              <div key={c.category} className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]">
                <span className="font-semibold capitalize">{c.category.replace(/_/g, " ")}</span>
                <span>{inr(c.total)}</span>
              </div>
            ))}
            {!cats.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No expenses this month." /> : null}
          </div>
        </Card>
        <Card padding="sm" hover={false}>
          <SectionTitle title="Top vendors" />
          <div className="space-y-2">
            {vendors.slice(0, 8).map((v) => (
              <div key={v.vendor} className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]">
                <span className="font-semibold">{v.vendor}</span>
                <span>{inr(v.total)}</span>
              </div>
            ))}
            {!vendors.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No vendor-linked expenses." /> : null}
          </div>
        </Card>
      </div>

      <Card padding="sm" hover={false}>
        <SectionTitle title="Recent expenses" />
        <div className="max-h-72 space-y-2 overflow-auto">
          {[...active]
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .slice(0, 12)
            .map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]">
                <div>
                  <div className="font-semibold">
                    {e.expenseNumber || e.id.slice(0, 6)} · {e.category}
                  </div>
                  <div className="text-xs text-text-muted">
                    {e.date} · {e.vendorName || "—"} · {e.paymentMethod}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{inr(e.amount)}</div>
                  <div className="text-[10px] font-bold uppercase text-text-muted">{e.status}</div>
                </div>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
