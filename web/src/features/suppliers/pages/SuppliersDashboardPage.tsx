import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { PurchaseEntryDoc } from "@/features/inventory/types";
import type { SupplierDoc, SupplierPaymentDoc } from "../types";
import { buildSupplierLedger, avgPurchaseValue } from "../utils/ledger";
import { supplierAnalytics } from "@/features/reports/utils/reportEngine";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </motion.div>
  );
}

export function SuppliersDashboardPage() {
  const { data: suppliers, loading } = useRestaurantCollection<SupplierDoc>({ path: "suppliers" });
  const { data: purchases } = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases" });
  const { data: payments } = useRestaurantCollection<SupplierPaymentDoc>({ path: "supplierPayments" });

  const ledger = useMemo(
    () => buildSupplierLedger({ suppliers, purchases, payments, today: isoDate() }),
    [suppliers, purchases, payments]
  );
  const analytics = useMemo(() => supplierAnalytics(ledger), [ledger]);
  const outstanding = ledger.reduce((s, r) => s + r.outstanding, 0);
  const overdue = ledger.reduce((s, r) => s + r.overdue, 0);
  const spend = ledger.reduce((s, r) => s + r.purchases, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Procurement</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Supplier command</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/suppliers/list" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            Supplier master
          </Link>
          <Link to="/suppliers/payments" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Payments
          </Link>
          <Link to="/inventory/purchases" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Purchases
          </Link>
          <Link to="/reports" className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white">
            Reports
          </Link>
        </div>
      </div>

      {loading ? <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active suppliers" value={ledger.length} />
        <Stat label="Total purchases" value={inr(spend)} />
        <Stat label="Outstanding AP" value={inr(outstanding)} />
        <Stat label="Overdue" value={inr(overdue)} hint={`${analytics.overdue.length} suppliers`} />
        <Stat label="Credit alerts" value={analytics.creditAlerts.length} />
        <Stat label="Payments posted" value={payments.length} />
        <Stat label="Purchase orders" value={purchases.length} />
        <Stat label="Avg purchase (top)" value={analytics.topBySpend[0] ? inr(avgPurchaseValue(analytics.topBySpend[0])) : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">Top suppliers by spend</div>
          <div className="space-y-2">
            {analytics.topBySpend.map((r) => (
              <div key={r.supplierId} className="flex justify-between text-sm">
                <span className="font-semibold">{r.name}</span>
                <span>
                  {inr(r.purchases)} · due {inr(r.outstanding)}
                </span>
              </div>
            ))}
            {!analytics.topBySpend.length ? <div className="py-8 text-center text-sm text-slate-500">No purchase history yet.</div> : null}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">Outstanding & overdue</div>
          <div className="space-y-2">
            {analytics.topOutstanding.map((r) => (
              <div key={r.supplierId} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-slate-500">
                    Credit avail {inr(r.availableCredit)}
                    {r.overdue > 0 ? ` · overdue ${inr(r.overdue)}` : ""}
                  </div>
                </div>
                <div className="font-bold text-rose-700">{inr(r.outstanding)}</div>
              </div>
            ))}
            {!analytics.topOutstanding.length ? <div className="py-8 text-center text-sm text-slate-500">No outstanding balances.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
