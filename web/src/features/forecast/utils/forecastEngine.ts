import { num } from "@/lib/utils";
import type { SaleLike } from "@/features/reports/utils/reportEngine";
import type { ExpenseDoc } from "@/features/tasks/types";
import type { InventoryItemDoc, PurchaseEntryDoc } from "@/features/inventory/types";
import { availableQty } from "@/features/inventory/utils/alerts";
import { profitReport } from "@/features/reports/utils/reportEngine";

export type ForecastHorizon = "tomorrow" | "7d" | "30d" | "month" | "quarter" | "year";

export type DailyPoint = { date: string; revenue: number; orders: number };

export type ForecastDay = {
  date: string;
  forecastRevenue: number;
  forecastOrders: number;
  forecastProfit: number;
  dow: number;
  factors: string[];
};

export type ForecastResult = {
  horizon: ForecastHorizon;
  from: string;
  to: string;
  expectedRevenue: number;
  expectedOrders: number;
  expectedProfit: number;
  expectedCustomers: number;
  expectedAov: number;
  expectedFoodCost: number;
  foodCostPct: number;
  growthPct: number;
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  risk: "low" | "medium" | "high";
  riskReasons: string[];
  insights: string[];
  recommendations: string[];
  series: ForecastDay[];
  history: DailyPoint[];
  actualVsForecast?: Array<{ date: string; actual: number; forecast: number; errorPct: number }>;
  model: {
    baselineDaily: number;
    dowFactors: number[];
    trendSlope: number;
    sampleDays: number;
    cancelRate: number;
  };
};

export type OrderLike = {
  date?: string;
  total?: number;
  grandTotal?: number;
  amount?: number;
  status?: string;
  channel?: string;
  customerId?: string;
  customerPhone?: string;
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
}

function saleAmount(s: SaleLike) {
  return num(s.total) || num(s.amount) || num(s.cashAmount) + num(s.onlineAmount);
}

function orderAmount(o: OrderLike) {
  return num(o.grandTotal) || num(o.total) || num(o.amount);
}

/** Approximate Indian festival / holiday uplift windows (MM-DD). Architecture-ready for weather/API later. */
const FESTIVAL_WINDOWS: Array<{ mmdd: string; label: string; uplift: number }> = [
  { mmdd: "01-01", label: "New Year", uplift: 1.15 },
  { mmdd: "01-26", label: "Republic Day", uplift: 1.08 },
  { mmdd: "03-08", label: "Holi season", uplift: 1.18 },
  { mmdd: "08-15", label: "Independence Day", uplift: 1.1 },
  { mmdd: "10-02", label: "Gandhi Jayanti", uplift: 1.05 },
  { mmdd: "10-24", label: "Diwali season", uplift: 1.25 },
  { mmdd: "10-31", label: "Diwali week", uplift: 1.22 },
  { mmdd: "11-01", label: "Diwali aftermath", uplift: 1.12 },
  { mmdd: "12-25", label: "Christmas", uplift: 1.2 },
  { mmdd: "12-31", label: "New Year Eve", uplift: 1.3 }
];

function festivalFactor(date: string): { factor: number; label?: string } {
  const mmdd = date.slice(5);
  const hit = FESTIVAL_WINDOWS.find((f) => f.mmdd === mmdd);
  if (hit) return { factor: hit.uplift, label: hit.label };
  // nearby (±1 day) soft uplift
  const d = new Date(date + "T00:00:00");
  for (const delta of [-1, 1]) {
    const x = new Date(d);
    x.setDate(x.getDate() + delta);
    const key = ymd(x).slice(5);
    const near = FESTIVAL_WINDOWS.find((f) => f.mmdd === key);
    if (near) return { factor: 1 + (near.uplift - 1) * 0.4, label: `${near.label} (nearby)` };
  }
  return { factor: 1 };
}

export function buildDailySeries(args: { sales: SaleLike[]; orders?: OrderLike[] }): DailyPoint[] {
  const map = new Map<string, DailyPoint>();

  for (const s of args.sales) {
    const date = String(s.date || "").slice(0, 10);
    if (!date) continue;
    const cur = map.get(date) || { date, revenue: 0, orders: 0 };
    cur.revenue += saleAmount(s);
    cur.orders += 1;
    map.set(date, cur);
  }

  for (const o of args.orders || []) {
    const date = String(o.date || "").slice(0, 10);
    if (!date) continue;
    const st = String(o.status || "").toLowerCase();
    if (st === "cancelled" || st === "canceled") continue;
    const cur = map.get(date) || { date, revenue: 0, orders: 0 };
    // Prefer sales ledger when present; orders fill gaps / add volume signal
    if (cur.revenue <= 0) cur.revenue += orderAmount(o);
    cur.orders += 1;
    map.set(date, cur);
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr: number[]) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

/** Simple linear regression slope (per day) on last N points */
function trendSlope(points: DailyPoint[], window = 28) {
  const slice = points.slice(-window);
  if (slice.length < 3) return 0;
  const n = slice.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  slice.forEach((p, i) => {
    sumX += i;
    sumY += p.revenue;
    sumXY += i * p.revenue;
    sumXX += i * i;
  });
  const den = n * sumXX - sumX * sumX;
  if (!den) return 0;
  return (n * sumXY - sumX * sumY) / den;
}

function dowFactors(points: DailyPoint[]) {
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  points.forEach((p) => {
    const dow = new Date(p.date + "T00:00:00").getDay();
    buckets[dow].push(p.revenue);
  });
  const overall = mean(points.map((p) => p.revenue)) || 1;
  return buckets.map((b) => {
    const m = mean(b);
    return m > 0 ? m / overall : 1;
  });
}

function horizonDays(horizon: ForecastHorizon, today: string): { from: string; to: string; days: number } {
  if (horizon === "tomorrow") {
    const t = addDays(today, 1);
    return { from: t, to: t, days: 1 };
  }
  if (horizon === "7d") return { from: addDays(today, 1), to: addDays(today, 7), days: 7 };
  if (horizon === "30d") return { from: addDays(today, 1), to: addDays(today, 30), days: 30 };
  if (horizon === "month") {
    const d = new Date(today + "T00:00:00");
    const first = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 2, 0);
    const days = last.getDate();
    return { from: ymd(first), to: ymd(last), days };
  }
  if (horizon === "quarter") {
    return { from: addDays(today, 1), to: addDays(today, 90), days: 90 };
  }
  return { from: addDays(today, 1), to: addDays(today, 365), days: 365 };
}

export function runSalesForecast(args: {
  sales: SaleLike[];
  orders?: OrderLike[];
  expenses?: ExpenseDoc[];
  purchases?: PurchaseEntryDoc[];
  inventory?: InventoryItemDoc[];
  horizon: ForecastHorizon;
  today?: string;
  accuracyBias?: number; // from past error learning, e.g. 0.98 means historically over-forecast by 2%
}): ForecastResult {
  const today = args.today || ymd(new Date());
  const history = buildDailySeries({ sales: args.sales, orders: args.orders });
  const recent = history.filter((p) => p.date <= today);
  const sampleDays = recent.length;
  const baselineDaily = mean(recent.slice(-28).map((p) => p.revenue)) || mean(recent.map((p) => p.revenue));
  const baselineOrders = mean(recent.slice(-28).map((p) => p.orders)) || mean(recent.map((p) => p.orders)) || 1;
  const factorsDow = dowFactors(recent.length ? recent : [{ date: today, revenue: 0, orders: 0 }]);
  const slope = trendSlope(recent, 28);
  const aov = baselineOrders > 0 ? baselineDaily / baselineOrders : baselineDaily;

  const cancelled = (args.orders || []).filter((o) => /cancel/i.test(String(o.status || ""))).length;
  const totalOrders = (args.orders || []).length || 1;
  const cancelRate = cancelled / totalOrders;

  // Food cost estimate from purchases vs sales (last 30d)
  const from30 = addDays(today, -29);
  const sales30 = recent.filter((p) => p.date >= from30).reduce((s, p) => s + p.revenue, 0) || baselineDaily * 30;
  const purch30 = (args.purchases || [])
    .filter((p) => String(p.date || p.invoiceDate || "").slice(0, 10) >= from30)
    .reduce((s, p) => s + num(p.price ?? p.total), 0);
  const foodCostPct = sales30 > 0 ? Math.min(0.75, Math.max(0.15, purch30 / sales30)) : 0.32;

  const exp30 = (args.expenses || [])
    .filter((e) => e.status === "paid" && String(e.date || "").slice(0, 10) >= from30)
    .reduce((s, e) => s + num(e.amount), 0);
  const dailyExpense = exp30 / 30;

  const range = horizonDays(args.horizon, today);
  const bias = args.accuracyBias && args.accuracyBias > 0 ? args.accuracyBias : 1;

  const series: ForecastDay[] = [];
  for (let i = 0; i < range.days; i++) {
    const date = addDays(range.from, i);
    const dow = new Date(date + "T00:00:00").getDay();
    const dayFactors: string[] = [];
    let factor = factorsDow[dow] || 1;
    if (dow === 5) {
      factor *= 1.06;
      dayFactors.push("Friday uplift");
    }
    if (dow === 0 || dow === 6) {
      factor *= 1.08;
      dayFactors.push("Weekend demand");
    }
    const dayNum = Number(date.slice(8, 10));
    if (dayNum >= 28) {
      factor *= 1.05;
      dayFactors.push("Month-end demand");
    }
    const fest = festivalFactor(date);
    if (fest.factor !== 1) {
      factor *= fest.factor;
      if (fest.label) dayFactors.push(fest.label);
    }

    // trend: project days ahead from last history point
    const daysAhead = Math.max(1, Math.round((Date.parse(date) - Date.parse(today)) / 86400000));
    const trendAdj = baselineDaily + slope * daysAhead;
    let revenue = Math.max(0, trendAdj * factor * (1 - cancelRate * 0.35) * bias);
    let orders = Math.max(1, Math.round((revenue / Math.max(aov, 1)) * factor * 0.95));

    const cogs = revenue * foodCostPct;
    const profit = Math.max(0, revenue - cogs - dailyExpense);

    series.push({
      date,
      forecastRevenue: Math.round(revenue),
      forecastOrders: orders,
      forecastProfit: Math.round(profit),
      dow,
      factors: dayFactors
    });
  }

  const expectedRevenue = series.reduce((s, d) => s + d.forecastRevenue, 0);
  const expectedOrders = series.reduce((s, d) => s + d.forecastOrders, 0);
  const expectedProfit = series.reduce((s, d) => s + d.forecastProfit, 0);
  const expectedAov = expectedOrders ? expectedRevenue / expectedOrders : aov;
  const expectedFoodCost = expectedRevenue * foodCostPct;
  const expectedCustomers = Math.round(expectedOrders * 0.72); // approx unique customers

  const prevWindow = recent.slice(-range.days);
  const prevRevenue = prevWindow.reduce((s, p) => s + p.revenue, 0) || baselineDaily * range.days;
  const growthPct = prevRevenue > 0 ? ((expectedRevenue - prevRevenue) / prevRevenue) * 100 : 0;

  const revenues = recent.slice(-28).map((p) => p.revenue);
  const cv = baselineDaily > 0 ? stdev(revenues) / baselineDaily : 1;
  let confidenceScore = 55;
  if (sampleDays >= 60) confidenceScore += 20;
  else if (sampleDays >= 28) confidenceScore += 12;
  else if (sampleDays >= 14) confidenceScore += 6;
  else confidenceScore -= 15;
  if (cv < 0.25) confidenceScore += 15;
  else if (cv < 0.45) confidenceScore += 5;
  else confidenceScore -= 10;
  if (cancelRate > 0.12) confidenceScore -= 8;
  confidenceScore = Math.max(15, Math.min(95, Math.round(confidenceScore)));

  const confidence: ForecastResult["confidence"] =
    confidenceScore >= 70 ? "high" : confidenceScore >= 45 ? "medium" : "low";

  const riskReasons: string[] = [];
  let risk: ForecastResult["risk"] = "low";
  if (sampleDays < 14) {
    risk = "high";
    riskReasons.push("Limited historical sales data for stable prediction");
  }
  if (cv > 0.55) {
    risk = risk === "low" ? "medium" : risk;
    riskReasons.push("High day-to-day sales variance");
  }
  if (cancelRate > 0.1) {
    risk = "high";
    riskReasons.push(`Elevated cancellation rate (${(cancelRate * 100).toFixed(1)}%)`);
  }
  if (growthPct < -8) {
    risk = risk === "low" ? "medium" : risk;
    riskReasons.push("Projected decline vs recent comparable window");
  }
  if (foodCostPct > 0.4) {
    riskReasons.push("Food cost ratio is elevated — profit risk");
    if (risk === "low") risk = "medium";
  }
  if (!riskReasons.length) riskReasons.push("Demand pattern looks stable relative to recent history");

  const fri = factorsDow[5] || 1;
  const sun = factorsDow[0] || 1;
  const sat = factorsDow[6] || 1;
  const insights: string[] = [];
  if (fri > 1.05) insights.push(`Friday sales typically run ${((fri - 1) * 100).toFixed(0)}% above the daily average.`);
  if (sat > 1.05 || sun > 1.05) {
    insights.push(`Weekend demand is stronger (Sat ×${sat.toFixed(2)}, Sun ×${sun.toFixed(2)} vs baseline).`);
  }
  insights.push(`Baseline daily revenue ≈ ₹${Math.round(baselineDaily).toLocaleString("en-IN")} from ${sampleDays} history days.`);
  insights.push(`Trend slope ≈ ₹${slope.toFixed(0)}/day over the last ${Math.min(28, sampleDays)} days.`);
  insights.push(`Estimated food cost share ≈ ${(foodCostPct * 100).toFixed(1)}% of sales.`);
  if (cancelRate > 0) insights.push(`Cancellations currently affect ~${(cancelRate * 100).toFixed(1)}% of orders.`);

  // Item / inventory recommendations from stock + purchase velocity
  const recommendations: string[] = [];
  const inv = args.inventory || [];
  const low = inv.filter((i) => {
    const avail = availableQty(i);
    const thr = num(i.threshold || i.minStock);
    return thr > 0 && avail <= thr;
  });
  if (low.length) {
    recommendations.push(`Increase stock for ${low.slice(0, 3).map((i) => i.item).join(", ")} ahead of forecast demand.`);
  }
  if (fri > 1.1 || sat > 1.1) {
    recommendations.push("Schedule additional kitchen staff for Friday–Sunday service.");
    recommendations.push("Prepare ~15–20% extra high-velocity gravy/prep for weekend peaks.");
  }
  if (dayNearFestival(range.from, range.to)) {
    recommendations.push("Festival window ahead — pull forward vegetable & dairy purchases to morning of peak days.");
  }
  if (growthPct < 0) {
    recommendations.push("Reduce prep for slow-moving items until demand recovers.");
  } else {
    recommendations.push("Protect inventory cover for top sellers; forecast shows positive demand.");
  }
  if (foodCostPct > 0.38) recommendations.push("Review recipe costing and portioning — food cost forecast is high.");

  // Actual vs forecast for last completed days if history exists (self-learning input surface)
  const actualVsForecast = recent.slice(-14).map((p, idx, arr) => {
    const dow = new Date(p.date + "T00:00:00").getDay();
    const back = arr.length - 1 - idx;
    const model = Math.max(0, (baselineDaily + slope * -back) * (factorsDow[dow] || 1) * bias);
    const errorPct = model > 0 ? ((p.revenue - model) / model) * 100 : 0;
    return { date: p.date, actual: Math.round(p.revenue), forecast: Math.round(model), errorPct };
  });

  return {
    horizon: args.horizon,
    from: range.from,
    to: range.to,
    expectedRevenue: Math.round(expectedRevenue),
    expectedOrders,
    expectedProfit: Math.round(expectedProfit),
    expectedCustomers,
    expectedAov: Math.round(expectedAov),
    expectedFoodCost: Math.round(expectedFoodCost),
    foodCostPct: Math.round(foodCostPct * 1000) / 10,
    growthPct: Math.round(growthPct * 10) / 10,
    confidence,
    confidenceScore,
    risk,
    riskReasons,
    insights,
    recommendations,
    series,
    history: recent.slice(-60),
    actualVsForecast,
    model: {
      baselineDaily: Math.round(baselineDaily),
      dowFactors: factorsDow.map((x) => Math.round(x * 100) / 100),
      trendSlope: Math.round(slope * 100) / 100,
      sampleDays,
      cancelRate: Math.round(cancelRate * 1000) / 10
    }
  };
}

function dayNearFestival(from: string, to: string) {
  let d = from;
  while (d <= to) {
    if (festivalFactor(d).factor > 1.05) return true;
    d = addDays(d, 1);
    if (d > to) break;
  }
  return false;
}

/** Derive correction bias from past accuracy records (mean actual/forecast). */
export function biasFromAccuracy(rows: Array<{ actual: number; forecast: number }>) {
  const usable = rows.filter((r) => r.forecast > 0 && r.actual >= 0);
  if (usable.length < 3) return 1;
  const ratios = usable.map((r) => r.actual / r.forecast);
  const m = mean(ratios);
  return Math.max(0.7, Math.min(1.3, m));
}

export function inventoryValue(inventory: InventoryItemDoc[]) {
  return inventory.reduce((s, i) => s + availableQty(i) * num(i.avgCost || i.lastPurchaseCost || i.costPrice), 0);
}

export function quickProfitCheck(salesTotal: number, expensePaid: number, purchasePaid: number) {
  return profitReport({ salesTotal, expenseTotal: expensePaid, purchasePaid });
}
