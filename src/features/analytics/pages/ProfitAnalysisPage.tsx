import { useMemo, useState } from "react";
import { LineChart, TrendingUp } from "lucide-react";
import { clsx } from "clsx";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { inr, isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { ExpenseDoc, SaleDoc } from "@/lib/firestoreTypes";
import type { PurchaseEntryDoc } from "@/features/inventory/types";
import type { ReminderDoc } from "@/features/tasks/types";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { Button } from "@/components/ui/Button";
import { FieldLabel, Input } from "@/components/ui/Input";
import { ContentLoading } from "@/components/ui/Loading";
import {
  computePendingBills,
  computeProfitAnalysis,
  getPADateRange,
  type PAPeriod
} from "../utils/profitAnalysis";

export function ProfitAnalysisPage() {
  const [period, setPeriod] = useState<PAPeriod>("week");
  const [customFrom, setCustomFrom] = useState(isoDate());
  const [customTo, setCustomTo] = useState(isoDate());
  const [appliedCustom, setAppliedCustom] = useState(true);

  const sales = useRestaurantCollection<SaleDoc>({ path: "sales" });
  const expenses = useRestaurantCollection<ExpenseDoc>({ path: "expenses" });
  const purchases = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases" });
  const supplierPayments = useRestaurantCollection<{ date?: string; amount?: number }>({ path: "supplierPayments" });
  const fixedSalaries = useRestaurantCollection<{ month?: string; amount?: number }>({ path: "fixedSalaries" });
  const salaries = useRestaurantCollection<{ date?: string; month?: string; amount?: number }>({ path: "salaries" });
  const reminders = useRestaurantCollection<ReminderDoc>({ path: "reminders" });

  const loading =
    sales.loading ||
    expenses.loading ||
    purchases.loading ||
    supplierPayments.loading ||
    fixedSalaries.loading ||
    salaries.loading;

  const range = useMemo(() => {
    if (period === "custom" && !appliedCustom) return null;
    return getPADateRange(period, customFrom, customTo);
  }, [period, customFrom, customTo, appliedCustom]);

  const result = useMemo(() => {
    if (!range) return null;
    return computeProfitAnalysis(range, {
      sales: sales.data,
      expenses: expenses.data,
      supplierPayments: supplierPayments.data,
      purchases: purchases.data,
      fixedSalaries: fixedSalaries.data,
      salaries: salaries.data,
      reminders: reminders.data
    });
  }, [range, sales.data, expenses.data, supplierPayments.data, purchases.data, fixedSalaries.data, salaries.data, reminders.data]);

  const pending = useMemo(
    () => computePendingBills(purchases.data, reminders.data),
    [purchases.data, reminders.data]
  );

  const profitTone = (result?.netProfit ?? 0) >= 0 ? "text-primary" : "text-danger";
  const days = range?.days ?? 1;

  const onPeriod = (p: PAPeriod) => {
    setPeriod(p);
    if (p !== "custom") setAppliedCustom(true);
    else setAppliedCustom(false);
  };

  if (loading) {
    return <ContentLoading variant="dashboard" label="Loading profit analysis" />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Insights"
        title="Profit Analysis"
        description="Total sales vs all costs — weekly, monthly & daily average"
        actions={
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["week", "This Week"],
                ["month", "This Month"],
                ["custom", "Custom"]
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={clsx(
                  "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                  period === id
                    ? "border-primary bg-primary text-white"
                    : "border-stroke-0 bg-bg-1 text-text-secondary hover:border-stroke-1"
                )}
                onClick={() => onPeriod(id)}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {period === "custom" ? (
        <Card padding="sm">
          <div className="grid max-w-md grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="paFrom">From</FieldLabel>
              <Input id="paFrom" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="paTo">To</FieldLabel>
              <Input id="paTo" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </div>
          <Button type="button" className="mt-3" onClick={() => setAppliedCustom(true)}>
            Apply
          </Button>
        </Card>
      ) : null}

      {!result ? (
        <EmptyState
          title="Pick a date range"
          description={period === "custom" ? "Set from/to and click Apply." : "Select a period above."}
          icon={<TrendingUp size={20} />}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="Total Sales" value={inr(result.totalSales)} tone="good" icon={<LineChart size={16} />} />
            <KpiCard title="Total Costs" value={inr(result.totalCosts)} tone="bad" />
            <KpiCard
              title="Net Profit"
              value={inr(result.netProfit)}
              tone={result.netProfit >= 0 ? "good" : "bad"}
              className={profitTone}
            />
            <KpiCard title="Profit Margin" value={`${result.marginPct}%`} tone={result.netProfit >= 0 ? "good" : "bad"} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Card padding="sm" className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Avg Daily Sales</div>
              <div className="mt-1 text-xl font-bold text-primary tabular-nums">{inr(result.totalSales / days)}</div>
            </Card>
            <Card padding="sm" className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Avg Daily Cost</div>
              <div className="mt-1 text-xl font-bold text-warning tabular-nums">{inr(result.totalCosts / days)}</div>
            </Card>
            <Card padding="sm" className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Avg Daily Profit</div>
              <div className={clsx("mt-1 text-xl font-bold tabular-nums", profitTone)}>{inr(result.netProfit / days)}</div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionTitle title="Cost Breakdown" />
              {result.breakdown.length === 0 ? (
                <p className="text-sm text-text-muted">No expenses in this period.</p>
              ) : (
                <ul className="space-y-2.5">
                  {result.breakdown.map((item) => {
                    const pct = result.totalCosts > 0 ? ((item.value / result.totalCosts) * 100).toFixed(1) : "0";
                    return (
                      <li key={item.label} className="flex items-center justify-between gap-3">
                        <BreakdownLabel label={item.label} color={item.color} />
                        <BreakdownValue value={inr(item.value)} pct={pct} color={item.color} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card className="flex flex-col items-center">
              <SectionTitle title="Cost Ratio" className="w-full" />
              {result.breakdown.length === 0 ? (
                <p className="text-sm text-text-muted">No data for chart.</p>
              ) : (
                <div className="h-[240px] w-full max-w-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={result.breakdown} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                        {result.breakdown.map((entry) => (
                          <Cell key={entry.label} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => inr(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card>
            <SectionTitle title="Pending & Upcoming Bills" />
            {pending.length === 0 ? (
              <p className="text-sm text-text-muted">No pending bills / reminders.</p>
            ) : (
              <ul className="divide-y divide-stroke-0">
                {pending.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{row.title}</div>
                      <div className="text-xs text-text-muted">{row.subtitle}</div>
                    </div>
                    {row.tag ? (
                      <span
                        className={clsx(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          row.tag === "overdue" ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning"
                        )}
                      >
                        {row.tagLabel}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-x-auto">
            <SectionTitle title="Weekly Breakdown" />
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stroke-0 text-[12px] text-text-muted">
                  <th className="py-2 pr-3 font-semibold">Week</th>
                  <th className="py-2 pr-3 font-semibold">Sales</th>
                  <th className="py-2 pr-3 font-semibold">Costs</th>
                  <th className="py-2 font-semibold">Profit</th>
                </tr>
              </thead>
              <tbody>
                {result.weeks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-text-muted">
                      No data in this period.
                    </td>
                  </tr>
                ) : (
                  result.weeks.map((w) => (
                    <tr key={w.label} className="border-b border-stroke-0/60">
                      <td className="py-2.5 pr-3">{w.label}</td>
                      <td className="py-2.5 pr-3 font-semibold text-primary tabular-nums">{inr(w.sales)}</td>
                      <td className="py-2.5 pr-3 font-semibold text-danger tabular-nums">{inr(w.costs)}</td>
                      <td className={clsx("py-2.5 font-bold tabular-nums", w.profit >= 0 ? "text-primary" : "text-danger")}>
                        {inr(w.profit)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function BreakdownLabel({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate text-[13px] font-medium">{label}</span>
    </div>
  );
}

function BreakdownValue({ value, pct, color }: { value: string; pct: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] font-semibold tabular-nums">{value}</span>
      <span
        className="min-w-[42px] rounded-full px-2 py-0.5 text-center text-[11px] font-semibold"
        style={{ background: `${color}22`, color }}
      >
        {pct}%
      </span>
    </div>
  );
}