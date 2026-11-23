import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auditCreate } from "@/features/pos/services/posFirestore";
import { cacheReportSnapshot } from "@/features/reports/services/reportService";
import type { AnalyticsBundle } from "../utils/analyticsEngine";

export async function writeDashboardMetrics(bundle: AnalyticsBundle, periodType: "day" | "week" | "month" | "year" = "day") {
  const ref = doc(collection(db, "dashboardMetrics"));
  await setDoc(ref, {
    period: bundle.filters.to,
    periodType,
    sales: bundle.sales.total,
    expenses: bundle.expenses.paid,
    profit: bundle.profit.net,
    orders: bundle.sales.count,
    aov: bundle.kpis.find((k) => k.id === "aov")?.value || 0,
    foodCostPct: bundle.profit.foodCostPct,
    inventoryValue: bundle.inventory.value,
    pendingPayments: bundle.kpis.find((k) => k.id === "pending")?.value || 0,
    customers: bundle.kpis.find((k) => k.id === "customers")?.value || 0,
    syncStatus: "synced",
    ...auditCreate({ status: "active" })
  });
  await cacheReportSnapshot({
    reportType: "analytics_dashboard",
    filters: bundle.filters as unknown as Record<string, unknown>,
    summary: {
      sales: bundle.sales.total,
      profit: bundle.profit.net,
      expenses: bundle.expenses.paid
    }
  });
  return ref.id;
}
