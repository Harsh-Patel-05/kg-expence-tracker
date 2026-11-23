import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { ExpenseDoc } from "@/features/tasks/types";
import { EXPENSE_CATEGORIES } from "@/features/tasks/types";
import {
  archiveExpense,
  decideExpenseApproval,
  duplicateExpense,
  softDeleteExpense,
  toggleExpensePaid,
  upsertExpense
} from "../services/expenseService";
import { canApproveExpense, canCreateExpense, canPayExpense } from "../utils/permissions";
import { splitGst } from "../utils/gst";

export function ExpensesListPage() {
  const { role, user } = usePosAuth();
  const canCreate = canCreateExpense(role);
  const canPay = canPayExpense(role);
  const canApprove = canApproveExpense(role);

  const { data, loading, error } = useRestaurantCollection<ExpenseDoc>({ path: "expenses" });
  const { data: suppliers } = useRestaurantCollection<{ name?: string }>({ path: "suppliers" });

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [payStatus, setPayStatus] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    id: "",
    date: isoDate(),
    category: "misc",
    amount: "",
    status: "unpaid" as "paid" | "unpaid",
    paidFrom: "cash" as "cash" | "bank",
    vendorName: "",
    invoiceNumber: "",
    note: "",
    gstRate: "0",
    taxInclusive: false,
    branch: "Main",
    department: ""
  });

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return data
      .filter((e) => !e.archived)
      .filter((e) => {
        if (category !== "all" && e.category !== category) return false;
        if (payStatus === "paid" && e.status !== "paid") return false;
        if (payStatus === "unpaid" && e.status === "paid") return false;
        if (payStatus === "pending_approval" && e.approvalStatus !== "pending") return false;
        if (!query) return true;
        return `${e.expenseNumber || ""} ${e.category} ${e.vendorName || ""} ${e.invoiceNumber || ""} ${e.note || ""} ${e.employeeName || ""}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [data, q, category, payStatus]);

  async function save() {
    if (!canCreate) return;
    try {
      setBusy(true);
      const amount = num(form.amount);
      const gst = splitGst({ amount, taxInclusive: form.taxInclusive, rate: num(form.gstRate) });
      await upsertExpense(
        {
          id: form.id || undefined,
          date: form.date,
          category: form.category,
          amount,
          status: form.status,
          paidFrom: form.paidFrom,
          paymentMethod: form.status === "paid" ? (form.paidFrom === "cash" ? "cash" : "online") : "unpaid",
          vendorName: form.vendorName || null,
          invoiceNumber: form.invoiceNumber,
          note: form.note,
          description: form.note,
          taxableAmount: gst.taxable,
          cgst: gst.cgst,
          sgst: gst.sgst,
          igst: gst.igst,
          taxInclusive: form.taxInclusive,
          branch: form.branch,
          department: form.department,
          approvalStatus: form.id ? undefined : "pending"
        },
        { file, existing: data }
      );
      setMsg("Expense saved");
      setForm({
        id: "",
        date: isoDate(),
        category: "misc",
        amount: "",
        status: "unpaid",
        paidFrom: "cash",
        vendorName: "",
        invoiceNumber: "",
        note: "",
        gstRate: "0",
        taxInclusive: false,
        branch: "Main",
        department: ""
      });
      setFile(null);
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function edit(e: ExpenseDoc & { id: string }) {
    setForm({
      id: e.id,
      date: String(e.date || "").slice(0, 10),
      category: e.category || "misc",
      amount: String(e.amount ?? ""),
      status: e.status === "paid" ? "paid" : "unpaid",
      paidFrom: e.paidFrom || "cash",
      vendorName: e.vendorName || "",
      invoiceNumber: e.invoiceNumber || "",
      note: e.note || e.description || "",
      gstRate: String(num(e.cgst) + num(e.sgst) + num(e.igst) > 0 ? 5 : 0),
      taxInclusive: !!e.taxInclusive,
      branch: e.branch || "Main",
      department: e.department || ""
    });
    setPreview(e.attachment || null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/expenses" className="text-xs font-semibold text-cyan-700">
            ← Expenses
          </Link>
          <h1 className="text-2xl font-black text-slate-900">Expense register</h1>
        </div>
      </div>

      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}
      {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">{form.id ? "Edit expense" : "Add expense"}</div>
          <div className="grid gap-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Date
              <input type="date" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Category
              <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Amount
              <input type="number" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Status
              <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as any }))}>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Paid from
              <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.paidFrom} onChange={(e) => setForm((f) => ({ ...f, paidFrom: e.target.value as any }))}>
                <option value="cash">Cash</option>
                <option value="bank">Bank / Online</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Vendor
              <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.vendorName} onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}>
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name || ""}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Invoice #
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.invoiceNumber} onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              GST %
              <input type="number" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.gstRate} onChange={(e) => setForm((f) => ({ ...f, gstRate: e.target.value }))} />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input type="checkbox" checked={form.taxInclusive} onChange={(e) => setForm((f) => ({ ...f, taxInclusive: e.target.checked }))} />
              Tax inclusive
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Note
              <textarea className="rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Bill / invoice
              <input
                type="file"
                accept="image/*,application/pdf"
                className="text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  if (f && f.type.startsWith("image/")) {
                    const url = URL.createObjectURL(f);
                    setPreview(url);
                  } else setPreview(null);
                }}
              />
            </label>
            {preview ? <img src={preview} alt="Bill preview" className="max-h-40 rounded-xl border border-slate-200 object-contain" /> : null}
            <button disabled={!canCreate || busy || !form.amount} onClick={save} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save expense"}
            </button>
            {form.id ? (
              <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" onClick={() => setForm((f) => ({ ...f, id: "" }))}>
                Clear edit
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input className="min-w-[180px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Search number, vendor, invoice…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={payStatus} onChange={(e) => setPayStatus(e.target.value)}>
              <option value="all">All status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="pending_approval">Pending approval</option>
            </select>
          </div>

          {loading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Expense</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Pay</th>
                  <th className="px-3 py-2">Approval</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-semibold capitalize">{e.category.replace(/_/g, " ")}</div>
                      <div className="text-xs text-slate-500">
                        {e.expenseNumber || e.id.slice(0, 6)} · {e.date}
                        {e.invoiceNumber ? ` · Inv ${e.invoiceNumber}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">{e.vendorName || "—"}</td>
                    <td className="px-3 py-2 font-bold">{inr(e.amount)}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase">{e.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase">{e.approvalStatus || "—"}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button className="text-xs font-semibold text-cyan-700" onClick={() => edit(e)}>
                          Edit
                        </button>
                        {canPay ? (
                          <button
                            className="text-xs font-semibold text-emerald-700"
                            onClick={async () => {
                              await toggleExpensePaid(e.id, e.status !== "paid", e.paidFrom || "cash");
                              setMsg(e.status === "paid" ? "Marked unpaid" : "Marked paid");
                            }}
                          >
                            {e.status === "paid" ? "Unpay" : "Pay"}
                          </button>
                        ) : null}
                        {canApprove && e.approvalStatus === "pending" ? (
                          <>
                            <button className="text-xs font-semibold text-emerald-700" onClick={() => decideExpenseApproval(e.id, "approved", "", user?.uid)}>
                              Approve
                            </button>
                            <button className="text-xs font-semibold text-rose-600" onClick={() => decideExpenseApproval(e.id, "rejected", "", user?.uid)}>
                              Reject
                            </button>
                          </>
                        ) : null}
                        <button className="text-xs font-semibold text-slate-600" onClick={async () => { await duplicateExpense(e.id); setMsg("Duplicated"); }}>
                          Dup
                        </button>
                        <button className="text-xs font-semibold text-amber-700" onClick={async () => { await archiveExpense(e.id); setMsg("Archived"); }}>
                          Archive
                        </button>
                        <button className="text-xs font-semibold text-rose-600" onClick={async () => { await softDeleteExpense(e.id); setMsg("Deleted"); }}>
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && !loading ? <div className="py-10 text-center text-sm text-slate-500">No expenses found.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
