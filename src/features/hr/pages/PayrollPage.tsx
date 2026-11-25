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
import {
  createAdvance,
  createIncentive,
  createTip,
  payFullStaffSalary,
  postSalary,
  toggleSalaryPaid
} from "../services/payrollService";
import { softDeleteAdvance } from "@/lib/softDelete";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { downloadStaffSalaryPdf } from "../utils/salarySlipPdf";

export function PayrollPage() {
  const { role } = usePosAuth();
  const canRun = canRunPayroll(role);
  const [month, setMonth] = useState(monthISO());
  const [tab, setTab] = useState<"run" | "history" | "advances" | "incentives" | "tips">("run");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payMethod, setPayMethod] = useState<"cash" | "online" | "bank" | "upi">("cash");

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
          salaries,
          incentives,
          tips
        })
      ),
    [active, month, fixed, attendance, advances, salaries, incentives, tips]
  );

  const payrollTotals = useMemo(
    () =>
      payrollRows.reduce(
        (a, r) => ({
          monthly: a.monthly + num(r.monthlyFixed),
          earned: a.earned + num(r.earned),
          advances: a.advances + num(r.advances),
          leave: a.leave + num(r.leaveDeduction),
          net: a.net + num(r.monthEndPayable ?? r.net)
        }),
        { monthly: 0, earned: 0, advances: 0, leave: 0, net: 0 }
      ),
    [payrollRows]
  );

  const monthSalaries = useMemo(
    () => salaries.filter((s) => String(s.month || "").slice(0, 7) === month).sort((a, b) => a.name.localeCompare(b.name)),
    [salaries, month]
  );

  const [advForm, setAdvForm] = useState({
    name: "",
    amount: "",
    method: "cash" as "cash" | "online",
    note: ""
  });
  const [incForm, setIncForm] = useState({ name: "", amount: "", type: "performance" as const, note: "" });
  const [tipForm, setTipForm] = useState({ name: "", amount: "", mode: "cash" as const });
  const [salaryPdfOpen, setSalaryPdfOpen] = useState(false);
  const [salaryPdfStaff, setSalaryPdfStaff] = useState("");

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
            <button type="button" className="kg-btn kg-btn-secondary" onClick={() => setSalaryPdfOpen(true)}>
              Download salary slip PDF
            </button>
          </>
        }
      />

      {salaryPdfOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card hover={false} className="w-full max-w-md">
            <div className="mb-3 text-[15px] font-bold text-text-primary">Download salary slip PDF</div>
            <select
              className="kg-input mb-2 w-full"
              value={salaryPdfStaff}
              onChange={(e) => setSalaryPdfStaff(e.target.value)}
            >
              <option value="">— Select employee —</option>
              <option value="__ALL__">All employees</option>
              {active.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <input type="month" className="kg-input mb-3 w-full" value={month} onChange={(e) => setMonth(e.target.value)} />
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="kg-btn kg-btn-secondary" onClick={() => setSalaryPdfOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="kg-btn kg-btn-primary"
                onClick={() => {
                  const selected = salaryPdfStaff.trim();
                  if (!selected) {
                    setMsg("Please select an employee");
                    return;
                  }
                  const names =
                    selected === "__ALL__" ? active.map((s) => s.name).filter(Boolean) : [selected];
                  if (!names.length) {
                    setMsg("No employees");
                    return;
                  }
                  try {
                    downloadStaffSalaryPdf({
                      names,
                      month,
                      staff: active,
                      fixedSalaries: fixed,
                      attendance,
                      advances,
                      salaries,
                      incentives,
                      tips
                    });
                    setSalaryPdfOpen(false);
                    setMsg("Print dialog opened — Save as PDF (no pop-up needed)");
                  } catch (e: unknown) {
                    setMsg(e instanceof Error ? e.message : "PDF failed");
                  }
                }}
              >
                Download PDF
              </button>
            </div>
          </Card>
        </div>
      ) : null}

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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="Fixed monthly" value={inr(Math.round(payrollTotals.monthly))} />
            <KpiCard title="Earned (attendance)" value={inr(Math.round(payrollTotals.earned))} />
            <KpiCard title="Advances + carry" value={inr(Math.round(payrollTotals.advances))} />
            <KpiCard title="To pay at month end" value={inr(Math.round(payrollTotals.net))} tone={payrollTotals.net >= 0 ? "good" : "bad"} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select className="kg-input !w-auto" value={payMethod} onChange={(e) => setPayMethod(e.target.value as any)}>
              <option value="cash">Pay from cash</option>
              <option value="online">Pay from online/UPI</option>
              <option value="bank">Pay from bank</option>
            </select>
            <button disabled={!canRun || busy} onClick={generateAll} className="kg-btn kg-btn-secondary disabled:opacity-50">
              {busy ? "Working…" : "Generate unpaid slips"}
            </button>
          </div>
          <Card hover={false} className="!p-0 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Present</th>
                  <th className="px-3 py-2">Earned</th>
                  <th className="px-3 py-2">Adv + carry</th>
                  <th className="px-3 py-2">Leave ded.</th>
                  <th className="px-3 py-2">Net payable</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {payrollRows.map((r) => {
                  const slip = monthSalaries.find((s) => s.name.toLowerCase() === r.name.toLowerCase());
                  const settled = r.settled || slip?.status === "paid";
                  return (
                    <tr key={r.name} className="border-t border-stroke-0">
                      <td className="px-3 py-2 font-semibold">
                        {r.name}
                        {settled ? <span className="ml-1 text-[10px] font-bold text-success">PAID</span> : null}
                      </td>
                      <td className="px-3 py-2">{r.presentEquivalent}</td>
                      <td className="px-3 py-2">{inr(Math.round(r.earned))}</td>
                      <td className="px-3 py-2">
                        {inr(Math.round(r.advances))}
                        {num(r.carryIn) > 0 ? (
                          <div className="text-[10px] text-text-muted">incl. carry {inr(Math.round(num(r.carryIn)))}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{inr(Math.round(r.leaveDeduction || 0))}</td>
                      <td
                        className={`px-3 py-2 font-bold ${num(r.monthEndPayable ?? r.net) < 0 ? "text-danger" : ""}`}
                      >
                        {inr(Math.round(r.monthEndPayable ?? r.net))}
                        {num(r.carryOut) > 0 ? (
                          <div className="text-[10px] font-semibold text-danger">
                            runs −{inr(Math.round(num(r.carryOut)))} → next month
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canRun && !settled ? (
                          <button
                            disabled={busy}
                            className="text-xs font-semibold text-primary disabled:opacity-50"
                            onClick={async () => {
                              try {
                                setBusy(true);
                                const emp = active.find((s) => s.name.toLowerCase() === r.name.toLowerCase());
                                const payable = num(r.monthEndPayable ?? r.net);
                                await payFullStaffSalary({
                                  name: r.name,
                                  staffId: emp?.id,
                                  month,
                                  earned: Math.round(r.earned),
                                  // Pay only what's due; leftover advance stays for next month
                                  netPay: Math.max(0, Math.round(payable)),
                                  advanceAdjusted: Math.round(r.advances),
                                  paymentMethod: payMethod,
                                  existingSalaryId: slip?.id
                                });
                                setMsg(
                                  payable < 0
                                    ? `Marked ${r.name} paid ₹0 · ${inr(Math.abs(Math.round(payable)))} advance carries to next month`
                                    : `Paid full salary for ${r.name}`
                                );
                              } catch (e: any) {
                                setMsg(e?.message || "Pay failed");
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {num(r.monthEndPayable ?? r.net) < 0 ? "Clear month (₹0)" : "Pay full"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
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
            <select
              className="kg-input mb-2 w-full"
              value={advForm.method}
              onChange={(e) => setAdvForm((f) => ({ ...f, method: e.target.value as "cash" | "online" }))}
            >
              <option value="cash">Cash</option>
              <option value="online">Online</option>
            </select>
            <input
              type="number"
              placeholder="Advance amount"
              className="kg-input mb-2 w-full"
              value={advForm.amount}
              onChange={(e) => setAdvForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <p className="mb-2 text-[11px] leading-snug text-text-muted">
              Cash / Online advance deducts from that pocket now. Delete restores the balance.{" "}
              <strong>Pay full</strong> pays remaining = earned − advances (no double count).
            </p>
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
                setMsg(`Advance recorded (${advForm.method === "online" ? "Online" : "Cash"})`);
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
                  <th className="px-3 py-2">Paid from</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {advances
                  .filter((a) => String(a.month || "").slice(0, 7) === month)
                  .map((a) => {
                    const from =
                      a.paidFrom === "bank" || a.method === "online" || a.method === "bank" || a.method === "upi"
                        ? "Online"
                        : "Cash";
                    return (
                      <tr key={a.id} className="border-t border-stroke-0">
                        <td className="px-3 py-2">{a.date}</td>
                        <td className="px-3 py-2 font-semibold">{a.name}</td>
                        <td className="px-3 py-2">{from}</td>
                        <td className="px-3 py-2">{inr(a.amount)}</td>
                        <td className="px-3 py-2">{a.month}</td>
                        <td className="px-3 py-2 text-right">
                          {canRun ? (
                            <button
                              type="button"
                              className="text-xs font-semibold text-danger"
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Delete advance ${inr(a.amount)} for ${a.name}? ${from} balance will be restored.`
                                  )
                                ) {
                                  return;
                                }
                                void softDeleteAdvance(a.id).then(() => setMsg("Advance deleted — balance restored."));
                              }}
                            >
                              Delete
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
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
