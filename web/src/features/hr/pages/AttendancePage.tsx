import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { AttendanceDoc, AttendanceStatus, EmployeeDoc } from "../types";
import { upsertAttendance, bulkMarkAttendance } from "../services/employeeService";
import { canEditEmployees } from "../utils/permissions";
import { presentEquivalent } from "../utils/payroll";

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/hr" className="text-xs font-semibold text-cyan-700">
            ← HR
          </Link>
          <h1 className="text-2xl font-black text-slate-900">Attendance</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
          <button
            disabled={!canEdit || busy}
            onClick={saveAll}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save day sheet"}
          </button>
        </div>
      </div>

      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-500">Staff</div>
          <div className="text-2xl font-black">{active.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-500">Marked</div>
          <div className="text-2xl font-black">{dayRows.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-500">Present eq</div>
          <div className="text-2xl font-black">{presentEq}</div>
        </div>
      </div>

      {loading ? <div className="h-32 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
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
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">{s.name}</td>
                  <td className="px-3 py-2">
                    <select
                      disabled={!canEdit}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
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
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {row?.clockIn || "—"} → {row?.clockOut || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button className="text-xs font-semibold text-cyan-700" disabled={!canEdit} onClick={() => clock(s.name, s.id, "in")}>
                        In
                      </button>
                      <button className="text-xs font-semibold text-cyan-700" disabled={!canEdit} onClick={() => clock(s.name, s.id, "out")}>
                        Out
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!active.length ? <div className="py-10 text-center text-sm text-slate-500">Add employees first.</div> : null}
      </div>
    </div>
  );
}
