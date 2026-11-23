import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { EmployeeDoc, LeaveRequestDoc, LeaveType } from "../types";
import { createLeaveRequest, decideLeave } from "../services/payrollService";
import { canApproveLeave, canEditEmployees } from "../utils/permissions";

const LEAVE_TYPES: LeaveType[] = ["casual", "sick", "paid", "unpaid", "emergency", "maternity", "paternity", "custom"];

export function LeavePage() {
  const { role } = usePosAuth();
  const canRequest = canEditEmployees(role) || canApproveLeave(role);
  const canApprove = canApproveLeave(role);
  const { data: staff } = useRestaurantCollection<EmployeeDoc>({ path: "staff" });
  const { data: leaves, loading, error } = useRestaurantCollection<LeaveRequestDoc>({ path: "leaveRequests" });
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    staffId: "",
    leaveType: "casual" as LeaveType,
    fromDate: isoDate(),
    toDate: isoDate(),
    reason: ""
  });

  const rows = useMemo(() => {
    return leaves
      .filter((l) => (filter === "all" ? true : l.approvalStatus === filter))
      .sort((a, b) => String(b.fromDate).localeCompare(String(a.fromDate)));
  }, [leaves, filter]);

  async function submit() {
    if (!canRequest) return;
    try {
      setBusy(true);
      await createLeaveRequest({
        name: form.name,
        staffId: form.staffId || null,
        leaveType: form.leaveType,
        fromDate: form.fromDate,
        toDate: form.toDate,
        reason: form.reason
      });
      setMsg("Leave request submitted");
      setForm((f) => ({ ...f, reason: "" }));
    } catch (e: any) {
      setMsg(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/hr" className="text-xs font-semibold text-cyan-700">
            ← HR
          </Link>
          <h1 className="text-2xl font-black text-slate-900">Leave management</h1>
        </div>
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 capitalize ${filter === f ? "bg-slate-900 text-white" : "text-slate-600"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}
      {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">New leave request</div>
          <div className="grid gap-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Employee
              <select
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={form.staffId}
                onChange={(e) => {
                  const s = staff.find((x) => x.id === e.target.value);
                  setForm((f) => ({ ...f, staffId: e.target.value, name: s?.name || "" }));
                }}
              >
                <option value="">Select</option>
                {staff
                  .filter((s) => s.active !== false)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Type
              <select
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={form.leaveType}
                onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value as LeaveType }))}
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              From
              <input type="date" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.fromDate} onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              To
              <input type="date" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.toDate} onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Reason
              <textarea className="rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            </label>
            <button
              disabled={!canRequest || busy || !form.name}
              onClick={submit}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Submit request
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? <div className="h-32 animate-pulse bg-slate-100" /> : null}
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Dates</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{l.name}</div>
                    <div className="text-xs text-slate-500">{l.reason || "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.fromDate} → {l.toDate}
                    <div>{l.days} day(s)</div>
                  </td>
                  <td className="px-3 py-2 capitalize">{l.leaveType}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase">{l.approvalStatus}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canApprove && l.approvalStatus === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <button
                          className="text-xs font-semibold text-emerald-700"
                          onClick={async () => {
                            await decideLeave(l.id, "approved");
                            setMsg("Leave approved");
                          }}
                        >
                          Approve
                        </button>
                        <button
                          className="text-xs font-semibold text-rose-600"
                          onClick={async () => {
                            await decideLeave(l.id, "rejected");
                            setMsg("Leave rejected");
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && !loading ? <div className="py-10 text-center text-sm text-slate-500">No leave requests.</div> : null}
        </div>
      </div>
    </div>
  );
}
