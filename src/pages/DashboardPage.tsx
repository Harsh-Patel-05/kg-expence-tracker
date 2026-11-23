import { useNavigate } from "react-router-dom";
import { BarChart, Bar, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
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
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { ExpenseDoc, SaleDoc, SupplierBillDoc, ReminderDoc, StaffDoc, AttendanceDoc, AdvanceDoc } from "@/lib/firestoreTypes";
import type { PurchaseEntryDoc } from "@/features/inventory/types";
import { calcDashboardTotals } from "@/lib/calculations";
import { BRAND } from "@/lib/brand";

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

const CHART = ["#E56B2C", "#9A3F24", "#F2A65A", "#CF5A1F", "#B45309", "#78350F"];

export function DashboardPage() {
  const navigate = useNavigate();
  const sales = useRestaurantCollection<SaleDoc>({ path: "sales", max: 300 });
  const expenses = useRestaurantCollection<ExpenseDoc>({ path: "expenses", max: 300 });
  const supplierBills = useRestaurantCollection<SupplierBillDoc>({ path: "supplierBills", max: 100 });
  const purchases = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases", max: 300 });
  const reminders = useRestaurantCollection<ReminderDoc>({ path: "reminders", max: 100 });
  const staff = useRestaurantCollection<StaffDoc>({ path: "staff", max: 100 });
  const attendance = useRestaurantCollection<AttendanceDoc>({ path: "attendance", max: 200 });
  const advances = useRestaurantCollection<AdvanceDoc>({ path: "advances", max: 100 });

  const saleRows = sales.data.map((s) => ({
    ...s,
    cashAmount: num((s as any).cashAmount),
    onlineAmount: num((s as any).onlineAmount),
    date: String(s.date || "").slice(0, 10)
  }));
  const expenseRows = expenses.data.map((e) => ({
    ...e,
    amount: num((e as any).amount),
    date: String(e.date || "").slice(0, 10)
  }));

  const totals = calcDashboardTotals({
    sales: saleRows as any,
    expenses: expenseRows as any,
    supplierBills: supplierBills.data,
    purchases: purchases.data,
    staff: staff.data,
    attendance: attendance.data,
    advances: advances.data,
    monthISO: monthISO()
  });

  const last7 = [...saleRows]
    .slice()
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .slice(-7)
    .map((s) => ({
      date: s.date.slice(5),
      Cash: s.cashAmount,
      Online: s.onlineAmount
    }));

  const expByCat = Object.entries(
    expenseRows.reduce<Record<string, number>>((acc, e) => {
      const k = (e as any).category ?? "other";
      acc[k] = (acc[k] ?? 0) + (e.amount ?? 0);
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const upcomingBills = [
    ...supplierBills.data
      .filter((b) => b.status === "unpaid")
      .map((b) => ({
        id: b.id,
        title: "Supplier bill",
        days: daysFromToday(String(b.dueDate || "").slice(0, 10)),
        amount: num((b as any).amount)
      })),
    ...purchases.data
      .filter((p) => String(p.paidStatus || p.paymentStatus || "").toLowerCase() !== "paid")
      .map((p) => ({
        id: p.id,
        title: `${p.seller || p.vendorName || "Supplier"} — ${p.item || "Bill"}`,
        days: daysFromToday(String(p.date || p.invoiceDate || "").slice(0, 10)),
        amount: num(p.price ?? p.total)
      }))
  ]
    .filter((b) => b.days <= 10)
    .slice(0, 6);

  const upcomingReminders = reminders.data
    .filter((r) => r.enabled !== false)
    .map((r) => ({ ...r, days: daysFromToday(String(r.dueDate || "").slice(0, 10)) }))
    .filter((r) => bDaysOk(r.days, r.daysBefore))
    .slice(0, 6);

  function bDaysOk(days: number, daysBefore?: number) {
    return days >= 0 && days <= (daysBefore ?? 5);
  }

  const recentTx = [
    ...saleRows.slice(0, 6).map((s) => ({ kind: "Sale", date: s.date, amount: (s.cashAmount ?? 0) + (s.onlineAmount ?? 0) })),
    ...expenseRows.slice(0, 6).map((e) => ({ kind: "Expense", date: e.date, amount: -(e.amount ?? 0) })),
    ...supplierBills.data
      .filter((b) => b.status === "paid")
      .slice(0, 6)
      .map((b) => ({ kind: "Supplier paid", date: String(b.paidAt ?? b.billDate ?? ""), amount: -(num((b as any).amount)) }))
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8);

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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Cash Balance" value={inr(totals.cashBalance)} icon={<Wallet size={16} />} />
        <KpiCard title="Bank Balance" value={inr(totals.bankBalance)} icon={<Landmark size={16} />} />
        <KpiCard title="Total Balance" value={inr(totals.totalBalance)} icon={<PiggyBank size={16} />} />
        <KpiCard title="Total Revenue" value={inr(totals.totalRevenue)} icon={<TrendingUp size={16} />} tone="good" />
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
          <SectionTitle title="Daily sales" description="Cash vs online · last 7 entries" right={<BarChart3 size={16} className="text-text-muted" aria-hidden />} />
          {last7.length ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={last7}>
                  <CartesianGrid stroke="#E6E8EE" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #E6E8EE",
                      borderRadius: 10,
                      color: "#111827",
                      boxShadow: "0 8px 20px rgba(17,24,39,0.08)",
                      fontSize: 12
                    }}
                  />
                  <Bar dataKey="Cash" fill="#E56B2C" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Online" fill="#9A3F24" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<BarChart3 size={18} />}
              title="No sales entries yet"
              description="Add end-of-day cash and online totals to see trends here."
              action={<Button variant="secondary" onClick={() => navigate("/sales")}>Add first sale</Button>}
            />
          )}
        </Card>

        <Card hover={false}>
          <SectionTitle title="Expense breakdown" description="All time by category" right={<PieIcon size={16} className="text-text-muted" aria-hidden />} />
          {expByCat.length ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expByCat} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={2}>
                    {expByCat.map((_, idx) => (
                      <Cell key={idx} fill={CHART[idx % CHART.length]} />
                    ))}
                  </Pie>
                  <Tooltip
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
          <SectionTitle title="Recent transactions" description="Sales, expenses, supplier payments" />
          {recentTx.length ? (
            <div className="grid gap-1.5">
              {recentTx.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-text-primary">{t.kind}</div>
                    <div className="text-[11px] text-text-muted">{t.date}</div>
                  </div>
                  <div className={t.amount >= 0 ? "text-[13px] font-bold text-success tabular-nums" : "text-[13px] font-bold text-danger tabular-nums"}>
                    {t.amount >= 0 ? "+" : "-"}
                    {inr(Math.abs(t.amount))}
                  </div>
                </div>
              ))}
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
