import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { ExpenseDoc } from "@/features/tasks/types";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_GROUPS } from "@/features/tasks/types";
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
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

import { ContentLoading } from "@/components/ui/Loading";

type ListPeriod = "month" | "m2" | "m3" | "m6" | "year";

function periodStart(period: ListPeriod, today = isoDate()): string {
  const d = new Date(today + "T00:00:00");
  if (period === "year") return `${d.getFullYear()}-01-01`;
  const monthsBack = period === "month" ? 0 : period === "m2" ? 1 : period === "m3" ? 2 : 5;
  const start = new Date(d.getFullYear(), d.getMonth() - monthsBack, 1);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
}

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
  const [listPeriod, setListPeriod] = useState<ListPeriod>("month");
  const listFrom = periodStart(listPeriod);

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
      .filter((e) => String(e.date || "").slice(0, 10) >= listFrom)
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
  }, [data, q, category, payStatus, listFrom]);

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
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/expenses" className="text-xs font-semibold text-primary"> ← Expenses </Link>}
        title="Expense register"
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card padding="sm" hover={false}>
          <SectionTitle title={form.id ? "Edit expense" : "Add expense"} />
          <div className="grid gap-2">
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              Date
              <input type="date" className="kg-input !w-auto" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              Category
              <select className="kg-input !w-auto" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                <optgroup label="Kitchen">
                  {EXPENSE_CATEGORY_GROUPS.kitchen.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Fixed / shop">
                  {EXPENSE_CATEGORY_GROUPS.fixed.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              Amount
              <input type="number" className="kg-input !w-auto" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              Status
              <select className="kg-input !w-auto" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as any }))}>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              Paid from
              <select className="kg-input !w-auto" value={form.paidFrom} onChange={(e) => setForm((f) => ({ ...f, paidFrom: e.target.value as any }))}>
                <option value="cash">Cash</option>
                <option value="bank">Bank / Online</option>
              </select>
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              Vendor
              <select className="kg-input !w-auto" value={form.vendorName} onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}>
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name || ""}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              Invoice #
              <input className="kg-input !w-auto" value={form.invoiceNumber} onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              GST %
              <input type="number" className="kg-input !w-auto" value={form.gstRate} onChange={(e) => setForm((f) => ({ ...f, gstRate: e.target.value }))} />
            </label>
            <label className="flex items-center gap-2 text-[12px] font-semibold text-text-muted">
              <input type="checkbox" checked={form.taxInclusive} onChange={(e) => setForm((f) => ({ ...f, taxInclusive: e.target.checked }))} />
              Tax inclusive
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              Note
              <textarea className="kg-input !w-auto" rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
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
            {preview ? <img src={preview} alt="Bill preview" className="max-h-40 rounded-lg border border-stroke-0 object-contain" /> : null}
            <button disabled={!canCreate || busy || !form.amount} onClick={save} className="kg-btn kg-btn-primary disabled:opacity-50">
              {busy ? "Saving…" : "Save Expense"}
            </button>
            {form.id ? (
              <button type="button" className="kg-btn kg-btn-secondary" onClick={() => setForm((f) => ({ ...f, id: "" }))}>
                Clear edit
              </button>
            ) : null}
          </div>
        </Card>

        <div className="space-y-3">
          <ul className="flex flex-wrap items-center gap-2 text-[12px] text-text-muted list-none m-0 p-0">
            <li className="font-semibold">Period:</li>
            {(
              [
                ["month", "Month"],
                ["m2", "2M"],
                ["m3", "3M"],
                ["m6", "6M"],
                ["year", "Year"]
              ] as const
            ).map(([id, label]) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setListPeriod(id)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                    listPeriod === id
                      ? "border-primary bg-primary-light text-primary"
                      : "border-stroke-0 bg-bg-1 text-text-muted"
                  }`}
                >
                  {label}
                </button>
              </li>
            ))}
            <li className="text-[11px]">from {listFrom}</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <input className="kg-input min-w-[180px] flex-1 !w-auto" placeholder="Search number, vendor, invoice…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="kg-input !w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select className="kg-input !w-auto" value={payStatus} onChange={(e) => setPayStatus(e.target.value)}>
              <option value="all">All status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="pending_approval">Pending approval</option>
            </select>
          </div>

          {loading ? <ContentLoading variant="table" label="Loading" /> : null}

          <Card hover={false} className="!p-0">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                <tr>
                  <th className="px-3 py-2">Expense</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Pay</th>
                  <th className="px-3 py-2">Approval</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-t border-stroke-0">
                    <td className="px-3 py-2">
                      <div className="font-semibold capitalize">{e.category.replace(/_/g, " ")}</div>
                      <div className="text-xs text-text-muted">
                        {e.expenseNumber || e.id.slice(0, 6)} · {e.date}
                        {e.invoiceNumber ? ` · Inv ${e.invoiceNumber}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">{e.vendorName || "—"}</td>
                    <td className="px-3 py-2 font-bold">{inr(e.amount)}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-md bg-bg-1 px-2 py-0.5 text-[10px] font-bold uppercase">{e.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-md bg-bg-1 px-2 py-0.5 text-[10px] font-bold uppercase">{e.approvalStatus || "—"}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button className="text-xs font-semibold text-primary" onClick={() => edit(e)}>
                          Edit
                        </button>
                        {canPay ? (
                          <button
                            className="text-xs font-semibold text-success"
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
                            <button className="text-xs font-semibold text-success" onClick={() => decideExpenseApproval(e.id, "approved", "", user?.uid)}>
                              Approve
                            </button>
                            <button className="text-xs font-semibold text-danger" onClick={() => decideExpenseApproval(e.id, "rejected", "", user?.uid)}>
                              Reject
                            </button>
                          </>
                        ) : null}
                        <button className="text-xs font-semibold text-text-secondary" onClick={async () => { await duplicateExpense(e.id); setMsg("Duplicated"); }}>
                          Dup
                        </button>
                        <button className="text-xs font-semibold text-warning" onClick={async () => { await archiveExpense(e.id); setMsg("Archived"); }}>
                          Archive
                        </button>
                        <button
                          className="text-xs font-semibold text-danger"
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `Delete expense ${e.category || ""} · ₹${e.amount}? Cash / Online balance will reverse if it was paid.`
                              )
                            ) {
                              return;
                            }
                            await softDeleteExpense(e.id);
                            setMsg("Expense deleted — balance updated.");
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {!rows.length && !loading ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No expenses found." /> : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
