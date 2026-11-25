import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { PurchaseEntryDoc } from "@/features/inventory/types";
import type { SupplierDoc, SupplierPaymentDoc } from "../types";
import { buildSupplierLedger } from "../utils/ledger";
import { canPaySuppliers } from "../utils/permissions";
import { recordSupplierPayment, syncSupplierOutstanding } from "../services/supplierService";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

import { ContentLoading } from "@/components/ui/Loading";

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
    method: "cash" as "cash" | "online",
    note: "",
    referenceNumber: ""
  });

  const ledger = useMemo(() => buildSupplierLedger({ suppliers, purchases, payments, today: isoDate() }), [suppliers, purchases, payments]);

  const recent = useMemo(
    () => [...payments].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 50),
    [payments]
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/suppliers" className="text-xs font-semibold text-primary"> ← Suppliers </Link>}
        title="Supplier payments"
      />
      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card padding="sm" hover={false}>
          <div className="mb-2 text-[14px] font-bold text-text-primary">Record payment</div>
          <select
            className="kg-input mb-2 w-full"
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
          <input type="number" className="kg-input mb-2 w-full" placeholder="Amount" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          <input type="date" className="kg-input mb-2 w-full" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <select className="kg-input mb-2 w-full" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as "cash" | "online" }))}>
            <option value="cash">Cash</option>
            <option value="online">Online</option>
          </select>
          <input className="kg-input mb-2 w-full" placeholder="Reference #" value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} />
          <textarea className="kg-input mb-2 w-full" rows={2} placeholder="Note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          <button
            disabled={!canPay || !form.seller}
            className="w-full kg-btn kg-btn-primary disabled:opacity-50"
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
        </Card>

        <div className="space-y-3">
          <Card hover={false} className="!p-0">
            <div className="border-b border-stroke-0 px-3 py-2 text-[13px] font-bold">AP snapshot</div>
            <table className="w-full text-left text-[13px]">
              <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
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
                    <tr key={l.supplierId} className="border-t border-stroke-0">
                      <td className="px-3 py-2 font-semibold">{l.name}</td>
                      <td className="px-3 py-2">{inr(l.purchases)}</td>
                      <td className="px-3 py-2">{inr(l.payments)}</td>
                      <td className="px-3 py-2 font-bold">{inr(l.outstanding)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>

          <Card hover={false} className="!p-0">
            <div className="border-b border-stroke-0 px-3 py-2 text-[13px] font-bold">Payment history</div>
            {loading ? <ContentLoading variant="block" label="Loading" /> : null}
            <table className="w-full text-left text-[13px]">
              <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id} className="border-t border-stroke-0">
                    <td className="px-3 py-2">{p.date}</td>
                    <td className="px-3 py-2 font-semibold">{p.seller}</td>
                    <td className="px-3 py-2 uppercase text-xs">{p.method}</td>
                    <td className="px-3 py-2 font-bold">{inr(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recent.length && !loading ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No payments yet." /> : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
