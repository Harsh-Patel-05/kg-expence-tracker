import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { AttendanceDoc, AttendanceStatus, EmployeeDoc } from "../types";
import { upsertAttendance, bulkMarkAttendance } from "../services/employeeService";
import { canEditEmployees } from "../utils/permissions";
import { attendanceDatesForMonth, monthISO, presentEquivalent } from "../utils/payroll";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { ContentLoading } from "@/components/ui/Loading";

const STATUSES: AttendanceStatus[] = ["present", "half-day", "absent", "late", "holiday", "week_off", "on_leave"];

export function AttendancePage() {
  const { role } = usePosAuth();
  const canEdit = canEditEmployees(role);
  const [month, setMonth] = useState(monthISO());
  const [date, setDate] = useState(isoDate());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});

  const { data: staff } = useRestaurantCollection<EmployeeDoc>({ path: "staff" });
  const { data: attendance, loading } = useRestaurantCollection<AttendanceDoc>({ path: "attendance", max: 2000 });

  const active = useMemo(() => staff.filter((s) => s.active !== false), [staff]);
  const days = useMemo(() => attendanceDatesForMonth(month), [month]);
  const dayRows = useMemo(
    () => attendance.filter((a) => String(a.date || "").slice(0, 10) === date),
    [attendance, date]
  );

  const presentEq = dayRows.reduce((s, a) => s + presentEquivalent(a.status), 0);
  const monthSavedDays = useMemo(() => {
    const set = new Set(
      attendance.filter((a) => String(a.date || "").slice(0, 7) === month).map((a) => String(a.date).slice(0, 10))
    );
    return set.size;
  }, [attendance, month]);

  function statusFor(name: string): AttendanceStatus {
    return (
      marks[name] ||
      (dayRows.find((a) => a.name.toLowerCase() === name.toLowerCase())?.status as AttendanceStatus) ||
      "present"
    );
  }

  function daySummary(iso: string) {
    const rows = attendance.filter((a) => String(a.date || "").slice(0, 10) === iso);
    let presentEqDay = 0;
    rows.forEach((r) => {
      presentEqDay += presentEquivalent(r.status);
    });
    return { marked: rows.length, presentEq: presentEqDay, staff: active.length };
  }

  function selectDate(iso: string) {
    setDate(iso);
    setMonth(iso.slice(0, 7));
    setMarks({});
  }

  function onMonthChange(m: string) {
    setMonth(m);
    const list = attendanceDatesForMonth(m);
    if (!date.startsWith(m) && list.length) selectDate(list[list.length - 1]);
    else if (!list.length) selectDate(`${m}-01`);
  }

  function copyFromPrevDay() {
    const i = days.indexOf(date);
    if (i <= 0) {
      setMsg("No previous day in this month");
      return;
    }
    const prev = days[i - 1];
    const prevRows = attendance.filter((a) => String(a.date || "").slice(0, 10) === prev);
    const next: Record<string, AttendanceStatus> = {};
    active.forEach((s) => {
      const hit = prevRows.find((a) => a.name.toLowerCase() === s.name.toLowerCase());
      if (hit?.status) next[s.name] = hit.status;
    });
    setMarks(next);
    setMsg(`Copied from ${prev} — click Save day sheet to store for ${date}`);
  }

  async function saveAll() {
    if (!canEdit) return;
    try {
      setBusy(true);
      await bulkMarkAttendance({
        date,
        rows: active.map((s) => ({
          name: s.name,
          staffId: s.id,
          status: statusFor(s.name)
        }))
      });
      setMsg("Attendance saved");
      setMarks({});
    } catch (e: any) {
      setMsg(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function clock(name: string, staffId: string, kind: "in" | "out") {
    if (!canEdit) return;
    const now = new Date().toTimeString().slice(0, 5);
    const existing = dayRows.find((a) => a.name.toLowerCase() === name.toLowerCase());
    await upsertAttendance({
      id: existing?.id,
      date,
      name,
      staffId,
      status: existing?.status || statusFor(name),
      clockIn: kind === "in" ? now : existing?.clockIn,
      clockOut: kind === "out" ? now : existing?.clockOut
    });
    setMsg(`Clock ${kind} recorded for ${name}`);
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/hr" className="text-xs font-semibold text-primary"> ← HR </Link>}
        title="Attendance"
        actions={
          <>
            <input type="month" className="kg-input !w-auto" value={month} onChange={(e) => onMonthChange(e.target.value)} />
            <input
              type="date"
              className="kg-input !w-auto"
              value={date}
              onChange={(e) => selectDate(e.target.value)}
            />
            <button
              type="button"
              disabled={!canEdit}
              onClick={copyFromPrevDay}
              className="kg-btn kg-btn-secondary disabled:opacity-50"
            >
              Copy prev day
            </button>
            <button disabled={!canEdit || busy} onClick={saveAll} className="kg-btn kg-btn-primary disabled:opacity-50">
              {busy ? "Saving…" : "Save day sheet"}
            </button>
          </>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <Card hover={false} padding="sm">
        <div className="mb-2 text-[12px] font-semibold text-text-secondary">
          Day strip · {monthSavedDays} day(s) saved this month
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {days.map((iso) => {
            const sum = daySummary(iso);
            const selected = iso === date;
            const empty = !sum.marked;
            const partial = sum.marked > 0 && sum.marked < sum.staff;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => selectDate(iso)}
                className={clsx(
                  "flex min-w-[44px] flex-col items-center rounded-lg border px-2 py-1.5 text-[11px] font-semibold",
                  selected
                    ? "border-primary bg-primary text-white"
                    : empty
                      ? "border-stroke-0 bg-bg-1 text-text-muted"
                      : partial
                        ? "border-warning/40 bg-warning-bg text-warning"
                        : "border-success/30 bg-success-bg text-success"
                )}
              >
                <span>{parseInt(iso.slice(8, 10), 10)}</span>
                <span className={clsx("text-[9px]", selected ? "text-white/80" : "")}>
                  {sum.marked ? `${sum.marked}/${sum.staff}` : "—"}
                </span>
              </button>
            );
          })}
          {!days.length ? <div className="text-[12px] text-text-muted">No dates for this month yet.</div> : null}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard title="Staff" value={String(active.length)} />
        <KpiCard title="Marked today" value={String(dayRows.length)} />
        <KpiCard title="Present eq" value={String(presentEq)} />
      </div>

      {loading ? <ContentLoading variant="block" label="Loading" /> : null}

      <Card hover={false} className="!p-0">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Clock</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {active.map((s) => {
              const row = dayRows.find((a) => a.name.toLowerCase() === s.name.toLowerCase());
              return (
                <tr key={s.id} className="border-t border-stroke-0">
                  <td className="px-3 py-2 font-semibold">{s.name}</td>
                  <td className="px-3 py-2">
                    <select
                      disabled={!canEdit}
                      className="kg-input !w-auto"
                      value={statusFor(s.name)}
                      onChange={(e) => setMarks((m) => ({ ...m, [s.name]: e.target.value as AttendanceStatus }))}
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-text-secondary">
                    {row?.clockIn || "—"} → {row?.clockOut || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button className="text-xs font-semibold text-primary" disabled={!canEdit} onClick={() => clock(s.name, s.id, "in")}>
                        In
                      </button>
                      <button className="text-xs font-semibold text-primary" disabled={!canEdit} onClick={() => clock(s.name, s.id, "out")}>
                        Out
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!active.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="Add employees first." /> : null}
      </Card>
    </div>
  );
}
