import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { inr } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { ExpenseDoc } from "@/features/tasks/types";
import { decideExpenseApproval } from "../services/expenseService";
import { canApproveExpense } from "../utils/permissions";

export function ExpenseApprovalsPage() {
  const { role, user } = usePosAuth();
  const canApprove = canApproveExpense(role);
  const { data, loading } = useRestaurantCollection<ExpenseDoc>({ path: "expenses" });
  const [msg, setMsg] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});

  const pending = useMemo(
    () => data.filter((e) => !e.archived && (e.approvalStatus === "pending" || !e.approvalStatus)).sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [data]
  );

  return (
    <div className="space-y-4">
      <div>
        <Link to="/expenses" className="text-xs font-semibold text-cyan-700">
          ← Expenses
        </Link>
        <h1 className="text-2xl font-black text-slate-900">Expense approvals</h1>
      </div>
      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}
      {!canApprove ? <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">You can view approvals but only managers/owners can decide.</div> : null}

      {loading ? <div className="h-32 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

      <div className="space-y-2">
        {pending.map((e) => (
          <div key={e.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-bold capitalize text-slate-900">
                  {e.category.replace(/_/g, " ")} · {inr(e.amount)}
                </div>
                <div className="text-xs text-slate-500">
                  {e.expenseNumber} · {e.date} · {e.vendorName || "No vendor"} · {e.invoiceNumber || "No invoice"}
                </div>
                {e.note ? <div className="mt-1 text-sm text-slate-600">{e.note}</div> : null}
              </div>
              <div className="flex min-w-[220px] flex-col gap-2">
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Manager comment"
                  value={comment[e.id] || ""}
                  onChange={(ev) => setComment((c) => ({ ...c, [e.id]: ev.target.value }))}
                />
                <div className="flex gap-2">
                  <button
                    disabled={!canApprove}
                    className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    onClick={async () => {
                      await decideExpenseApproval(e.id, "approved", comment[e.id], user?.uid);
                      setMsg("Approved");
                    }}
                  >
                    Approve
                  </button>
                  <button
                    disabled={!canApprove}
                    className="flex-1 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    onClick={async () => {
                      await decideExpenseApproval(e.id, "rejected", comment[e.id], user?.uid);
                      setMsg("Rejected");
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {!pending.length && !loading ? <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">No pending approvals.</div> : null}
      </div>
    </div>
  );
}
