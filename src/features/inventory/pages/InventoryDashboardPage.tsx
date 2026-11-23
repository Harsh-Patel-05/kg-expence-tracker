import { useMemo } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { InventoryItemDoc, PurchaseEntryDoc, StockLotDoc, WastageDoc } from "../types";
import { buildStockAlerts, availableQty } from "../utils/alerts";
import { isoDate } from "@/lib/utils";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";

import { ContentLoading } from "@/components/ui/Loading";

function Stat({ label, value }: { label: string; value: string | number }) {
  return <KpiCard title={label} value={String(value)} />;
}

export function InventoryDashboardPage() {
  const { data: items, loading } = useRestaurantCollection<InventoryItemDoc>({ path: "inventory" });
  const { data: lots } = useRestaurantCollection<StockLotDoc>({ path: "stock_lots" });
  const { data: purchases } = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases" });
  const { data: wastage } = useRestaurantCollection<WastageDoc>({ path: "wastage" });
  const today = isoDate();

  const active = useMemo(() => items.filter((i) => !i.isDeleted && !i.archived), [items]);
  const alerts = useMemo(() => buildStockAlerts({ inventory: active, lots, today }), [active, lots, today]);

  const valuation = active.reduce((s, i) => s + availableQty(i) * num(i.avgCost || i.costPrice || i.lastPurchaseCost), 0);
  const todayPurchases = purchases.filter((p) => String(p.date || "").slice(0, 10) === today);
  const purchaseTotal = todayPurchases.reduce((s, p) => s + num(p.total || p.price), 0);
  const wasteToday = wastage.filter((w) => String(w.date || "").slice(0, 10) === today);
  const wasteCost = wasteToday.reduce((s, w) => s + num(w.costImpact), 0);

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Inventory & recipes"
        title="Stock control"
        actions={
          <>
          <Link to="/inventory/items" className="kg-btn kg-btn-primary">
            Items
          </Link>
          <Link to="/inventory/purchases" className="kg-btn kg-btn-secondary">
            Purchases
          </Link>
          <Link to="/inventory/ops" className="kg-btn kg-btn-secondary">
            Adjust / Waste / Count
          </Link>
          <Link to="/inventory/recipes" className="kg-btn kg-btn-secondary">
            Recipes
          </Link>
          <Link to="/inventory/production" className="kg-btn kg-btn-secondary">
            Production
          </Link>
          </>
        }
      />

      {loading ? <ContentLoading variant="block" label="Loading" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Inventory value" value={inr(valuation)} />
        <Stat label="SKUs" value={active.length} />
        <Stat label="Low / critical" value={alerts.filter((a) => a.kind === "low" || a.kind === "critical" || a.kind === "out").length} />
        <Stat label="Expiry alerts" value={alerts.filter((a) => a.kind === "expiry" || a.kind === "expired").length} />
        <Stat label="Today's purchases" value={inr(purchaseTotal)} />
        <Stat label="Purchase bills today" value={todayPurchases.length} />
        <Stat label="Today's wastage cost" value={inr(wasteCost)} />
        <Stat label="Vendor POs (all)" value={purchases.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="sm" hover={false}>
          <SectionTitle title="Stock & expiry alerts" />
          <div className="max-h-80 space-y-2 overflow-auto">
            {alerts.slice(0, 20).map((a, i) => (
              <div key={`${a.text}-${i}`} className="flex items-start justify-between gap-2 rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]">
                <span>{a.text}</span>
                <span className="shrink-0 rounded-md bg-card-0 px-2 py-0.5 text-[10px] font-bold uppercase text-text-muted">{a.kind}</span>
              </div>
            ))}
            {!alerts.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No alerts — stock looks healthy." /> : null}
          </div>
        </Card>
        <Card padding="sm" hover={false}>
          <SectionTitle title="Top stock by value" />
          <div className="space-y-2">
            {[...active]
              .map((i) => ({ ...i, value: availableQty(i) * num(i.avgCost || i.lastPurchaseCost || i.costPrice) }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 8)
              .map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]">
                  <span className="font-semibold">{i.item}</span>
                  <span>
                    {availableQty(i)} {i.unit} · {inr(i.value)}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
