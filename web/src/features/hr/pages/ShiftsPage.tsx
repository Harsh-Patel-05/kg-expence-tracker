import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { EmployeeDoc, PerformanceDoc, ShiftAssignmentDoc, ShiftDoc } from "../types";
import { assignShift, upsertPerformance, upsertShift } from "../services/shiftService";
import { canEditEmployees } from "../utils/permissions";
import { monthISO } from "../utils/payroll";

export function ShiftsPage() {
  const { role } = usePosAuth();
  const canEdit = canEditEmployees(role);
  const { data: staff } = useRestaurantCollection<EmployeeDoc>({ path: "staff" });
  const { data: shifts } = useRestaurantCollection<ShiftDoc>({ path: "shifts" });
  const { data: assignments } = useRestaurantCollection<ShiftAssignmentDoc>({ path: "shiftAssignments" });
  const { data: performance } = useRestaurantCollection<PerformanceDoc>({ path: "performance" });
  const [date, setDate] = useState(isoDate());
  const [msg, setMsg] = useState<string | null>(null);
  const [shiftForm, setShiftForm] = useState({ name: "Morning", startTime: "09:00", endTime: "17:00", kind: "morning" as const });
  const [assignForm, setAssignForm] = useState({ name: "", shiftId: "" });
  const [perfForm, setPerfForm] = useState({ name: "", rating: "4", notes: "" });

  const dayAssign = useMemo(() => assignments.filter((a) => a.date === date), [assignments, date]);
  const month = monthISO();
  const monthPerf = useMemo(() => performance.filter((p) => String(p.month || "").slice(0, 7) === month), [performance, month]);

  return (
    <div className="space-y-4">
      <div>
        <Link to="/hr" className="text-xs font-semibold text-cyan-700">
          ← HR
        </Link>
        <h1 className="text-2xl font-black text-slate-900">Shifts & performance</h1>
      </div>
      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold">Define shift</div>
          <input className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={shiftForm.name} onChange={(e) => setShiftForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="mb-2 flex gap-2">
            <input type="time" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={shiftForm.startTime} onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))} />
            <input type="time" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={shiftForm.endTime} onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))} />
          </div>
          <button
            disabled={!canEdit}
            className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={async () => {
              await upsertShift(shiftForm);
              setMsg("Shift saved");
            }}
          >
            Save shift template
          </button>
          <div className="mt-3 space-y-1">
            {shifts.map((s) => (
              <div key={s.id} className="rounded-lg bg-slate-50 px-2 py-1 text-xs">
                {s.name} · {s.startTime}–{s.endTime}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold">Assign shift</div>
          <input type="date" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
          <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={assignForm.name} onChange={(e) => setAssignForm((f) => ({ ...f, name: e.target.value }))}>
            <option value="">Employee</option>
            {staff
              .filter((s) => s.active !== false)
              .map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
          </select>
          <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={assignForm.shiftId} onChange={(e) => setAssignForm((f) => ({ ...f, shiftId: e.target.value }))}>
            <option value="">Shift</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            disabled={!canEdit || !assignForm.name || !assignForm.shiftId}
            className="w-full rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={async () => {
              try {
                const emp = staff.find((s) => s.name === assignForm.name);
                const sh = shifts.find((s) => s.id === assignForm.shiftId);
                await assignShift({
                  date,
                  shiftId: assignForm.shiftId,
                  shiftName: sh?.name,
                  name: assignForm.name,
                  staffId: emp?.id
                });
                setMsg("Shift assigned");
              } catch (e: any) {
                setMsg(e?.message || "Failed");
              }
            }}
          >
            Assign
          </button>
          <div className="mt-3 max-h-48 space-y-1 overflow-auto">
            {dayAssign.map((a) => (
              <div key={a.id} className="rounded-lg bg-slate-50 px-2 py-1 text-xs">
                {a.name} → {a.shiftName || a.shiftId}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold">Performance ({month})</div>
          <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={perfForm.name} onChange={(e) => setPerfForm((f) => ({ ...f, name: e.target.value }))}>
            <option value="">Employee</option>
            {staff
              .filter((s) => s.active !== false)
              .map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
          </select>
          <input type="number" min={1} max={5} step={0.5} className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={perfForm.rating} onChange={(e) => setPerfForm((f) => ({ ...f, rating: e.target.value }))} />
          <textarea className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} placeholder="Notes" value={perfForm.notes} onChange={(e) => setPerfForm((f) => ({ ...f, notes: e.target.value }))} />
          <button
            disabled={!canEdit || !perfForm.name}
            className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={async () => {
              const emp = staff.find((s) => s.name === perfForm.name);
              await upsertPerformance({
                month,
                name: perfForm.name,
                staffId: emp?.id,
                rating: Number(perfForm.rating),
                notes: perfForm.notes
              });
              setMsg("Performance saved");
            }}
          >
            Save rating
          </button>
          <div className="mt-3 max-h-48 space-y-1 overflow-auto">
            {monthPerf.map((p) => (
              <div key={p.id} className="rounded-lg bg-slate-50 px-2 py-1 text-xs">
                {p.name} · {p.rating}/5
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
