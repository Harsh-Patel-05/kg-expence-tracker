import { useState } from "react";
import { Link } from "react-router-dom";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { RecurringExpenseDoc } from "@/features/tasks/types";
import { EXPENSE_CATEGORIES } from "@/features/tasks/types";
import { removeRecurringExpense, upsertRecurringExpense } from "../services/expenseService";
import { canManageRecurringExpenses } from "../utils/permissions";

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
    <div className="space-y-4">
      <div>
        <Link to="/expenses" className="text-xs font-semibold text-cyan-700">
          ← Expenses
        </Link>
        <h1 className="text-2xl font-black text-slate-900">Recurring expenses</h1>
      </div>
      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold">Add recurring</div>
          <input className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Title (e.g. Shop rent)" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input type="number" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Amount" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          <input type="number" min={1} max={28} className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Day of month (1–28)" value={form.dayOfMonth} onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: e.target.value }))} />
          <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as any }))}>
            <option value="online">Online / Bank</option>
            <option value="cash">Cash</option>
          </select>
          <button
            disabled={!canManage || !form.title}
            className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
            Save
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? <div className="h-24 animate-pulse bg-slate-100" /> : null}
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
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
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">{r.title}</td>
                  <td className="px-3 py-2 capitalize">{r.category}</td>
                  <td className="px-3 py-2">{inr(r.amount)}</td>
                  <td className="px-3 py-2">{r.dayOfMonth}</td>
                  <td className="px-3 py-2 text-right">
                    {canManage ? (
                      <button className="text-xs font-semibold text-rose-600" onClick={async () => { await removeRecurringExpense(r.id); setMsg("Removed"); }}>
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!active.length && !loading ? <div className="py-10 text-center text-sm text-slate-500">No recurring expenses.</div> : null}
        </div>
      </div>
    </div>
  );
}
