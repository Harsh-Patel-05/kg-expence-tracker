import { motion } from "framer-motion";
import { BarChart, Bar, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Landmark, Wallet, TrendingUp, ReceiptIndianRupee, AlertCircle, PiggyBank, ShoppingBag } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { Card } from "@/components/ui/Card";
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

export function DashboardPage() {
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
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative overflow-hidden rounded-[20px] border border-[#E9EDF5] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.05)]"
      >
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-[#6D5EF7]/10 blur-2xl" />
        <div className="relative">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6D5EF7]">Welcome back</div>
          <div className="mt-1 text-[34px] font-bold tracking-tight text-[#111827]">{BRAND.restaurantName}</div>
          <div className="mt-2 max-w-xl text-[15px] text-[#6B7280]">
            Powered by {BRAND.appName} — live operations, finance, and AI insights.
          </div>
        </div>
      </motion.div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Cash Balance" value={inr(totals.cashBalance)} icon={<Wallet size={18} />} />
        <KpiCard title="Bank Balance" value={inr(totals.bankBalance)} icon={<Landmark size={18} />} />
        <KpiCard title="Total Balance" value={inr(totals.totalBalance)} icon={<PiggyBank size={18} />} />
        <KpiCard title="Total Revenue" value={inr(totals.totalRevenue)} icon={<TrendingUp size={18} />} tone="good" />
        <KpiCard title="Unpaid Bills" value={inr(totals.unpaidBills)} icon={<AlertCircle size={18} />} tone={totals.unpaidBills > 0 ? "bad" : "neutral"} />
        <KpiCard title="Net Profit" value={inr(totals.netProfit)} icon={<ReceiptIndianRupee size={18} />} tone={totals.netProfit >= 0 ? "good" : "bad"} hint={`Salary accrued (month): ${inr(totals.salaryAccrued)}`} />
        <KpiCard title="Total Sales" value={inr(totals.totalSales)} icon={<ShoppingBag size={18} />} />
        <KpiCard title="Expenses (total)" value={inr(totals.totalExpenses)} icon={<ReceiptIndianRupee size={18} />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card gradientTop="cyan">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-extrabold text-slate-900">Daily sales (Cash vs Online)</div>
              <div className="text-xs text-slate-500">Last 7 entries</div>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, color: "#0f172a", boxShadow: "0 12px 30px rgba(15,23,42,0.08)" }} />
                <Bar dataKey="Cash" fill="#14B8A6" radius={[10, 10, 0, 0]} />
                <Bar dataKey="Online" fill="#06B6D4" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card gradientTop="gold">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-extrabold text-slate-900">Expense breakdown</div>
              <div className="text-xs text-slate-500">All time by category</div>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expByCat} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                  {expByCat.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={["#14B8A6", "#06B6D4", "#FBBF24", "#F97316", "#8B5CF6", "#EC4899"][idx % 6]}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, color: "#0f172a" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card gradientTop="purple">
          <div className="mb-3">
            <div className="text-sm font-extrabold text-slate-900">Recent transactions</div>
            <div className="text-xs text-slate-500">Latest sales + expenses + supplier payments</div>
          </div>
          <div className="grid gap-2">
            {recentTx.map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 transition hover:bg-white hover:shadow-sm">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{t.kind}</div>
                  <div className="text-xs text-slate-500">{t.date}</div>
                </div>
                <div className={t.amount >= 0 ? "font-bold text-emerald-600" : "font-bold text-rose-600"}>{inr(Math.abs(t.amount))}</div>
              </div>
            ))}
            {!recentTx.length ? <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No transactions yet.</div> : null}
          </div>
        </Card>

        <Card gradientTop="orange">
          <div className="mb-3">
            <div className="text-sm font-extrabold text-slate-900">Upcoming payments & reminders</div>
            <div className="text-xs text-slate-500">Bills due soon and your custom reminders</div>
          </div>
          <div className="grid gap-2">
            {upcomingBills.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{b.title}</div>
                  <div className="text-xs text-slate-500">
                    {b.days < 0 ? `${Math.abs(b.days)}d overdue` : b.days === 0 ? "Due today" : `in ${b.days} days`}
                  </div>
                </div>
                <div className="font-bold text-rose-600">{inr(b.amount)}</div>
              </div>
            ))}
            {upcomingReminders.map((r) => (
              <div key={(r as any).id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{r.title}</div>
                  <div className="text-xs text-slate-500">
                    Due {r.dueDate} • in {r.days} days
                  </div>
                </div>
                <div className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700">Reminder</div>
              </div>
            ))}
            {!upcomingBills.length && !upcomingReminders.length ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No upcoming items.</div>
            ) : null}
          </div>
        </Card>
      </div>

      {(sales.error || expenses.error || supplierBills.error) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Data error: {sales.error ?? expenses.error ?? supplierBills.error}
        </div>
      )}
    </div>
  );
}

