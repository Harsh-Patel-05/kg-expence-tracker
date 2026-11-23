import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { AttendanceDoc, AttendanceStatus, EmployeeDoc } from "../types";
import { upsertAttendance, bulkMarkAttendance } from "../services/employeeService";
import { canEditEmployees } from "../utils/permissions";
import { presentEquivalent } from "../utils/payroll";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";

import { ContentLoading } from "@/components/ui/Loading";

const STATUSES: AttendanceStatus[] = ["present", "half-day", "absent", "late", "holiday", "week_off", "on_leave"];

export function AttendancePage() {
  const { role } = usePosAuth();
  const canEdit = canEditEmployees(role);
  const [date, setDate] = useState(isoDate());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});

  const { data: staff } = useRestaurantCollection<EmployeeDoc>({ path: "staff" });
  const { data: attendance, loading } = useRestaurantCollection<AttendanceDoc>({ path: "attendance" });

  const active = useMemo(() => staff.filter((s) => s.active !== false), [staff]);
  const dayRows = useMemo(
    () => attendance.filter((a) => String(a.date || "").slice(0, 10) === date),
    [attendance, date]
  );

  const presentEq = dayRows.reduce((s, a) => s + presentEquivalent(a.status), 0);

  function statusFor(name: string): AttendanceStatus {
    return marks[name] || (dayRows.find((a) => a.name.toLowerCase() === name.toLowerCase())?.status as AttendanceStatus) || "present";
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
      status: existing?.status || "present",
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
          <input type="date" className="kg-input !w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
          <button
            disabled={!canEdit || busy}
            onClick={saveAll}
            className="kg-btn kg-btn-primary disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save day sheet"}
          </button>
          </>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard title="Staff" value={String(active.length)} />
        <KpiCard title="Marked" value={String(dayRows.length)} />
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
