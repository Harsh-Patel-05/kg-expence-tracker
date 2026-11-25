import { useMemo, useState } from "react";
import type { OrderDoc, OrderStatus, OrderType } from "@/features/pos/types";
import { useRestaurantCollection, type WithId } from "@/features/pos/hooks/useRestaurantCollection";
import { isoDate, num } from "@/lib/utils";
import { expectedPrepMinutes } from "../engine/statusMachine";
import { computeOrderTiming } from "../utils/orderTiming";
import { useNowTick } from "./useNowTick";

export type OrderFilters = {
  search: string;
  orderType: string;
  platform: string;
  status: string;
  chef: string;
  payment: string;
};

export function useLiveOrders() {
  const { data, loading, error } = useRestaurantCollection<OrderDoc>({ path: "orders" });
  const now = useNowTick(1000);
  const [filters, setFilters] = useState<OrderFilters>({
    search: "",
    orderType: "all",
    platform: "all",
    status: "all",
    chef: "all",
    payment: "all"
  });

  const today = isoDate();

  const enriched = useMemo(() => {
    return data.map((o) => {
      const itemCount = (o.items || []).reduce((s, l) => s + num(l.qty), 0);
      const timing = computeOrderTiming({ ...o, itemCount }, now);
      const eta = timing.etaMin;
      const ageMin = Math.max(0, Math.floor(timing.ageSec / 60));
      return {
        ...o,
        ageMin,
        delayed: timing.delayed,
        itemCount,
        eta,
        remainSec: timing.remainSec,
        dueMs: timing.dueMs,
        ageSec: timing.ageSec,
        urgencyScore: timing.priority
      };
    });
  }, [data, now]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return enriched.filter((o) => {
      if (filters.orderType !== "all" && o.orderType !== filters.orderType) return false;
      if (filters.platform !== "all" && String(o.platform || o.orderType) !== filters.platform) return false;
      if (filters.status !== "all" && String(o.status) !== filters.status) return false;
      if (filters.chef !== "all" && String(o.chefName || o.chefId || "") !== filters.chef) return false;
      if (filters.payment === "paid" && num(o.balanceDue) > 0.01) return false;
      if (filters.payment === "unpaid" && num(o.balanceDue) <= 0.01) return false;
      if (!q) return true;
      const blob = `${o.invoiceNo || ""} ${o.id} ${o.customerName || ""} ${o.customerPhone || ""} ${o.tableName || ""} ${o.platformOrderId || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [enriched, filters]);

  const stats = useMemo(() => {
    const todays = enriched.filter((o) => String(o.date || "").slice(0, 10) === today);
    const byStatus = (s: OrderStatus | string) => todays.filter((o) => o.status === s).length;
    // Shop revenue excludes Swiggy / Zomato platform orders
    const revenue = todays
      .filter((o) => {
        const t = String(o.orderType || (o as { channel?: string }).channel || "").toLowerCase();
        if (t.includes("swiggy") || t.includes("zomato")) return false;
        return o.status === "completed" || num(o.paidTotal) > 0;
      })
      .reduce((s, o) => s + num(o.paidTotal || o.total), 0);
    const prepSamples = todays
      .filter((o) => o.readyAt && (o.acceptedAt || o.preparingAt))
      .map((o) => {
        const a = Date.parse(String(o.acceptedAt || o.preparingAt));
        const b = Date.parse(String(o.readyAt));
        return (b - a) / 60_000;
      })
      .filter((n) => Number.isFinite(n) && n >= 0);
    const avgPrep = prepSamples.length ? prepSamples.reduce((a, b) => a + b, 0) / prepSamples.length : 0;
    const deliverySamples = todays
      .filter((o) => o.completedAt && o.readyAt && (o.orderType === "delivery" || o.orderType === "swiggy" || o.orderType === "zomato"))
      .map((o) => (Date.parse(String(o.completedAt)) - Date.parse(String(o.readyAt))) / 60_000)
      .filter((n) => Number.isFinite(n) && n >= 0);
    const avgDelivery = deliverySamples.length
      ? deliverySamples.reduce((a, b) => a + b, 0) / deliverySamples.length
      : 0;

    return {
      live: todays.filter((o) => isActiveKitchen(o.status)).length,
      preparing: byStatus("preparing") + byStatus("cooking") + byStatus("accepted"),
      ready: byStatus("ready") + byStatus("packed"),
      served: byStatus("served") + byStatus("delivered"),
      completed: byStatus("completed"),
      cancelled: byStatus("cancelled") + byStatus("rejected"),
      refunded: byStatus("refunded"),
      delayed: todays.filter((o) => o.delayed).length,
      priority: todays.filter((o) => o.priority && o.priority !== "normal").length,
      scheduled: enriched.filter((o) => o.orderType === "scheduled" && o.scheduledFor && Date.parse(o.scheduledFor) > Date.now()).length,
      pendingPay: todays.filter((o) => num(o.balanceDue) > 0.01 && o.status !== "cancelled").length,
      revenue,
      ordersToday: todays.length,
      avgPrep,
      avgDelivery
    };
  }, [enriched, today]);

  return { orders: filtered, allOrders: enriched, loading, error, filters, setFilters, stats };
}

function isActiveKitchen(status?: string) {
  return [
    "pending",
    "confirmed",
    "accepted",
    "preparing",
    "cooking",
    "ready",
    "packed",
    "held",
    "waiting_pickup",
    "out_for_delivery"
  ].includes(String(status || ""));
}

function parseTime(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "string" || typeof v === "number") {
    const n = Date.parse(String(v));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && v && "seconds" in (v as any)) {
    return Number((v as any).seconds) * 1000;
  }
  return null;
}

export type LiveOrder = WithId<OrderDoc> & {
  ageMin: number;
  delayed: boolean;
  itemCount: number;
  eta: number;
  remainSec: number;
  dueMs: number;
  ageSec: number;
  /** Lower = more urgent (countdown / overdue). Not OrderDoc.priority. */
  urgencyScore: number;
};

export function filterByKitchenCategory(orders: LiveOrder[], category: string | "all") {
  if (category === "all") return orders;
  const key = category.toLowerCase();
  return orders.filter((o) => {
    if ((o.kitchenCategories || []).some((c) => c.toLowerCase() === key)) return true;
    return (o.items || []).some((i) => String(i.category || "").toLowerCase() === key);
  });
}

export const KDS_CATEGORIES = [
  "All",
  "Chinese",
  "Punjabi",
  "South Indian",
  "Pizza",
  "Snacks",
  "Beverages",
  "Desserts"
];
