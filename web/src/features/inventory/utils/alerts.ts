import { num } from "@/lib/utils";
import type { InventoryItemDoc, StockAlert, StockLotDoc } from "../types";
import type { WithId } from "@/features/pos/hooks/useRestaurantCollection";

function daysBetween(fromISO: string, toISO: string) {
  const a = Date.parse(String(fromISO).slice(0, 10));
  const b = Date.parse(String(toISO).slice(0, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 999;
  return Math.round((b - a) / 86400000);
}

/** Port of KgPhase2.stockAlerts + reorder/critical levels */
export function buildStockAlerts(args: {
  inventory: Array<WithId<InventoryItemDoc>>;
  lots?: Array<WithId<StockLotDoc>>;
  today?: string;
  warnDays?: number;
}): StockAlert[] {
  const today = args.today || new Date().toISOString().slice(0, 10);
  const warnDays = args.warnDays ?? 3;
  const alerts: StockAlert[] = [];

  for (const x of args.inventory) {
    if (x.isDeleted || x.archived) continue;
    const qty = num(x.qty) - num(x.reservedQty);
    const thr = num(x.threshold || x.minStock || x.reorderLevel);
    const reorder = num(x.reorderLevel || thr);
    if (qty <= 0) {
      alerts.push({ kind: "out", text: `Out of stock: ${x.item}`, inventoryId: x.id, sort: -2 });
    } else if (thr > 0 && qty <= thr * 0.5) {
      alerts.push({
        kind: "critical",
        text: `Critical: ${x.item} (${qty} ${x.unit || "unit"})`,
        inventoryId: x.id,
        sort: -1
      });
    } else if (thr > 0 && qty <= thr) {
      alerts.push({
        kind: "low",
        text: `Low stock: ${x.item} (${qty} ≤ ${thr})`,
        inventoryId: x.id,
        sort: 0
      });
    } else if (reorder > 0 && qty <= reorder) {
      alerts.push({
        kind: "reorder",
        text: `Near reorder: ${x.item} (${qty} ≤ ${reorder})`,
        inventoryId: x.id,
        sort: 1
      });
    }
  }

  for (const lot of args.lots || []) {
    const rem = num(lot.remainingQty ?? lot.qty);
    const exp = String(lot.expiryDate || "").slice(0, 10);
    if (!exp || rem <= 0) continue;
    const d = daysBetween(today, exp);
    if (d < 0) {
      alerts.push({
        kind: "expired",
        text: `Expired: ${lot.item} (${exp}) · ${rem} left`,
        inventoryId: lot.inventoryId,
        sort: -3
      });
    } else if (d <= warnDays) {
      alerts.push({
        kind: "expiry",
        text: `Expiring in ${d}d: ${lot.item} (${exp})`,
        inventoryId: lot.inventoryId,
        sort: d
      });
    }
  }

  return alerts.sort((a, b) => a.sort - b.sort);
}

export function availableQty(item: InventoryItemDoc): number {
  return Math.max(0, num(item.qty) - num(item.reservedQty));
}
