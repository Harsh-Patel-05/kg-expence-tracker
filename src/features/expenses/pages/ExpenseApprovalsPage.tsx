import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { inr } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { ExpenseDoc } from "@/features/tasks/types";
import { decideExpenseApproval } from "../services/expenseService";
import { canApproveExpense } from "../utils/permissions";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";

import { ContentLoading } from "@/components/ui/Loading";

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
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/expenses" className="text-xs font-semibold text-primary"> ← Expenses </Link>}
        title="Expense approvals"
      />
      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {!canApprove ? <div className="rounded-lg border border-warning/20 bg-warning-bg px-3 py-2 text-[13px] text-warning">You can view approvals but only managers/owners can decide.</div> : null}

      {loading ? <ContentLoading variant="block" label="Loading" /> : null}

      <div className="space-y-2">
        {pending.map((e) => (
          <div key={e.id} className="rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 p-4 shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-bold capitalize text-text-primary">
                  {e.category.replace(/_/g, " ")} · {inr(e.amount)}
                </div>
                <div className="text-xs text-text-muted">
                  {e.expenseNumber} · {e.date} · {e.vendorName || "No vendor"} · {e.invoiceNumber || "No invoice"}
                </div>
                {e.note ? <div className="mt-1 text-[13px] text-text-secondary">{e.note}</div> : null}
              </div>
              <div className="flex min-w-[220px] flex-col gap-2">
                <input
                  className="kg-input !w-auto"
                  placeholder="Manager comment"
                  value={comment[e.id] || ""}
                  onChange={(ev) => setComment((c) => ({ ...c, [e.id]: ev.target.value }))}
                />
                <div className="flex gap-2">
                  <button
                    disabled={!canApprove}
                    className="kg-btn flex-1 bg-success text-white hover:brightness-95 disabled:opacity-40"
                    onClick={async () => {
                      await decideExpenseApproval(e.id, "approved", comment[e.id], user?.uid);
                      setMsg("Approved");
                    }}
                  >
                    Approve
                  </button>
                  <button
                    disabled={!canApprove}
                    className="kg-btn flex-1 bg-danger text-white hover:brightness-95 disabled:opacity-40"
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
        {!pending.length && !loading ? <EmptyState title="No pending approvals." /> : null}
      </div>
    </div>
  );
}
