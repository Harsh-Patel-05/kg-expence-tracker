import { useMemo } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { inr, isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { PurchaseEntryDoc } from "@/features/inventory/types";
import type { SupplierDoc, SupplierPaymentDoc } from "../types";
import { buildSupplierLedger, avgPurchaseValue } from "../utils/ledger";
import { supplierAnalytics } from "@/features/reports/utils/reportEngine";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";

import { ContentLoading } from "@/components/ui/Loading";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <KpiCard title={label} value={String(value)} hint={hint} />;
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
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Procurement"
        title="Supplier command"
        actions={
          <>
          <Link to="/suppliers/list" className="kg-btn kg-btn-primary">
            Supplier master
          </Link>
          <Link to="/suppliers/payments" className="kg-btn kg-btn-secondary">
            Payments
          </Link>
          <Link to="/inventory/purchases" className="kg-btn kg-btn-secondary">
            Purchases
          </Link>
          <Link to="/reports" className="kg-btn kg-btn-secondary">
            Reports
          </Link>
          </>
        }
      />

      {loading ? <ContentLoading variant="block" label="Loading" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        <Card padding="sm" hover={false}>
          <SectionTitle title="Top suppliers by spend" />
          <div className="space-y-2">
            {analytics.topBySpend.map((r) => (
              <div key={r.supplierId} className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]">
                <span className="font-semibold">{r.name}</span>
                <span>
                  {inr(r.purchases)} · due {inr(r.outstanding)}
                </span>
              </div>
            ))}
            {!analytics.topBySpend.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No purchase history yet." /> : null}
          </div>
        </Card>
        <Card padding="sm" hover={false}>
          <SectionTitle title="Outstanding & overdue" />
          <div className="space-y-2">
            {analytics.topOutstanding.map((r) => (
              <div key={r.supplierId} className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-text-muted">
                    Credit avail {inr(r.availableCredit)}
                    {r.overdue > 0 ? ` · overdue ${inr(r.overdue)}` : ""}
                  </div>
                </div>
                <div className="font-bold text-danger">{inr(r.outstanding)}</div>
              </div>
            ))}
            {!analytics.topOutstanding.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No outstanding balances." /> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
