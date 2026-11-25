import { useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { inr, isoDate, num } from "@/lib/utils";
import { isPaidExpense } from "@/lib/balanceMath";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { ExpenseDoc, RecurringExpenseDoc } from "@/features/tasks/types";
import { expenseMonthKey, gstSummary, sumByCategory, sumByVendor } from "../utils/gst";
import { processRecurringExpenses, softDeleteExpense, toggleExpensePaid } from "../services/expenseService";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { ContentLoading } from "@/components/ui/Loading";
import { DailyExpenseForm } from "../components/DailyExpenseForm";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { canPayExpense } from "../utils/permissions";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <KpiCard title={label} value={String(value)} hint={hint} />;
}

type ListPeriod = "month" | "m2" | "m3" | "m6" | "year";

function periodStart(period: ListPeriod, today = isoDate()): string {
  const d = new Date(today + "T00:00:00");
  if (period === "year") return `${d.getFullYear()}-01-01`;
  const monthsBack = period === "month" ? 0 : period === "m2" ? 1 : period === "m3" ? 2 : 5;
  const start = new Date(d.getFullYear(), d.getMonth() - monthsBack, 1);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
}

export function ExpensesDashboardPage() {
  const { role } = usePosAuth();
  const canPay = canPayExpense(role);
  const today = isoDate();
  const month = today.slice(0, 7);
  const { data: expenses, loading } = useRestaurantCollection<ExpenseDoc>({
    path: "expenses",
    orderByField: "date",
    orderDir: "desc"
  });
  const { data: recurring } = useRestaurantCollection<RecurringExpenseDoc>({ path: "recurring_expenses" });
  const [processed, setProcessed] = useState(false);
  const [listPeriod, setListPeriod] = useState<ListPeriod>("month");
  const [tick, setTick] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (processed) return;
    processRecurringExpenses()
      .catch(() => null)
      .finally(() => setProcessed(true));
  }, [processed]);

  useEffect(() => {
    if (window.location.hash === "#daily-expense-add") {
      document.getElementById("daily-expense-add")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const active = useMemo(() => expenses.filter((e) => !e.archived && !e.isDeleted), [expenses, tick]);
  const todayRows = active.filter((e) => String(e.date || "").slice(0, 10) === today);
  const monthRows = active.filter((e) => expenseMonthKey(e) === month);
  const unpaid = active.filter((e) => e.status === "unpaid" || e.paymentStatus === "pending" || e.paymentStatus === "partial");
  const pendingApproval = active.filter((e) => e.approvalStatus === "pending");
  const todayTotal = todayRows.reduce((s, e) => s + num(e.amount), 0);
  const monthTotal = monthRows.reduce((s, e) => s + num(e.amount), 0);
  const unpaidTotal = unpaid.reduce((s, e) => s + Math.max(0, num(e.amount) - num(e.paidAmount)), 0);
  const paidMonth = monthRows.filter((e) => isPaidExpense(e)).reduce((s, e) => s + num(e.amount), 0);
  const cats = sumByCategory(monthRows);
  const vendors = sumByVendor(monthRows);
  const gst = gstSummary(monthRows);

  const listFrom = periodStart(listPeriod, today);
  const listRows = useMemo(
    () =>
      [...active]
        .filter((e) => String(e.date || "").slice(0, 10) >= listFrom)
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [active, listFrom]
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Finance"
        title="Expenses"
        description="Add daily expenses, track paid/unpaid, recurring and approvals"
        actions={
          <>
            <a href="#daily-expense-add" className="kg-btn kg-btn-primary">
              + Add daily expense
            </a>
            <Link to="/expenses/list" className="kg-btn kg-btn-secondary">
              Full register
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

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <DailyExpenseForm
        onSaved={() => {
          setTick((t) => t + 1);
          setMsg("Expense saved — balances update on dashboard");
        }}
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

      <Card hover={false} padding="sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle title="Expense list" description={`From ${listFrom}`} />
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["month", "Month"],
                ["m2", "2M"],
                ["m3", "3M"],
                ["m6", "6M"],
                ["year", "Year"]
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setListPeriod(id)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                  listPeriod === id
                    ? "border-primary bg-primary-light text-primary"
                    : "border-stroke-0 bg-bg-1 text-text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[420px] space-y-1.5 overflow-auto">
          {listRows.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]"
            >
              <div className="min-w-0">
                <div className="font-semibold capitalize">
                  {String(e.category || "misc").replace(/_/g, " ")}
                  {e.note ? <span className="font-normal text-text-muted"> · {e.note}</span> : null}
                </div>
                <div className="text-[11px] text-text-muted">
                  {String(e.date).slice(0, 10)} · {e.paidFrom || e.paymentMethod || "—"} · {e.status}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right font-bold tabular-nums">{inr(e.amount)}</div>
                {canPay ? (
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-primary"
                    onClick={async () => {
                      await toggleExpensePaid(e.id, e.status !== "paid");
                      setTick((t) => t + 1);
                      setMsg(e.status === "paid" ? "Marked unpaid" : "Marked paid");
                    }}
                  >
                    {e.status === "paid" ? "Unpaid" : "Paid"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-[11px] font-semibold text-danger"
                  onClick={async () => {
                    if (
                      !confirm(
                        "Delete this expense? If it was paid, Cash / Online balance will reverse."
                      )
                    ) {
                      return;
                    }
                    await softDeleteExpense(e.id);
                    setTick((t) => t + 1);
                    setMsg("Expense deleted — balance updated.");
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!listRows.length ? (
            <EmptyState className="m-3" icon={<Inbox size={18} />} title="No expenses in this period" description="Use the form above to add a daily expense." />
          ) : null}
        </div>
      </Card>

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
    </div>
  );
}
