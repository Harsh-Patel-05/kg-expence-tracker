import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { PurchaseEntryDoc } from "@/features/inventory/types";
import type { SupplierDoc, SupplierPaymentDoc } from "../types";
import { buildSupplierLedger } from "../utils/ledger";
import { canPaySuppliers } from "../utils/permissions";
import { recordSupplierPayment, syncSupplierOutstanding } from "../services/supplierService";

export function SupplierPaymentsPage() {
  const { role } = usePosAuth();
  const canPay = canPaySuppliers(role);
  const { data: suppliers } = useRestaurantCollection<SupplierDoc>({ path: "suppliers" });
  const { data: purchases } = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases" });
  const { data: payments, loading } = useRestaurantCollection<SupplierPaymentDoc>({ path: "supplierPayments" });
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    supplierId: "",
    seller: "",
    amount: "",
    date: isoDate(),
    method: "cash" as const,
    note: "",
    referenceNumber: ""
  });

  const ledger = useMemo(() => buildSupplierLedger({ suppliers, purchases, payments, today: isoDate() }), [suppliers, purchases, payments]);

  const recent = useMemo(
    () => [...payments].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 50),
    [payments]
  );

  return (
    <div className="space-y-4">
      <div>
        <Link to="/suppliers" className="text-xs font-semibold text-cyan-700">
          ← Suppliers
        </Link>
        <h1 className="text-2xl font-black text-slate-900">Supplier payments</h1>
      </div>
      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold">Record payment</div>
          <select
            className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={form.supplierId}
            onChange={(e) => {
              const s = suppliers.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, supplierId: e.target.value, seller: s?.name || "" }));
            }}
          >
            <option value="">Supplier</option>
            {suppliers
              .filter((s) => !s.archived)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <input type="number" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Amount" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          <input type="date" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as any }))}>
            <option value="cash">Cash</option>
            <option value="online">Online</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank</option>
          </select>
          <input className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Reference #" value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} />
          <textarea className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} placeholder="Note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          <button
            disabled={!canPay || !form.seller}
            className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={async () => {
              await recordSupplierPayment({
                seller: form.seller,
                supplierId: form.supplierId,
                amount: num(form.amount),
                date: form.date,
                method: form.method,
                note: form.note,
                referenceNumber: form.referenceNumber
              });
              const row = ledger.find((l) => l.supplierId === form.supplierId);
              if (row) await syncSupplierOutstanding(form.supplierId, Math.max(0, row.outstanding - num(form.amount)));
              setMsg("Payment recorded");
              setForm((f) => ({ ...f, amount: "", note: "", referenceNumber: "" }));
            }}
          >
            Save payment
          </button>
        </div>

        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-3 py-2 text-sm font-bold">AP snapshot</div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Purchases</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Due</th>
                </tr>
              </thead>
              <tbody>
                {ledger
                  .filter((l) => l.outstanding > 0 || l.purchases > 0)
                  .slice(0, 20)
                  .map((l) => (
                    <tr key={l.supplierId} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold">{l.name}</td>
                      <td className="px-3 py-2">{inr(l.purchases)}</td>
                      <td className="px-3 py-2">{inr(l.payments)}</td>
                      <td className="px-3 py-2 font-bold">{inr(l.outstanding)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-3 py-2 text-sm font-bold">Payment history</div>
            {loading ? <div className="h-24 animate-pulse bg-slate-100" /> : null}
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{p.date}</td>
                    <td className="px-3 py-2 font-semibold">{p.seller}</td>
                    <td className="px-3 py-2 uppercase text-xs">{p.method}</td>
                    <td className="px-3 py-2 font-bold">{inr(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recent.length && !loading ? <div className="py-10 text-center text-sm text-slate-500">No payments yet.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
