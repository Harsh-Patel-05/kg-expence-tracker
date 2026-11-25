import { useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { RecurringExpenseDoc } from "@/features/tasks/types";
import { EXPENSE_CATEGORIES } from "@/features/tasks/types";
import { removeRecurringExpense, upsertRecurringExpense } from "../services/expenseService";
import { canManageRecurringExpenses } from "../utils/permissions";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

import { ContentLoading } from "@/components/ui/Loading";

export function RecurringExpensesPage() {
  const { role } = usePosAuth();
  const canManage = canManageRecurringExpenses(role);
  const { data, loading } = useRestaurantCollection<RecurringExpenseDoc>({ path: "recurring_expenses" });
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    category: "rent",
    amount: "",
    dayOfMonth: "1",
    paymentMethod: "online" as "cash" | "online"
  });

  const active = data.filter((r) => r.active !== false);

  return (
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/expenses" className="text-xs font-semibold text-primary"> ← Expenses </Link>}
        title="Recurring expenses"
      />
      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card padding="sm" hover={false}>
          <div className="mb-2 text-[14px] font-bold text-text-primary">Add recurring</div>
          <input className="kg-input mb-2 w-full" placeholder="Title (e.g. Shop rent)" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <select className="kg-input mb-2 w-full" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input type="number" className="kg-input mb-2 w-full" placeholder="Amount" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          <input type="number" min={1} max={28} className="kg-input mb-2 w-full" placeholder="Day of month (1–28)" value={form.dayOfMonth} onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: e.target.value }))} />
          <select className="kg-input mb-2 w-full" value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as any }))}>
            <option value="online">Online / Bank</option>
            <option value="cash">Cash</option>
          </select>
          <button
            disabled={!canManage || !form.title}
            className="w-full kg-btn kg-btn-primary disabled:opacity-50"
            onClick={async () => {
              await upsertRecurringExpense({
                title: form.title,
                category: form.category,
                amount: num(form.amount),
                dayOfMonth: num(form.dayOfMonth) || 1,
                paymentMethod: form.paymentMethod
              });
              setMsg("Recurring expense saved");
              setForm({ title: "", category: "rent", amount: "", dayOfMonth: "1", paymentMethod: "online" });
            }}
          >
            Add recurring
          </button>
        </Card>

        <Card hover={false} className="!p-0">
          {loading ? <ContentLoading variant="block" label="Loading" /> : null}
          <table className="w-full text-left text-[13px]">
            <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Day</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {active.map((r) => (
                <tr key={r.id} className="border-t border-stroke-0">
                  <td className="px-3 py-2 font-semibold">{r.title}</td>
                  <td className="px-3 py-2 capitalize">{r.category}</td>
                  <td className="px-3 py-2">{inr(r.amount)}</td>
                  <td className="px-3 py-2">{r.dayOfMonth}</td>
                  <td className="px-3 py-2 text-right">
                    {canManage ? (
                      <button className="text-xs font-semibold text-danger" onClick={async () => { await removeRecurringExpense(r.id); setMsg("Removed"); }}>
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!active.length && !loading ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No recurring expenses." /> : null}
        </Card>
      </div>
    </div>
  );
}
