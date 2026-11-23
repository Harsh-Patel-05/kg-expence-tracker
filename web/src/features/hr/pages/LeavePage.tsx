import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { EmployeeDoc, LeaveRequestDoc, LeaveType } from "../types";
import { createLeaveRequest, decideLeave } from "../services/payrollService";
import { canApproveLeave, canEditEmployees } from "../utils/permissions";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ContentLoading } from "@/components/ui/Loading";

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
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/hr" className="text-xs font-semibold text-primary"> ← HR </Link>}
        title="Leave management"
        actions={
          <div className="flex flex-wrap gap-2">
            {(["pending", "approved", "rejected", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`kg-btn capitalize ${filter === f ? "kg-btn-primary" : "kg-btn-secondary"}`}
              >
                {f}
              </button>
            ))}
          </div>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card padding="sm" hover={false}>
          <SectionTitle title="New leave request" />
          <div className="grid gap-2">
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              Employee
              <select
                className="kg-input !w-auto"
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
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              Type
              <select
                className="kg-input !w-auto"
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
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              From
              <input type="date" className="kg-input !w-auto" value={form.fromDate} onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              To
              <input type="date" className="kg-input !w-auto" value={form.toDate} onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              Reason
              <textarea className="kg-input !w-auto" rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            </label>
            <button
              disabled={!canRequest || busy || !form.name}
              onClick={submit}
              className="kg-btn kg-btn-primary disabled:opacity-50"
            >
              Submit request
            </button>
          </div>
        </Card>

        <Card hover={false} className="!p-0">
          {loading ? <ContentLoading variant="block" label="Loading leave" /> : null}
          <table className="w-full text-left text-[13px]">
            <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
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
                <tr key={l.id} className="border-t border-stroke-0">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{l.name}</div>
                    <div className="text-xs text-text-muted">{l.reason || "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.fromDate} → {l.toDate}
                    <div>{l.days} day(s)</div>
                  </td>
                  <td className="px-3 py-2 capitalize">{l.leaveType}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-md bg-bg-1 px-2 py-0.5 text-[10px] font-bold uppercase">{l.approvalStatus}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canApprove && l.approvalStatus === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <button
                          className="text-xs font-semibold text-success"
                          onClick={async () => {
                            await decideLeave(l.id, "approved");
                            setMsg("Leave approved");
                          }}
                        >
                          Approve
                        </button>
                        <button
                          className="text-xs font-semibold text-danger"
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
          {!rows.length && !loading ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No leave requests." /> : null}
        </Card>
      </div>
    </div>
  );
}
