import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { inr } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { ExpenseDoc } from "@/features/tasks/types";
import type { InventoryItemDoc, PurchaseEntryDoc } from "@/features/inventory/types";
import type { SaleLike } from "@/features/reports/utils/reportEngine";
import { downloadText, toCsv, printReport } from "@/features/reports/utils/reportEngine";
import { canAccessReports, canExportReports } from "@/features/suppliers/utils/permissions";
import { runSalesForecast, type ForecastHorizon, type ForecastResult, type OrderLike } from "../utils/forecastEngine";
import { loadAccuracyBias, saveForecastSnapshot } from "../services/forecastService";
import { ContentLoading, Skeleton } from "@/components/ui/Loading";

const HORIZONS: Array<{ id: ForecastHorizon; label: string }> = [
  { id: "tomorrow", label: "Tomorrow" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "month", label: "Next Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" }
];

const EMPTY_FORECAST: ForecastResult = {
  horizon: "7d",
  from: "",
  to: "",
  expectedRevenue: 0,
  expectedCash: 0,
  expectedOnline: 0,
  expectedOrders: 0,
  expectedProfit: 0,
  expectedExpenses: 0,
  expectedCustomers: 0,
  expectedAov: 0,
  expectedFoodCost: 0,
  foodCostPct: 0,
  growthPct: 0,
  confidence: "low",
  confidenceScore: 0,
  risk: "medium",
  riskReasons: [],
  insights: [],
  recommendations: [],
  whatItDoes: [],
  series: [],
  history: [],
  actualVsForecast: [],
  model: {
    baselineDaily: 0,
    cashShare: 50,
    onlineShare: 50,
    dowFactors: [1, 1, 1, 1, 1, 1, 1],
    trendSlope: 0,
    sampleDays: 0,
    cancelRate: 0
  }
};

/** Keep chart payloads small so Recharts does not freeze the tab. */
function downsample<T>(rows: T[], maxPoints = 36): T[] {
  if (rows.length <= maxPoints) return rows;
  const step = Math.ceil(rows.length / maxPoints);
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += step) out.push(rows[i]);
  const last = rows[rows.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function ChartBox({ children, height = 220 }: { children: React.ReactNode; height?: number }) {
  // Explicit box stops ResponsiveContainer resize loops that freeze navigation
  return <div className="w-full min-w-0" style={{ height }}>{children}</div>;
}

export function ForecastDashboardPage() {
  const { role } = usePosAuth();
  const canAccess = canAccessReports(role);
  const canExport = canExportReports(role);

  const [horizon, setHorizon] = useState<ForecastHorizon>("7d");
  const [channel, setChannel] = useState("all");
  const [bias, setBias] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);
  const [showExtraCharts, setShowExtraCharts] = useState(false);
  const [forecast, setForecast] = useState<ForecastResult>(EMPTY_FORECAST);
  const [computing, setComputing] = useState(false);

  const { data: sales, loading } = useRestaurantCollection<SaleLike>({ path: "sales", max: 900 });
  const { data: expenses } = useRestaurantCollection<ExpenseDoc>({ path: "expenses", max: 500 });
  const { data: purchases } = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases", max: 400 });
  const { data: inventory } = useRestaurantCollection<InventoryItemDoc>({ path: "inventory", max: 300 });
  const { data: orders } = useRestaurantCollection<OrderLike>({ path: "orders", max: 500 });
  const { data: accuracy } = useRestaurantCollection<{
    date?: string;
    horizon?: string;
    forecast?: number;
    actual?: number;
    errorPct?: number;
  }>({ path: "forecastAccuracy", max: 40 });
  const { data: snapshots } = useRestaurantCollection<{
    horizon?: string;
    expectedRevenue?: number;
    confidenceScore?: number;
    createdAt?: unknown;
  }>({ path: "forecastSnapshots", max: 12 });

  const deferredSales = useDeferredValue(sales);
  const deferredOrders = useDeferredValue(orders);
  const deferredExpenses = useDeferredValue(expenses);
  const deferredPurchases = useDeferredValue(purchases);
  const deferredInventory = useDeferredValue(inventory);

  useEffect(() => {
    let cancelled = false;
    loadAccuracyBias()
      .then((b) => {
        if (!cancelled) setBias(b);
      })
      .catch(() => {
        if (!cancelled) setBias(1);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Paint shell first; mount charts on a later tick so sidebar clicks stay responsive
  useEffect(() => {
    const id = window.setTimeout(() => setChartsReady(true), 280);
    return () => window.clearTimeout(id);
  }, []);

  const filteredOrders = useMemo(() => {
    if (channel === "all") return deferredOrders;
    return deferredOrders.filter((o) => String(o.channel || "").toLowerCase() === channel);
  }, [deferredOrders, channel]);

  const channels = useMemo(() => {
    const set = new Set<string>();
    for (const o of deferredOrders) {
      const c = String(o.channel || "").trim();
      if (c) set.add(c.toLowerCase());
    }
    return [...set].sort();
  }, [deferredOrders]);

  // Run forecast off the critical path so navigation is never blocked mid-render
  useEffect(() => {
    let cancelled = false;
    setComputing(true);
    const handle = window.setTimeout(() => {
      try {
        const next = runSalesForecast({
          sales: deferredSales,
          orders: filteredOrders,
          expenses: deferredExpenses,
          purchases: deferredPurchases,
          inventory: deferredInventory,
          horizon,
          accuracyBias: bias
        });
        if (!cancelled) setForecast(next);
      } catch (e) {
        console.error("[forecast]", e);
        if (!cancelled) setMsg(e instanceof Error ? e.message : "Forecast failed");
      } finally {
        if (!cancelled) setComputing(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [deferredSales, filteredOrders, deferredExpenses, deferredPurchases, deferredInventory, horizon, bias]);

  const chartSeries = useMemo(() => downsample(forecast.series, 32), [forecast.series]);
  const chartBacktest = useMemo(() => downsample(forecast.actualVsForecast || [], 16), [forecast.actualVsForecast]);

  const weeklyTrend = useMemo(() => {
    const map = new Map<string, number>();
    forecast.history.slice(-90).forEach((p) => {
      const d = new Date(p.date + "T00:00:00");
      const key = `W${Math.ceil(d.getDate() / 7)}-${d.toLocaleString("en", { month: "short" })}`;
      map.set(key, (map.get(key) || 0) + p.revenue);
    });
    return [...map.entries()].slice(-12).map(([week, revenue]) => ({ week, revenue }));
  }, [forecast.history]);

  const monthlyTrend = useMemo(() => {
    const map = new Map<string, number>();
    forecast.history.forEach((p) => {
      const key = p.date.slice(0, 7);
      map.set(key, (map.get(key) || 0) + p.revenue);
    });
    return [...map.entries()].slice(-12).map(([month, revenue]) => ({ month, revenue }));
  }, [forecast.history]);

  const accuracyAvg = useMemo(() => {
    if (!accuracy.length) return null;
    const errs = accuracy.map((a) => Math.abs(Number(a.errorPct) || 0));
    const mae = errs.reduce((s, x) => s + x, 0) / errs.length;
    return Math.max(0, 100 - mae);
  }, [accuracy]);

  if (!canAccess) {
    return (
      <EmptyState title="No access to AI Sales Forecast" description="Your role cannot open the forecast engine." />
    );
  }

  const riskColor =
    forecast.risk === "low" ? "text-success" : forecast.risk === "medium" ? "text-warning" : "text-danger";

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="AI Forecast"
        title="Sales & cash forecast"
        description={
          computing || loading
            ? "Building forecast from your sales, expenses, purchases & inventory…"
            : `${forecast.from} → ${forecast.to} · ${forecast.model.sampleDays} history days · Cash ${forecast.model.cashShare}% / Online ${forecast.model.onlineShare}%`
        }
        actions={
          <>
            <Link to="/analytics" className="kg-btn kg-btn-secondary">
              Analytics
            </Link>
            <Link to="/sales" className="kg-btn kg-btn-secondary">
              Sales
            </Link>
            <button
              disabled={saving || computing}
              className="kg-btn kg-btn-primary disabled:opacity-60"
              onClick={async () => {
                setSaving(true);
                try {
                  await saveForecastSnapshot(forecast);
                  setMsg("Forecast snapshot saved");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Save failed");
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save snapshot
            </button>
          </>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <Card hover={false} className="!p-4">
        <SectionTitle
          title="What AI Forecast does here"
          description="Uses The Kilogram’s real modules — not dummy numbers."
        />
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 text-[13px] text-text-secondary">
          {(forecast.whatItDoes.length
            ? forecast.whatItDoes
            : [
                "Reads Sales (Cash / Online / Swiggy / Zomato) like Dashboard.",
                "Projects revenue, orders, profit for Tomorrow → Year.",
                "Uses Expenses + Purchases for cost & food-cost %.",
                "Flags stock gaps from Inventory + weekend/festival peaks."
              ]
          ).map((line) => (
            <li key={line} className="rounded-lg border border-stroke-0 bg-bg-1 px-3 py-2">
              {line}
            </li>
          ))}
        </ul>
      </Card>

      <Card hover={false} className="!p-3">
        <div className="flex flex-wrap gap-2">
          {HORIZONS.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => startTransition(() => setHorizon(h.id))}
              className={`kg-btn ${horizon === h.id ? "kg-btn-primary" : "kg-btn-secondary"}`}
            >
              {h.label}
            </button>
          ))}
          <select className="kg-input ml-auto !w-auto" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="all">All platforms</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {canExport ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="kg-btn kg-btn-secondary"
                disabled={computing}
                onClick={() =>
                  downloadText(
                    `forecast-${horizon}.csv`,
                    toCsv(
                      ["Date", "Revenue", "Cash", "Online", "Orders", "Expenses", "Profit", "Factors"],
                      forecast.series.map((d) => [
                        d.date,
                        d.forecastRevenue,
                        d.forecastCash,
                        d.forecastOnline,
                        d.forecastOrders,
                        d.forecastExpenses,
                        d.forecastProfit,
                        d.factors.join("; ")
                      ])
                    )
                  )
                }
              >
                CSV
              </button>
              <button
                type="button"
                className="kg-btn kg-btn-secondary"
                disabled={computing}
                onClick={() =>
                  printReport(
                    `AI Sales Forecast · ${horizon}`,
                    `<h2>${forecast.from} → ${forecast.to}</h2>
                     <p>Revenue ${inr(forecast.expectedRevenue)} · Cash ${inr(forecast.expectedCash)} · Online ${inr(forecast.expectedOnline)}</p>
                     <p>Orders ${forecast.expectedOrders} · Expenses ${inr(forecast.expectedExpenses)} · Profit ${inr(forecast.expectedProfit)}</p>`
                  )
                }
              >
                PDF
              </button>
            </div>
          ) : null}
        </div>
      </Card>

      {loading || computing ? <ContentLoading variant="block" label="Computing forecast" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Forecast revenue" value={inr(forecast.expectedRevenue)} />
        <Kpi label="Forecast cash" value={inr(forecast.expectedCash)} />
        <Kpi label="Forecast online" value={inr(forecast.expectedOnline)} />
        <Kpi label="Forecast orders" value={String(forecast.expectedOrders)} />
        <Kpi
          label="Forecast profit"
          value={inr(forecast.expectedProfit)}
          tone={forecast.expectedProfit >= 0 ? "good" : "bad"}
        />
        <Kpi label="Forecast expenses" value={inr(forecast.expectedExpenses)} />
        <Kpi
          label="Growth %"
          value={`${forecast.growthPct > 0 ? "+" : ""}${forecast.growthPct}%`}
          tone={forecast.growthPct >= 0 ? "good" : "bad"}
        />
        <Kpi
          label="Confidence"
          value={`${forecast.confidence} · ${forecast.confidenceScore}`}
          tone={forecast.confidence === "high" ? "good" : forecast.confidence === "low" ? "bad" : "neutral"}
        />
        <Kpi
          label="Risk"
          value={forecast.risk}
          tone={forecast.risk === "low" ? "good" : forecast.risk === "high" ? "bad" : "neutral"}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Expected customers" value={String(forecast.expectedCustomers)} />
        <MiniStat label="Avg bill (AOV)" value={inr(forecast.expectedAov)} />
        <MiniStat label="Expected food cost" value={`${inr(forecast.expectedFoodCost)} (${forecast.foodCostPct}%)`} />
        <MiniStat
          label="Model accuracy"
          value={accuracyAvg != null ? `${accuracyAvg.toFixed(0)}%` : "Learning…"}
          tone="good"
        />
      </div>

      {!chartsReady ? (
        <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading charts">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Prediction line (revenue)">
            <ChartBox height={220}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartSeries}>
                  <defs>
                    <linearGradient id="fcRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E56B2C" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#E56B2C" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EE" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} hide={chartSeries.length > 20} />
                  <YAxis tick={{ fontSize: 11 }} width={56} />
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Area
                    type="monotone"
                    dataKey="forecastRevenue"
                    stroke="#E56B2C"
                    fill="url(#fcRev)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartBox>
          </ChartCard>

          <ChartCard title="Actual vs forecast">
            <ChartBox height={220}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartBacktest}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EE" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={56} />
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="actual" stroke="#9A3F24" strokeWidth={2} dot={false} isAnimationActive={false} name="Actual" />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke="#E56B2C"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                    name="Forecast"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartBox>
          </ChartCard>

          {showExtraCharts ? (
            <>
              <ChartCard title="Order forecast">
                <ChartBox height={200}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartSeries.slice(0, 31)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EE" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} hide={chartSeries.length > 14} />
                      <YAxis tick={{ fontSize: 11 }} width={40} />
                      <Tooltip />
                      <Bar dataKey="forecastOrders" fill="#CF5A1F" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartBox>
              </ChartCard>

              <ChartCard title="Profit forecast">
                <ChartBox height={200}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EE" />
                      <XAxis dataKey="date" hide={chartSeries.length > 20} tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={56} />
                      <Tooltip formatter={(v: number) => inr(v)} />
                      <Area
                        type="monotone"
                        dataKey="forecastProfit"
                        stroke="#059669"
                        fill="#05966933"
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartBox>
              </ChartCard>

              <ChartCard title="Weekly trend">
                <ChartBox height={180}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyTrend}>
                      <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} width={56} />
                      <Tooltip formatter={(v: number) => inr(v)} />
                      <Bar dataKey="revenue" fill="#F2A65A" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartBox>
              </ChartCard>

              <ChartCard title="Monthly trend">
                <ChartBox height={180}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyTrend}>
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={56} />
                      <Tooltip formatter={(v: number) => inr(v)} />
                      <Line type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartBox>
              </ChartCard>
            </>
          ) : (
            <div className="lg:col-span-2">
              <button type="button" className="kg-btn kg-btn-secondary" onClick={() => setShowExtraCharts(true)}>
                Show more charts
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Risk analysis">
          <p className={`mb-2 text-[13px] font-bold uppercase ${riskColor}`}>{forecast.risk || "—"} risk</p>
          <ul className="space-y-2 text-[13px] text-text-secondary">
            {forecast.riskReasons.map((r) => (
              <li key={r} className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2">
                {r}
              </li>
            ))}
            {!forecast.riskReasons.length ? <li className="text-text-muted">No risk flags yet.</li> : null}
          </ul>
        </Panel>
        <Panel title="AI insights">
          <ul className="space-y-2 text-[13px] text-text-secondary">
            {forecast.insights.map((r) => (
              <li key={r} className="rounded-lg border border-stroke-0 bg-primary-light/80 px-3 py-2">
                {r}
              </li>
            ))}
            {!forecast.insights.length ? <li className="text-text-muted">Insights appear after history loads.</li> : null}
          </ul>
        </Panel>
        <Panel title="Recommendations">
          <ul className="space-y-2 text-[13px] text-text-secondary">
            {forecast.recommendations.map((r) => (
              <li key={r} className="rounded-lg border border-success/20 bg-success-bg px-3 py-2">
                {r}
              </li>
            ))}
            {!forecast.recommendations.length ? (
              <li className="text-text-muted">Recommendations appear after history loads.</li>
            ) : null}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Comparison · accuracy">
          {!forecast.actualVsForecast?.length ? (
            <p className="text-[13px] text-text-muted">Not enough history for comparison yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-stroke-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                    <th className="py-2">Date</th>
                    <th>Actual</th>
                    <th>Forecast</th>
                    <th>Diff</th>
                    <th>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.actualVsForecast.slice(-10).map((r) => {
                    const diff = r.actual - r.forecast;
                    const acc = r.forecast ? Math.max(0, 100 - Math.abs(r.errorPct)) : 0;
                    return (
                      <tr key={r.date} className="border-b border-stroke-0">
                        <td className="py-2 font-medium">{r.date}</td>
                        <td>{inr(r.actual)}</td>
                        <td>{inr(r.forecast)}</td>
                        <td className={diff >= 0 ? "text-success" : "text-danger"}>
                          {diff >= 0 ? "+" : ""}
                          {inr(diff)}
                        </td>
                        <td>{acc.toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Recent snapshots">
          {!snapshots.length ? (
            <p className="text-[13px] text-text-muted">No snapshots yet. Save one to archive predictions.</p>
          ) : (
            <ul className="space-y-2 text-[13px]">
              {snapshots.slice(0, 8).map((s) => (
                <li
                  key={s.id}
                  className="flex justify-between rounded-lg border border-warning/20 bg-warning-bg px-3 py-2"
                >
                  <span className="font-semibold capitalize">{s.horizon}</span>
                  <span>{inr(Number(s.expectedRevenue) || 0)}</span>
                  <span className="text-text-muted">conf {s.confidenceScore ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  return <KpiCard title={label} value={value} tone={tone} />;
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  return <KpiCard title={label} value={value} tone={tone} />;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card hover={false}>
      <SectionTitle title={title} />
      {children}
    </Card>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card hover={false}>
      <SectionTitle title={title} />
      {children}
    </Card>
  );
}
