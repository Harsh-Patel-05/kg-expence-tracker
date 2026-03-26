import { motion } from "framer-motion";
import { BarChart, Bar, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Landmark, Wallet, TrendingUp, ReceiptIndianRupee, AlertCircle, PiggyBank, ShoppingBag } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { Card } from "@/components/ui/Card";
import { inr } from "@/lib/utils";
import { useRealtimeCollection } from "@/lib/useRealtimeCollection";
import type { ExpenseDoc, SaleDoc, SupplierBillDoc, ReminderDoc, StaffDoc, AttendanceDoc, AdvanceDoc } from "@/lib/firestoreTypes";
import { calcDashboardTotals } from "@/lib/calculations";

const OWNER_USER_ID = "owner"; // owner-only app (single user)

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
  const sales = useRealtimeCollection<SaleDoc>({ path: "sales", userId: OWNER_USER_ID, orderByField: "date" });
  const expenses = useRealtimeCollection<ExpenseDoc>({ path: "expenses", userId: OWNER_USER_ID, orderByField: "date" });
  const supplierBills = useRealtimeCollection<SupplierBillDoc>({ path: "supplierBills", userId: OWNER_USER_ID, orderByField: "dueDate" });
  const reminders = useRealtimeCollection<ReminderDoc>({ path: "reminders", userId: OWNER_USER_ID, orderByField: "dueDate" });
  const staff = useRealtimeCollection<StaffDoc>({ path: "staff", userId: OWNER_USER_ID });
  const attendance = useRealtimeCollection<AttendanceDoc>({ path: "attendance", userId: OWNER_USER_ID, orderByField: "date" });
  const advances = useRealtimeCollection<AdvanceDoc>({ path: "advances", userId: OWNER_USER_ID, orderByField: "date" });

  const totals = calcDashboardTotals({
    sales: sales.data,
    expenses: expenses.data,
    supplierBills: supplierBills.data,
    staff: staff.data,
    attendance: attendance.data,
    advances: advances.data,
    monthISO: monthISO()
  });

  const last7 = [...sales.data]
    .slice()
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .slice(-7)
    .map((s) => ({
      date: s.date.slice(5),
      Cash: s.cashAmount,
      Online: s.onlineAmount
    }));

  const expByCat = Object.entries(
    expenses.data.reduce<Record<string, number>>((acc, e) => {
      const k = e.category ?? "other";
      acc[k] = (acc[k] ?? 0) + (e.amount ?? 0);
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const upcomingBills = supplierBills.data
    .filter((b) => b.status === "unpaid")
    .map((b) => ({ ...b, days: daysFromToday(b.dueDate) }))
    .filter((b) => b.days >= 0 && b.days <= 10)
    .slice(0, 6);

  const upcomingReminders = reminders.data
    .filter((r) => r.enabled)
    .map((r) => ({ ...r, days: daysFromToday(r.dueDate) }))
    .filter((r) => r.days >= 0 && r.days <= (r.daysBefore ?? 5))
    .slice(0, 6);

  const recentTx = [
    ...sales.data.slice(0, 6).map((s) => ({ kind: "Sale", date: s.date, amount: (s.cashAmount ?? 0) + (s.onlineAmount ?? 0) })),
    ...expenses.data.slice(0, 6).map((e) => ({ kind: "Expense", date: e.date, amount: -(e.amount ?? 0) })),
    ...supplierBills.data
      .filter((b) => b.status === "paid")
      .slice(0, 6)
      .map((b) => ({ kind: "Supplier paid", date: b.paidAt ?? b.billDate, amount: -(b.amount ?? 0) }))
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8);

  return (
    <div className="grid gap-4">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl border border-stroke-0 bg-card-0 p-4 backdrop-blur"
      >
        <div className="text-sm text-white/70">Welcome back</div>
        <div className="mt-1 text-2xl font-semibold">
          Mihir <span className="text-white/70">👋</span>
        </div>
        <div className="mt-1 text-xs text-white/55">Your balances, bills, profit, and reminders — live from Firebase.</div>
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
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Daily sales (Cash vs Online)</div>
              <div className="text-xs text-white/55">Last 7 entries</div>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7}>
                <CartesianGrid stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="date" stroke="rgba(226,232,240,0.65)" fontSize={12} />
                <YAxis stroke="rgba(226,232,240,0.65)" fontSize={12} />
                <Tooltip contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 12 }} />
                <Bar dataKey="Cash" fill="rgba(99,102,241,0.85)" radius={[8, 8, 0, 0]} />
                <Bar dataKey="Online" fill="rgba(16,185,129,0.75)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Expense breakdown</div>
              <div className="text-xs text-white/55">All time by category</div>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expByCat} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                  {expByCat.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={["rgba(99,102,241,0.85)", "rgba(16,185,129,0.8)", "rgba(244,63,94,0.75)", "rgba(251,191,36,0.75)", "rgba(56,189,248,0.75)"][idx % 5]}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3">
            <div className="text-sm font-semibold">Recent transactions</div>
            <div className="text-xs text-white/55">Latest sales + expenses + supplier payments</div>
          </div>
          <div className="grid gap-2">
            {recentTx.map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-stroke-0 bg-white/5 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm">{t.kind}</div>
                  <div className="text-xs text-white/55">{t.date}</div>
                </div>
                <div className={t.amount >= 0 ? "text-emerald-300" : "text-rose-300"}>{inr(Math.abs(t.amount))}</div>
              </div>
            ))}
            {!recentTx.length ? <div className="text-sm text-white/60">No transactions yet.</div> : null}
          </div>
        </Card>

        <Card>
          <div className="mb-3">
            <div className="text-sm font-semibold">Upcoming payments & reminders</div>
            <div className="text-xs text-white/55">Bills due soon and your custom reminders</div>
          </div>
          <div className="grid gap-2">
            {upcomingBills.map((b) => (
              <div key={(b as any).id} className="flex items-center justify-between rounded-xl border border-stroke-0 bg-white/5 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm">Supplier bill</div>
                  <div className="text-xs text-white/55">
                    Due {b.dueDate} • in {b.days} days
                  </div>
                </div>
                <div className="text-rose-200">{inr(b.amount)}</div>
              </div>
            ))}
            {upcomingReminders.map((r) => (
              <div key={(r as any).id} className="flex items-center justify-between rounded-xl border border-stroke-0 bg-white/5 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm">{r.title}</div>
                  <div className="text-xs text-white/55">
                    Due {r.dueDate} • in {r.days} days
                  </div>
                </div>
                <div className="text-indigo-200">Reminder</div>
              </div>
            ))}
            {!upcomingBills.length && !upcomingReminders.length ? <div className="text-sm text-white/60">No upcoming items.</div> : null}
          </div>
        </Card>
      </div>

      {(sales.error || expenses.error || supplierBills.error) && (
        <div className="text-sm text-rose-200">
          Data error: {sales.error ?? expenses.error ?? supplierBills.error}
        </div>
      )}
    </div>
  );
}

