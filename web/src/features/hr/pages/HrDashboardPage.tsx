import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";
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
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";

import { ContentLoading } from "@/components/ui/Loading";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <KpiCard title={label} value={String(value)} hint={hint} />;
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
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Staff & HR"
        title="Workforce command"
        actions={
          <>
          <Link to="/hr/employees" className="kg-btn kg-btn-primary">
            Employees
          </Link>
          <Link to="/hr/attendance" className="kg-btn kg-btn-secondary">
            Attendance
          </Link>
          <Link to="/hr/leave" className="kg-btn kg-btn-secondary">
            Leave
          </Link>
          <Link to="/hr/payroll" className="kg-btn kg-btn-secondary">
            Payroll
          </Link>
          <Link to="/hr/shifts" className="kg-btn kg-btn-secondary">
            Shifts
          </Link>
          <Link to="/tasks" className="kg-btn kg-btn-secondary">
            Tasks
          </Link>
          <Link to="/reminders" className="kg-btn kg-btn-secondary">
            Reminders
          </Link>
          </>
        }
      />

      {loading ? <ContentLoading variant="block" label="Loading" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        <Card padding="sm" hover={false}>
          <SectionTitle title="Today's attendance" />
          <div className="max-h-72 space-y-2 overflow-auto">
            {activeStaff.slice(0, 12).map((s) => {
              const row = todayAtt.find((a) => a.name.toLowerCase() === s.name.toLowerCase());
              return (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]">
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-text-muted">
                      {s.department || "—"} · {s.designation || s.role || "staff"}
                    </div>
                  </div>
                  <span className="rounded-md bg-card-0 px-2 py-0.5 text-[10px] font-bold uppercase text-text-secondary">
                    {row?.status || "unmarked"}
                  </span>
                </div>
              );
            })}
            {!activeStaff.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No employees yet." /> : null}
          </div>
        </Card>

        <Card padding="sm" hover={false}>
          <SectionTitle title="Pending leave approvals" />
          <div className="max-h-72 space-y-2 overflow-auto">
            {pendingLeave.slice(0, 10).map((l) => (
              <div key={l.id} className="rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]">
                <div className="font-semibold">
                  {l.name} · {l.leaveType}
                </div>
                <div className="text-xs text-text-muted">
                  {l.fromDate} → {l.toDate} ({l.days}d)
                </div>
              </div>
            ))}
            {!pendingLeave.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No pending leave." /> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
