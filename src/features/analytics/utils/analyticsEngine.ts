import { num } from "@/lib/utils";
import {
  expenseReport,
  inventoryReport,
  profitReport,
  purchaseReport,
  salesSummary,
  type ReportFilters,
  type SaleLike
} from "@/features/reports/utils/reportEngine";
import type { ExpenseDoc } from "@/features/tasks/types";
import type { InventoryItemDoc, PurchaseEntryDoc, WastageDoc } from "@/features/inventory/types";
import { availableQty } from "@/features/inventory/utils/alerts";
import { pctChange, previousPeriod, sparklineFromDaily } from "./datePresets";
import type { WithId } from "@/features/pos/hooks/useRestaurantCollection";

export type AnalyticsBundle = {
  filters: ReportFilters;
  sales: ReturnType<typeof salesSummary>;
  prevSales: ReturnType<typeof salesSummary>;
  expenses: ReturnType<typeof expenseReport>;
  prevExpenses: ReturnType<typeof expenseReport>;
  purchases: ReturnType<typeof purchaseReport>;
  inventory: ReturnType<typeof inventoryReport>;
  profit: ReturnType<typeof profitReport>;
  prevProfit: ReturnType<typeof profitReport>;
  kpis: Array<{
    id: string;
    label: string;
    value: number;
    format: "inr" | "number" | "pct";
    change: number;
    spark: number[];
  }>;
  itemAnalytics: Array<{ item: string; qty: number; revenue: number }>;
  paymentMix: Array<{ name: string; value: number }>;
};

export function buildAnalytics(args: {
  from: string;
  to: string;
  sales: SaleLike[];
  expenses: ExpenseDoc[];
  purchases: PurchaseEntryDoc[];
  inventory: InventoryItemDoc[];
  wastage?: WastageDoc[];
  orders?: Array<{ date?: string; total?: number; grandTotal?: number; status?: string }>;
  category?: string;
  supplier?: string;
}): AnalyticsBundle {
  const filters: ReportFilters = {
    from: args.from,
    to: args.to,
    category: args.category || "all",
    supplier: args.supplier || "all"
  };
  const prev = previousPeriod(args.from, args.to);
  const prevFilters: ReportFilters = { ...filters, from: prev.from, to: prev.to };

  const sales = salesSummary(args.sales, filters);
  const prevSales = salesSummary(args.sales, prevFilters);
  const expenses = expenseReport(args.expenses, filters);
  const prevExpenses = expenseReport(args.expenses, prevFilters);
  const purchases = purchaseReport(args.purchases, filters);
  const inventory = inventoryReport(args.inventory);

  const paidPurchases = purchases.total - purchases.unpaid;
  const prevPaidPurchases = (() => {
    const p = purchaseReport(args.purchases, prevFilters);
    return p.total - p.unpaid;
  })();

  const profit = profitReport({
    salesTotal: sales.total,
    expenseTotal: expenses.paid,
    purchasePaid: paidPurchases
  });
  const prevProfit = profitReport({
    salesTotal: prevSales.total,
    expenseTotal: prevExpenses.paid,
    purchasePaid: prevPaidPurchases
  });

  const orderRows = (args.orders || []).filter((o) => {
    const d = String(o.date || "").slice(0, 10);
    return d >= args.from && d <= args.to && o.status !== "cancelled";
  });
  const orderCount = orderRows.length || sales.count;
  const aov = orderCount ? sales.total / orderCount : 0;
  const prevAov = prevSales.count ? prevSales.total / prevSales.count : 0;

  const pendingPayments = expenses.unpaid + purchases.unpaid;

  const kpis = [
    {
      id: "sales",
      label: "Sales",
      value: sales.total,
      format: "inr" as const,
      change: pctChange(sales.total, prevSales.total),
      spark: sparklineFromDaily(sales.daily)
    },
    {
      id: "profit",
      label: "Net profit",
      value: profit.net,
      format: "inr" as const,
      change: pctChange(profit.net, prevProfit.net),
      spark: sparklineFromDaily(sales.daily)
    },
    {
      id: "orders",
      label: "Orders / sales rows",
      value: orderCount,
      format: "number" as const,
      change: pctChange(orderCount, prevSales.count),
      spark: sparklineFromDaily(sales.daily)
    },
    {
      id: "aov",
      label: "Avg order value",
      value: aov,
      format: "inr" as const,
      change: pctChange(aov, prevAov),
      spark: sparklineFromDaily(sales.daily)
    },
    {
      id: "margin",
      label: "Profit margin",
      value: profit.margin,
      format: "pct" as const,
      change: pctChange(profit.margin, prevProfit.margin),
      spark: [prevProfit.margin, profit.margin]
    },
    {
      id: "foodcost",
      label: "Food cost %",
      value: profit.foodCostPct,
      format: "pct" as const,
      change: pctChange(profit.foodCostPct, prevProfit.foodCostPct),
      spark: [prevProfit.foodCostPct, profit.foodCostPct]
    },
    {
      id: "expenses",
      label: "Expenses (paid)",
      value: expenses.paid,
      format: "inr" as const,
      change: pctChange(expenses.paid, prevExpenses.paid),
      spark: sparklineFromDaily(sales.daily)
    },
    {
      id: "inventory",
      label: "Inventory value",
      value: inventory.value,
      format: "inr" as const,
      change: 0,
      spark: [inventory.value]
    },
    {
      id: "pending",
      label: "Pending payments",
      value: pendingPayments,
      format: "inr" as const,
      change: 0,
      spark: [pendingPayments]
    },
    {
      id: "customers",
      label: "Active SKUs",
      value: inventory.skus,
      format: "number" as const,
      change: 0,
      spark: [inventory.skus]
    }
  ];

  // Item analytics from purchases lines / sales item field
  const itemMap = new Map<string, { qty: number; revenue: number }>();
  args.purchases
    .filter((p) => {
      const d = String(p.date || p.invoiceDate || "").slice(0, 10);
      return d >= args.from && d <= args.to;
    })
    .forEach((p) => {
      (p.lines || []).forEach((l) => {
        const cur = itemMap.get(l.item) || { qty: 0, revenue: 0 };
        cur.qty += num(l.qty);
        cur.revenue += num(l.qty) * num(l.rate);
        itemMap.set(l.item, cur);
      });
      if (!p.lines?.length && p.item) {
        const cur = itemMap.get(p.item) || { qty: 0, revenue: 0 };
        cur.qty += num(p.qty);
        cur.revenue += num(p.price ?? p.total);
        itemMap.set(p.item, cur);
      }
    });
  args.sales.forEach((s) => {
    if (!s.item) return;
    const d = String(s.date || "").slice(0, 10);
    if (d < args.from || d > args.to) return;
    const cur = itemMap.get(s.item) || { qty: 0, revenue: 0 };
    cur.qty += 1;
    cur.revenue += num(s.total) || num(s.amount) || num(s.cashAmount) + num(s.onlineAmount);
    itemMap.set(s.item, cur);
  });

  const itemAnalytics = [...itemMap.entries()]
    .map(([item, v]) => ({ item, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const paymentMix = [
    { name: "Cash", value: sales.cash },
    { name: "Online", value: sales.online }
  ].filter((x) => x.value > 0);

  return {
    filters,
    sales,
    prevSales,
    expenses,
    prevExpenses,
    purchases,
    inventory,
    profit,
    prevProfit,
    kpis,
    itemAnalytics,
    paymentMix
  };
}

export function slowMovingItems(inventory: Array<WithId<InventoryItemDoc> | InventoryItemDoc>, topN = 10) {
  return [...inventory]
    .filter((i) => !(i as any).isDeleted && !(i as any).archived)
    .map((i) => ({ item: (i as any).item as string, qty: availableQty(i as InventoryItemDoc), value: availableQty(i as InventoryItemDoc) * num((i as any).avgCost) }))
    .filter((i) => i.qty > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, topN);
}
