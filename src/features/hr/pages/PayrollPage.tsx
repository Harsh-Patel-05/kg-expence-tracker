import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type {
  AdvanceDoc,
  AttendanceDoc,
  EmployeeDoc,
  FixedSalaryDoc,
  IncentiveDoc,
  SalaryDoc,
  TipDoc
} from "../types";
import { calcPayrollForMonth, monthISO } from "../utils/payroll";
import { canRunPayroll } from "../utils/permissions";
import { createAdvance, createIncentive, createTip, postSalary, toggleSalaryPaid } from "../services/payrollService";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";

export function PayrollPage() {
  const { role } = usePosAuth();
  const canRun = canRunPayroll(role);
  const [month, setMonth] = useState(monthISO());
  const [tab, setTab] = useState<"run" | "history" | "advances" | "incentives" | "tips">("run");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: staff } = useRestaurantCollection<EmployeeDoc>({ path: "staff" });
  const { data: attendance } = useRestaurantCollection<AttendanceDoc>({ path: "attendance" });
  const { data: fixed } = useRestaurantCollection<FixedSalaryDoc>({ path: "fixedSalaries" });
  const { data: advances } = useRestaurantCollection<AdvanceDoc>({ path: "advances" });
  const { data: incentives } = useRestaurantCollection<IncentiveDoc>({ path: "incentives" });
  const { data: tips } = useRestaurantCollection<TipDoc>({ path: "tips" });
  const { data: salaries } = useRestaurantCollection<SalaryDoc>({ path: "salaries" });

  const active = useMemo(() => staff.filter((s) => s.active !== false), [staff]);

  const payrollRows = useMemo(
    () =>
      active.map((s) =>
        calcPayrollForMonth({
          name: s.name,
          month,
          staff: s,
          fixedSalaries: fixed,
          attendance,
          advances,
          incentives,
          tips
        })
      ),
    [active, month, fixed, attendance, advances, incentives, tips]
  );

  const payrollTotals = useMemo(
    () =>
      payrollRows.reduce(
        (a, r) => {
          const leaveDays = num(r.absent) + num(r.half) * 0.5;
          const leaveDeduction = (num(r.monthlyFixed) / 30) * leaveDays;
          const monthEnd = num(r.monthlyFixed) - num(r.advances) - leaveDeduction;
          return {
            monthly: a.monthly + num(r.monthlyFixed),
            advances: a.advances + num(r.advances),
            leave: a.leave + leaveDeduction,
            net: a.net + monthEnd
          };
        },
        { monthly: 0, advances: 0, leave: 0, net: 0 }
      ),
    [payrollRows]
  );

  const monthSalaries = useMemo(
    () => salaries.filter((s) => String(s.month || "").slice(0, 7) === month).sort((a, b) => a.name.localeCompare(b.name)),
    [salaries, month]
  );

  const [advForm, setAdvForm] = useState({ name: "", amount: "", method: "cash" as const, note: "" });
  const [incForm, setIncForm] = useState({ name: "", amount: "", type: "performance" as const, note: "" });
  const [tipForm, setTipForm] = useState({ name: "", amount: "", mode: "cash" as const });

  async function generateAll() {
    if (!canRun) return;
    try {
      setBusy(true);
      for (const row of payrollRows) {
        if (row.earned <= 0 && row.net <= 0) continue;
        const already = monthSalaries.find((s) => s.name.toLowerCase() === row.name.toLowerCase());
        if (already) continue;
        const emp = active.find((s) => s.name.toLowerCase() === row.name.toLowerCase());
        await postSalary({
          name: row.name,
          staffId: emp?.id,
          month,
          amount: Math.round(row.earned),
          netSalary: Math.round(row.net),
          advanceAdjusted: Math.round(row.advances),
          basic: Math.round(row.earned),
          status: "unpaid"
        });
      }
      setMsg("Payroll generated for unmarked staff");
      setTab("history");
    } catch (e: any) {
      setMsg(e?.message || "Payroll failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/hr" className="text-xs font-semibold text-primary"> ← HR </Link>}
        title="Payroll & advances"
        actions={
          <>
          <input type="month" className="kg-input !w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
          </>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <div className="flex flex-wrap gap-2">
        {(["run", "history", "advances", "incentives", "tips"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`kg-btn capitalize ${tab === t ? "kg-btn-primary" : "kg-btn-secondary"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "run" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard title="Total monthly salary" value={inr(Math.round(payrollTotals.monthly))} />
            <KpiCard title="Total advances given" value={inr(Math.round(payrollTotals.advances))} />
            <KpiCard title="To pay at month end" value={inr(Math.round(payrollTotals.net))} tone={payrollTotals.net >= 0 ? "good" : "bad"} />
          </div>
          <div className="flex justify-end">
            <button
              disabled={!canRun || busy}
              onClick={generateAll}
              className="kg-btn kg-btn-primary disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate payslips"}
            </button>
          </div>
          <Card hover={false} className="!p-0">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Present eq</th>
                  <th className="px-3 py-2">Earned</th>
                  <th className="px-3 py-2">Advances</th>
                  <th className="px-3 py-2">Incentives</th>
                  <th className="px-3 py-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {payrollRows.map((r) => (
                  <tr key={r.name} className="border-t border-stroke-0">
                    <td className="px-3 py-2 font-semibold">{r.name}</td>
                    <td className="px-3 py-2">{r.presentEquivalent}</td>
                    <td className="px-3 py-2">{inr(r.earned)}</td>
                    <td className="px-3 py-2">{inr(r.advances)}</td>
                    <td className="px-3 py-2">{inr(r.incentives + r.tips)}</td>
                    <td className="px-3 py-2 font-bold">{inr(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}

      {tab === "history" ? (
        <Card hover={false} className="!p-0">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Gross</th>
                <th className="px-3 py-2">Net</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {monthSalaries.map((s) => (
                <tr key={s.id} className="border-t border-stroke-0">
                  <td className="px-3 py-2 font-semibold">{s.name}</td>
                  <td className="px-3 py-2">{inr(s.amount)}</td>
                  <td className="px-3 py-2">{inr(s.netSalary ?? s.amount)}</td>
                  <td className="px-3 py-2 uppercase text-xs font-bold">{s.status}</td>
                  <td className="px-3 py-2 text-right">
                    {canRun ? (
                      <button
                        className="text-xs font-semibold text-primary"
                        onClick={async () => {
                          await toggleSalaryPaid(s.id, s.status !== "paid");
                          setMsg(s.status === "paid" ? "Marked unpaid" : "Marked paid");
                        }}
                      >
                        {s.status === "paid" ? "Mark unpaid" : "Mark paid"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!monthSalaries.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No payslips for this month." /> : null}
        </Card>
      ) : null}

      {tab === "advances" ? (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card padding="sm" hover={false}>
            <div className="mb-2 text-[14px] font-bold text-text-primary">Record advance</div>
            <select
              className="kg-input mb-2 w-full"
              value={advForm.name}
              onChange={(e) => setAdvForm((f) => ({ ...f, name: e.target.value }))}
            >
              <option value="">Employee</option>
              {active.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Amount"
              className="kg-input mb-2 w-full"
              value={advForm.amount}
              onChange={(e) => setAdvForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <button
              disabled={!canRun || !advForm.name}
              className="w-full kg-btn kg-btn-primary disabled:opacity-50"
              onClick={async () => {
                const emp = active.find((s) => s.name === advForm.name);
                await createAdvance({
                  name: advForm.name,
                  staffId: emp?.id,
                  amount: num(advForm.amount),
                  month,
                  date: isoDate(),
                  method: advForm.method,
                  note: advForm.note
                });
                setMsg("Advance recorded");
                setAdvForm({ name: "", amount: "", method: "cash", note: "" });
              }}
            >
              Save advance
            </button>
          </Card>
          <Card hover={false} className="!p-0">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Month</th>
                </tr>
              </thead>
              <tbody>
                {advances
                  .filter((a) => String(a.month || "").slice(0, 7) === month)
                  .map((a) => (
                    <tr key={a.id} className="border-t border-stroke-0">
                      <td className="px-3 py-2">{a.date}</td>
                      <td className="px-3 py-2 font-semibold">{a.name}</td>
                      <td className="px-3 py-2">{inr(a.amount)}</td>
                      <td className="px-3 py-2">{a.month}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}

      {tab === "incentives" ? (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card padding="sm" hover={false}>
            <div className="mb-2 text-[14px] font-bold text-text-primary">Add incentive</div>
            <select className="kg-input mb-2 w-full" value={incForm.name} onChange={(e) => setIncForm((f) => ({ ...f, name: e.target.value }))}>
              <option value="">Employee</option>
              {active.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <select className="kg-input mb-2 w-full" value={incForm.type} onChange={(e) => setIncForm((f) => ({ ...f, type: e.target.value as any }))}>
              <option value="sales">Sales</option>
              <option value="performance">Performance</option>
              <option value="attendance">Attendance</option>
              <option value="festival">Festival</option>
              <option value="custom">Custom</option>
            </select>
            <input type="number" placeholder="Amount" className="kg-input mb-2 w-full" value={incForm.amount} onChange={(e) => setIncForm((f) => ({ ...f, amount: e.target.value }))} />
            <button
              disabled={!canRun || !incForm.name}
              className="w-full kg-btn kg-btn-primary disabled:opacity-50"
              onClick={async () => {
                const emp = active.find((s) => s.name === incForm.name);
                await createIncentive({ name: incForm.name, staffId: emp?.id, amount: num(incForm.amount), type: incForm.type, month });
                setMsg("Incentive added");
                setIncForm({ name: "", amount: "", type: "performance", note: "" });
              }}
            >
              Save incentive
            </button>
          </Card>
          <Card hover={false} className="!p-0">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {incentives
                  .filter((i) => String(i.month || "").slice(0, 7) === month)
                  .map((i) => (
                    <tr key={i.id} className="border-t border-stroke-0">
                      <td className="px-3 py-2 font-semibold">{i.name}</td>
                      <td className="px-3 py-2 capitalize">{i.type}</td>
                      <td className="px-3 py-2">{inr(i.amount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}

      {tab === "tips" ? (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card padding="sm" hover={false}>
            <div className="mb-2 text-[14px] font-bold text-text-primary">Record tip</div>
            <select className="kg-input mb-2 w-full" value={tipForm.name} onChange={(e) => setTipForm((f) => ({ ...f, name: e.target.value }))}>
              <option value="">Employee (optional for shared)</option>
              {active.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <select className="kg-input mb-2 w-full" value={tipForm.mode} onChange={(e) => setTipForm((f) => ({ ...f, mode: e.target.value as any }))}>
              <option value="cash">Cash</option>
              <option value="online">Online</option>
              <option value="shared">Shared</option>
              <option value="individual">Individual</option>
            </select>
            <input type="number" placeholder="Amount" className="kg-input mb-2 w-full" value={tipForm.amount} onChange={(e) => setTipForm((f) => ({ ...f, amount: e.target.value }))} />
            <button
              disabled={!canRun}
              className="w-full kg-btn kg-btn-primary disabled:opacity-50"
              onClick={async () => {
                const emp = active.find((s) => s.name === tipForm.name);
                await createTip({ amount: num(tipForm.amount), mode: tipForm.mode, name: tipForm.name || undefined, staffId: emp?.id });
                setMsg("Tip recorded");
                setTipForm({ name: "", amount: "", mode: "cash" });
              }}
            >
              Save tip
            </button>
          </Card>
          <Card hover={false} className="!p-0">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {tips
                  .filter((t) => String(t.date || "").slice(0, 7) === month)
                  .map((t) => (
                    <tr key={t.id} className="border-t border-stroke-0">
                      <td className="px-3 py-2">{t.date}</td>
                      <td className="px-3 py-2">{t.name || "Shared"}</td>
                      <td className="px-3 py-2 capitalize">{t.mode}</td>
                      <td className="px-3 py-2">{inr(t.amount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
