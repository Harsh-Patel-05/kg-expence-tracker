import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type {
  AdvanceDoc,
  AttendanceDoc,
  EmployeeDoc,
  LeaveRequestDoc,
  ReminderDoc,
  SalaryDoc,
  TaskDoc
} from "../types";
import { attendanceStatsForMonth, monthISO, presentEquivalent } from "../utils/payroll";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </motion.div>
  );
}

export function HrDashboardPage() {
  const today = isoDate();
  const month = monthISO();
  const { data: staff, loading } = useRestaurantCollection<EmployeeDoc>({ path: "staff" });
  const { data: attendance } = useRestaurantCollection<AttendanceDoc>({ path: "attendance" });
  const { data: leaves } = useRestaurantCollection<LeaveRequestDoc>({ path: "leaveRequests" });
  const { data: salaries } = useRestaurantCollection<SalaryDoc>({ path: "salaries" });
  const { data: advances } = useRestaurantCollection<AdvanceDoc>({ path: "advances" });
  const { data: tasks } = useRestaurantCollection<TaskDoc>({ path: "tasks" });
  const { data: reminders } = useRestaurantCollection<ReminderDoc>({ path: "reminders" });

  const activeStaff = useMemo(() => staff.filter((s) => s.active !== false && !s.isDeleted), [staff]);
  const todayAtt = useMemo(
    () => attendance.filter((a) => String(a.date || "").slice(0, 10) === today),
    [attendance, today]
  );
  const presentEq = todayAtt.reduce((s, a) => s + presentEquivalent(a.status), 0);
  const pendingLeave = leaves.filter((l) => l.approvalStatus === "pending");
  const unpaidSalaries = salaries.filter((s) => s.status === "unpaid" && String(s.month || "").slice(0, 7) === month);
  const openAdvances = advances.reduce((s, a) => s + Math.max(0, num(a.amount) - num(a.recovered)), 0);
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const overdueReminders = reminders.filter(
    (r) => !r.completed && !r.done && String(r.dueDate || "") < today && r.enabled !== false
  );

  const attendancePct = useMemo(() => {
    if (!activeStaff.length) return 0;
    const eqs = activeStaff.map((s) => attendanceStatsForMonth(s.name, month, attendance).presentEq);
    const avg = eqs.reduce((a, b) => a + b, 0) / Math.max(1, activeStaff.length);
    return Math.round((avg / 30) * 100);
  }, [activeStaff, attendance, month]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Staff & HR</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Workforce command</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/hr/employees" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            Employees
          </Link>
          <Link to="/hr/attendance" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Attendance
          </Link>
          <Link to="/hr/leave" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Leave
          </Link>
          <Link to="/hr/payroll" className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white">
            Payroll
          </Link>
          <Link to="/hr/shifts" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Shifts
          </Link>
          <Link to="/tasks" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Tasks
          </Link>
          <Link to="/reminders" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Reminders
          </Link>
        </div>
      </div>

      {loading ? <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active staff" value={activeStaff.length} hint={`${presentEq} present eq today`} />
        <Stat label="Attendance %" value={`${attendancePct}%`} hint={`Month ${month}`} />
        <Stat label="Pending leave" value={pendingLeave.length} />
        <Stat label="Unpaid salaries" value={unpaidSalaries.length} hint={month} />
        <Stat label="Open advances" value={inr(openAdvances)} />
        <Stat label="Open tasks" value={openTasks.length} />
        <Stat label="Overdue reminders" value={overdueReminders.length} />
        <Stat label="Marked today" value={`${todayAtt.length}/${activeStaff.length}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">Today's attendance</div>
          <div className="max-h-72 space-y-2 overflow-auto">
            {activeStaff.slice(0, 12).map((s) => {
              const row = todayAtt.find((a) => a.name.toLowerCase() === s.name.toLowerCase());
              return (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-slate-500">
                      {s.department || "—"} · {s.designation || s.role || "staff"}
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                    {row?.status || "unmarked"}
                  </span>
                </div>
              );
            })}
            {!activeStaff.length ? <div className="py-8 text-center text-sm text-slate-500">No employees yet.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">Pending leave approvals</div>
          <div className="max-h-72 space-y-2 overflow-auto">
            {pendingLeave.slice(0, 10).map((l) => (
              <div key={l.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <div className="font-semibold">
                  {l.name} · {l.leaveType}
                </div>
                <div className="text-xs text-slate-500">
                  {l.fromDate} → {l.toDate} ({l.days}d)
                </div>
              </div>
            ))}
            {!pendingLeave.length ? <div className="py-8 text-center text-sm text-slate-500">No pending leave.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
