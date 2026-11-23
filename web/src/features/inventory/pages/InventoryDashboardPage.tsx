import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { InventoryItemDoc, PurchaseEntryDoc, StockLotDoc, WastageDoc } from "../types";
import { buildStockAlerts, availableQty } from "../utils/alerts";
import { isoDate } from "@/lib/utils";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
    </motion.div>
  );
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inventory & recipes</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Stock control</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/inventory/items" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            Items
          </Link>
          <Link to="/inventory/purchases" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Purchases
          </Link>
          <Link to="/inventory/ops" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Adjust / Waste / Count
          </Link>
          <Link to="/inventory/recipes" className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white">
            Recipes
          </Link>
          <Link to="/inventory/production" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Production
          </Link>
        </div>
      </div>

      {loading ? <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">Stock & expiry alerts</div>
          <div className="max-h-80 space-y-2 overflow-auto">
            {alerts.slice(0, 20).map((a, i) => (
              <div key={`${a.text}-${i}`} className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <span>{a.text}</span>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">{a.kind}</span>
              </div>
            ))}
            {!alerts.length ? <div className="py-6 text-center text-sm text-slate-500">No alerts — stock looks healthy.</div> : null}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">Top stock by value</div>
          <div className="space-y-2">
            {[...active]
              .map((i) => ({ ...i, value: availableQty(i) * num(i.avgCost || i.lastPurchaseCost || i.costPrice) }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 8)
              .map((i) => (
                <div key={i.id} className="flex justify-between text-sm">
                  <span className="font-semibold">{i.item}</span>
                  <span>
                    {availableQty(i)} {i.unit} · {inr(i.value)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
