import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from "recharts";
import {
  Landmark,
  Wallet,
  TrendingUp,
  ReceiptIndianRupee,
  AlertCircle,
  PiggyBank,
  ShoppingBag,
  ArrowRight,
  BarChart3,
  PieChart as PieIcon,
  Inbox,
  CalendarClock
} from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { ExpenseDoc, SaleDoc, SupplierBillDoc, ReminderDoc, StaffDoc, AttendanceDoc, AdvanceDoc } from "@/lib/firestoreTypes";
import type { PurchaseEntryDoc } from "@/features/inventory/types";
import { calcDashboardTotals } from "@/lib/calculations";
import { buildTransactionHistory } from "@/lib/transactions";
import {
  countsAsRevenueSale,
  isActiveSale,
  isManualPlatformSaleEntry,
  isDuplicateAdvanceExpense,
  isPaidExpense
} from "@/lib/balanceMath";
import { BRAND } from "@/lib/brand";
import { outstandingPurchaseDues } from "@/features/suppliers/utils/ledger";
import { ContentLoading } from "@/components/ui/Loading";
import { clsx } from "clsx";

type SalesRange = "week" | "1m" | "3m" | "6m" | "custom";

const RANGE_OPTIONS: { id: SalesRange; label: string }[] = [
  { id: "week", label: "1 week" },
  { id: "1m", label: "1 month" },
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "custom", label: "Custom" }
];

function monthISO(): string {
  return new Date().toISOString().slice(0, 7);
}

function daysFromToday(iso: string): number {
  const d = new Date(iso + "T00:00:00");
  const t = new Date();
  const a = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const b = d.getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function toISODateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function datesBetween(fromISO: string, toISO: string): string[] {
  if (!fromISO || !toISO || fromISO > toISO) return [];
  const out: string[] = [];
  let cur = new Date(fromISO + "T00:00:00");
  const end = new Date(toISO + "T00:00:00");
  while (cur <= end) {
    out.push(toISODateLocal(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

function rangeBounds(range: SalesRange, customFrom: string, customTo: string): { from: string; to: string; label: string } {
  const today = new Date();
  const to = toISODateLocal(today);
  if (range === "custom") {
    const from = customFrom || to;
    const end = customTo || to;
    const a = from <= end ? from : end;
    const b = from <= end ? end : from;
    return { from: a, to: b, label: `${a} → ${b}` };
  }
  const daysBack = range === "week" ? 6 : range === "1m" ? 29 : range === "3m" ? 89 : 179;
  const from = toISODateLocal(addDays(today, -daysBack));
  const label =
    range === "week" ? "last 7 days" : range === "1m" ? "last 30 days" : range === "3m" ? "last 90 days" : "last 180 days";
  return { from, to, label };
}

const EXPENSE_COLORS = ["#E56B2C", "#0EA5E9", "#16A34A", "#D97706", "#7C3AED", "#DC2626", "#0891B2", "#CA8A04"];
const SALES_LINES = {
  Cash: "#E56B2C",
  Online: "#0EA5E9",
  Swiggy: "#FC8019",
  Zomato: "#E23744",
  Expenses: "#7C3AED",
  Total: "#111827"
} as const;

export function DashboardPage() {
  const navigate = useNavigate();
  const [salesRange, setSalesRange] = useState<SalesRange>("week");
  const [customFrom, setCustomFrom] = useState(() => toISODateLocal(addDays(new Date(), -6)));
  const [customTo, setCustomTo] = useState(() => toISODateLocal(new Date()));

  // No arbitrary cap — balance math must see every sale/expense/payment
  const sales = useRestaurantCollection<SaleDoc>({ path: "sales", orderByField: "date", orderDir: "desc" });
  const expenses = useRestaurantCollection<ExpenseDoc>({ path: "expenses", orderByField: "date", orderDir: "desc" });
  const supplierBills = useRestaurantCollection<SupplierBillDoc>({ path: "supplierBills" });
  const purchases = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases", orderByField: "date", orderDir: "desc" });
  const reminders = useRestaurantCollection<ReminderDoc>({ path: "reminders", max: 100 });
  const staff = useRestaurantCollection<StaffDoc>({ path: "staff" });
  const attendance = useRestaurantCollection<AttendanceDoc>({ path: "attendance", orderByField: "date", orderDir: "desc" });
  const advances = useRestaurantCollection<AdvanceDoc>({ path: "advances", orderByField: "date", orderDir: "desc" });
  const salaries = useRestaurantCollection<any>({ path: "salaries" });
  const fixedSalaries = useRestaurantCollection<any>({ path: "fixedSalaries" });
  const supplierPayments = useRestaurantCollection<any>({
    path: "supplierPayments",
    orderByField: "date",
    orderDir: "desc"
  });
  const investments = useRestaurantCollection<any>({ path: "investments" });
  const profitWithdrawals = useRestaurantCollection<any>({ path: "profit_withdrawals" });
  const balanceTransfers = useRestaurantCollection<any>({ path: "balance_transfers" });

  const chartBounds = useMemo(
    () => rangeBounds(salesRange, customFrom, customTo),
    [salesRange, customFrom, customTo]
  );

  // Trust the sales docs: cancel must soft-void the sale itself.
  // Do not drop active sales just because a linked order status says cancelled
  // (that was hiding today's POS totals on the dashboard while Sales history still showed them).
  const saleRows = useMemo(
    () =>
      sales.data
        .filter((s) => {
          const row = s as any;
          return isActiveSale(row) && countsAsRevenueSale(row);
        })
        .map((s) => {
          const row = s as any;
          const cash = num(row.cashAmount);
          const otherOnline = num(row.otherOnlineAmount);
          const legacyOnline = num(row.onlineAmount);
          const swiggyRaw = num(row.swiggyAmount);
          const zomatoRaw = num(row.zomatoAmount);
          const online =
            otherOnline > 0 || swiggyRaw > 0 || zomatoRaw > 0
              ? otherOnline
              : Math.max(0, legacyOnline - swiggyRaw - zomatoRaw);
          // Graph Swiggy/Zomato: only weekly Sales-page entries (never POS kitchen tickets)
          const platformOk = isManualPlatformSaleEntry(row);
          return {
            ...s,
            date: String(s.date || "").slice(0, 10),
            cashAmount: cash,
            onlineAmount: online,
            swiggyAmount: platformOk ? swiggyRaw : 0,
            zomatoAmount: platformOk ? zomatoRaw : 0,
            totalAmount: cash + online || num(row.totalAmount) || num(row.total) || num(row.amount)
          };
        }),
    [sales.data]
  );

  const expenseRows = useMemo(
    () =>
      expenses.data
        .filter((e: any) => !e.isDeleted && !e.archived)
        .map((e) => ({
          ...e,
          amount: num((e as any).amount),
          category: String((e as any).category || (e as any).expenseType || "other").trim() || "other",
          date: String(e.date || "").slice(0, 10)
        })),
    [expenses.data]
  );

  const totals = calcDashboardTotals({
    sales: saleRows as any,
    expenses: expenseRows as any,
    supplierBills: supplierBills.data,
    purchases: purchases.data,
    supplierPayments: supplierPayments.data,
    staff: staff.data,
    attendance: attendance.data,
    advances: advances.data,
    salaries: salaries.data,
    fixedSalaries: fixedSalaries.data,
    investments: investments.data,
    profitWithdrawals: profitWithdrawals.data,
    balanceTransfers: balanceTransfers.data,
    monthISO: monthISO()
  });

  const dailySales = useMemo(() => {
    const empty = () => ({ Cash: 0, Online: 0, Swiggy: 0, Zomato: 0, Expenses: 0, Total: 0 });
    const byDate = new Map<string, ReturnType<typeof empty>>();
    for (const s of saleRows) {
      if (!s.date) continue;
      if (s.date < chartBounds.from || s.date > chartBounds.to) continue;
      const cur = byDate.get(s.date) || empty();
      cur.Cash += s.cashAmount;
      cur.Online += s.onlineAmount;
      cur.Swiggy += s.swiggyAmount;
      cur.Zomato += s.zomatoAmount;
      // Shop total only — Swiggy/Zomato are tracked separately (manual weekly entry)
      cur.Total += s.cashAmount + s.onlineAmount;
      byDate.set(s.date, cur);
    }
    for (const e of expenseRows) {
      if (!e.date) continue;
      if (e.date < chartBounds.from || e.date > chartBounds.to) continue;
      if (!isPaidExpense(e)) continue;
      if (isDuplicateAdvanceExpense(e, advances.data)) continue;
      const cur = byDate.get(e.date) || empty();
      cur.Expenses += num(e.amount);
      byDate.set(e.date, cur);
    }
    const days = datesBetween(chartBounds.from, chartBounds.to);
    return days.map((date) => {
      const row = byDate.get(date) || empty();
      return { date: date.slice(5), fullDate: date, ...row };
    });
  }, [saleRows, expenseRows, chartBounds, advances.data]);

  const hasSalesData = dailySales.some((d) => d.Total > 0 || d.Expenses > 0);
  const chartPointCount = dailySales.length;
  const showDots = chartPointCount <= 45;
  const xTickInterval = chartPointCount <= 14 ? 0 : chartPointCount <= 45 ? 2 : chartPointCount <= 100 ? 6 : 13;

  const expByCat = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const e of expenseRows) {
      if (!isPaidExpense(e)) continue;
      const k = e.category;
      acc[k] = (acc[k] ?? 0) + (e.amount ?? 0);
    }
    return Object.entries(acc)
      .map(([name, value]) => ({ name, value }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [expenseRows]);

  const expensePieTotal = expByCat.reduce((s, x) => s + x.value, 0);

  const upcomingBills = useMemo(() => {
    // Apply payment pool like Supplier Remaining — settled sellers (e.g. rice kalupur ₹0) drop off
    const purchaseDues = outstandingPurchaseDues({
      purchases: purchases.data,
      payments: supplierPayments.data
    }).map((d) => ({
      id: d.id,
      title: `${d.seller} — ${d.item}`,
      days: daysFromToday(d.date),
      amount: d.amount
    }));

    const billDues = supplierBills.data
      .filter((b) => String(b.status || "").toLowerCase() === "unpaid")
      .map((b) => ({
        id: b.id,
        title: String((b as any).seller || (b as any).vendorName || "Supplier bill"),
        days: daysFromToday(String(b.dueDate || (b as any).date || "").slice(0, 10)),
        amount: num((b as any).amount)
      }))
      .filter((b) => b.amount > 0.009);

    return [...purchaseDues, ...billDues]
      .filter((b) => Number.isFinite(b.days) && b.days <= 10 && b.amount > 0.009)
      .sort((a, b) => a.days - b.days)
      .slice(0, 6);
  }, [purchases.data, supplierPayments.data, supplierBills.data]);

  const upcomingReminders = reminders.data
    .filter((r) => r.enabled !== false)
    .map((r) => ({ ...r, days: daysFromToday(String(r.dueDate || "").slice(0, 10)) }))
    .filter((r) => bDaysOk(r.days, r.daysBefore))
    .slice(0, 6);

  function bDaysOk(days: number, daysBefore?: number) {
    return days >= 0 && days <= (daysBefore ?? 5);
  }

  const recentTx = useMemo(
    () =>
      buildTransactionHistory({
        sales: sales.data,
        expenses: expenses.data,
        supplierBills: supplierBills.data,
        supplierPayments: supplierPayments.data
      }).slice(0, 5),
    [sales.data, expenses.data, supplierBills.data, supplierPayments.data]
  );

  const bootLoading = sales.loading || expenses.loading || purchases.loading || advances.loading;

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Operations overview"
        title="Dashboard"
        description={`Live balances, sales, and payables — ${BRAND.restaurantName}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/pos")}>
              Open POS
            </Button>
            <Button onClick={() => navigate("/sales")}>
              Add sales <ArrowRight size={14} />
            </Button>
          </>
        }
      />

      {bootLoading ? <ContentLoading variant="dashboard" label="Loading dashboard" /> : null}

      <div className={clsx("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", bootLoading && "pointer-events-none opacity-40")}>
        <KpiCard title="Cash Balance" value={inr(totals.cashBalance)} icon={<Wallet size={16} />} />
        <KpiCard title="Bank Balance" value={inr(totals.bankBalance)} icon={<Landmark size={16} />} />
        <KpiCard title="Total Balance" value={inr(totals.totalBalance)} icon={<PiggyBank size={16} />} />
        <KpiCard
          title="Shop sales"
          value={inr(totals.totalRevenue)}
          icon={<TrendingUp size={16} />}
          tone="good"
          hint={totals.aggregatorSales > 0 ? `Swiggy/Zomato ${inr(totals.aggregatorSales)} (not in shop total)` : "Cash + UPI · excludes Swiggy/Zomato"}
        />
        <KpiCard
          title="Unpaid Bills"
          value={inr(totals.unpaidBills)}
          icon={<AlertCircle size={16} />}
          tone={totals.unpaidBills > 0 ? "bad" : "neutral"}
        />
        <KpiCard
          title="Net Profit"
          value={inr(totals.netProfit)}
          icon={<ReceiptIndianRupee size={16} />}
          tone={totals.netProfit >= 0 ? "good" : "bad"}
          hint={`Salary accrued: ${inr(totals.salaryAccrued)}`}
        />
        <KpiCard title="Total Sales" value={inr(totals.totalSales)} icon={<ShoppingBag size={16} />} />
        <KpiCard title="Expenses" value={inr(totals.totalExpenses)} icon={<ReceiptIndianRupee size={16} />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card hover={false}>
          <SectionTitle
            title="Daily sales & expenses"
            description={`Cash · Online · Expenses · weekly Swiggy/Zomato · ${chartBounds.label}`}
            right={<BarChart3 size={16} className="text-text-muted" aria-hidden />}
          />
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSalesRange(opt.id)}
                className={clsx(
                  "rounded-md border px-2.5 py-1 text-[11px] font-semibold transition",
                  salesRange === opt.id
                    ? "border-primary bg-primary-light text-primary"
                    : "border-stroke-0 bg-bg-1 text-text-muted hover:bg-card-0 hover:text-text-primary"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {salesRange === "custom" ? (
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-[11px] font-semibold text-text-muted">
                From
                <Input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label className="grid gap-1 text-[11px] font-semibold text-text-muted">
                To
                <Input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
            </div>
          ) : null}
          {hasSalesData ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailySales} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#E6E8EE" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#6B7280"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval={xTickInterval}
                    minTickGap={8}
                  />
                  <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} width={44} />
                  <Tooltip
                    labelFormatter={(_, payload) => {
                      const full = payload?.[0]?.payload?.fullDate;
                      return full ? String(full) : "";
                    }}
                    formatter={(value: number) => inr(Number(value) || 0)}
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #E6E8EE",
                      borderRadius: 10,
                      color: "#111827",
                      boxShadow: "0 8px 20px rgba(17,24,39,0.08)",
                      fontSize: 12
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line type="monotone" dataKey="Cash" stroke={SALES_LINES.Cash} strokeWidth={2.5} dot={showDots ? { r: 3 } : false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="Online" stroke={SALES_LINES.Online} strokeWidth={2.5} dot={showDots ? { r: 3 } : false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="Expenses" stroke={SALES_LINES.Expenses} strokeWidth={2.5} dot={showDots ? { r: 3 } : false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="Swiggy" stroke={SALES_LINES.Swiggy} strokeWidth={2} strokeDasharray="3 3" dot={showDots ? { r: 2 } : false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Zomato" stroke={SALES_LINES.Zomato} strokeWidth={2} strokeDasharray="3 3" dot={showDots ? { r: 2 } : false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Total" name="Sales total" stroke={SALES_LINES.Total} strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<BarChart3 size={18} />}
              title="No sales or expenses in this range"
              description="Try another period, or add sales / expenses for these dates."
              action={<Button variant="secondary" onClick={() => navigate("/sales")}>Add sale</Button>}
            />
          )}
        </Card>

        <Card hover={false}>
          <SectionTitle
            title="Expense breakdown"
            description={`Total ${inr(expensePieTotal)} · by category`}
            right={<PieIcon size={16} className="text-text-muted" aria-hidden />}
          />
          {expByCat.length ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expByCat}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {expByCat.map((entry, idx) => (
                        <Cell key={entry.name} fill={EXPENSE_COLORS[idx % EXPENSE_COLORS.length]} stroke="#fff" strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => inr(Number(value) || 0)}
                      contentStyle={{
                        background: "#fff",
                        border: "1px solid #E6E8EE",
                        borderRadius: 10,
                        color: "#111827",
                        fontSize: 12
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex min-w-[140px] flex-col justify-center gap-1.5 pr-1">
                {expByCat.map((entry, idx) => (
                  <div key={entry.name} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: EXPENSE_COLORS[idx % EXPENSE_COLORS.length] }}
                      />
                      <span className="truncate capitalize text-text-secondary">{entry.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-text-primary">{inr(entry.value)}</span>
                  </div>
                ))}
                <div className="mt-1 border-t border-stroke-0 pt-1.5 text-[12px] font-bold text-text-primary">
                  Total {inr(expensePieTotal)}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<PieIcon size={18} />}
              title="No expenses recorded"
              description="Log rent, utilities, and misc costs to see category split."
              action={<Button variant="secondary" onClick={() => navigate("/expenses")}>Go to expenses</Button>}
            />
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card hover={false}>
          <SectionTitle
            title="Recent transactions"
            description="Latest 5 · sales, expenses, supplier payments"
            right={
              <Button variant="secondary" onClick={() => navigate("/transactions")}>
                Show all
              </Button>
            }
          />
          {recentTx.length ? (
            <div className="grid gap-1.5">
              {recentTx.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-text-primary">{t.kind}</div>
                    <div className="text-[11px] text-text-muted">{t.date}</div>
                  </div>
                  <div className={t.amount >= 0 ? "text-[13px] font-bold text-success tabular-nums" : "text-[13px] font-bold text-danger tabular-nums"}>
                    {t.amount >= 0 ? "+" : "−"}
                    {inr(Math.abs(t.amount))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="mt-1 w-full rounded-lg border border-stroke-0 py-2 text-[12px] font-semibold text-primary hover:bg-primary-light"
                onClick={() => navigate("/transactions")}
              >
                Show all history
              </button>
            </div>
          ) : (
            <EmptyState
              icon={<Inbox size={18} />}
              title="No transactions yet"
              description="Activity from sales and expenses will show up here."
            />
          )}
        </Card>

        <Card hover={false}>
          <SectionTitle title="Upcoming payments" description="Bills due soon and reminders" />
          {upcomingBills.length || upcomingReminders.length ? (
            <div className="grid gap-1.5">
              {upcomingBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-text-primary">{b.title}</div>
                    <div className="text-[11px] text-text-muted">
                      {b.days < 0 ? `${Math.abs(b.days)}d overdue` : b.days === 0 ? "Due today" : `in ${b.days} days`}
                    </div>
                  </div>
                  <div className="text-[13px] font-bold text-danger tabular-nums">{inr(b.amount)}</div>
                </div>
              ))}
              {upcomingReminders.map((r) => (
                <div key={(r as any).id} className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-text-primary">{r.title}</div>
                    <div className="text-[11px] text-text-muted">
                      Due {r.dueDate} · in {r.days} days
                    </div>
                  </div>
                  <div className="rounded-md bg-primary-light px-2 py-0.5 text-[10px] font-bold text-primary">Reminder</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CalendarClock size={18} />}
              title="Nothing due soon"
              description="Unpaid bills and reminders within the next few days appear here."
              action={<Button variant="secondary" onClick={() => navigate("/reminders")}>Manage reminders</Button>}
            />
          )}
        </Card>
      </div>

      {(sales.error || expenses.error || supplierBills.error) && (
        <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">
          Data error: {sales.error ?? expenses.error ?? supplierBills.error}
        </div>
      )}
    </div>
  );
}
