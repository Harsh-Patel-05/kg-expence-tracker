import { startTransition, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
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
import { runSalesForecast, type ForecastHorizon, type OrderLike } from "../utils/forecastEngine";
import { loadAccuracyBias, saveForecastSnapshot } from "../services/forecastService";

const HORIZONS: Array<{ id: ForecastHorizon; label: string }> = [
  { id: "tomorrow", label: "Tomorrow" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "month", label: "Next Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" }
];

/** Keep chart payloads small so Recharts does not freeze the tab. */
function downsample<T>(rows: T[], maxPoints = 42): T[] {
  if (rows.length <= maxPoints) return rows;
  const step = Math.ceil(rows.length / maxPoints);
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += step) out.push(rows[i]);
  const last = rows[rows.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function ForecastDashboardPage() {
  const { role } = usePosAuth();
  const canAccess = canAccessReports(role);
  const canExport = canExportReports(role);
  const canSnapshot = true; // admin full access

  const [horizon, setHorizon] = useState<ForecastHorizon>("7d");
  const [channel, setChannel] = useState("all");
  const [bias, setBias] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);

  // Cap listeners — full restaurant dumps freeze the UI on open
  const { data: sales, loading } = useRestaurantCollection<SaleLike>({ path: "sales", max: 400 });
  const { data: expenses } = useRestaurantCollection<ExpenseDoc>({ path: "expenses", max: 300 });
  const { data: purchases } = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases", max: 300 });
  const { data: inventory } = useRestaurantCollection<InventoryItemDoc>({ path: "inventory", max: 200 });
  const { data: orders } = useRestaurantCollection<OrderLike>({ path: "orders", max: 400 });
  const { data: accuracy } = useRestaurantCollection<{
    date?: string;
    horizon?: string;
    forecast?: number;
    actual?: number;
    errorPct?: number;
  }>({ path: "forecastAccuracy", max: 60 });
  const { data: snapshots } = useRestaurantCollection<{
    horizon?: string;
    expectedRevenue?: number;
    confidenceScore?: number;
    createdAt?: unknown;
  }>({ path: "forecastSnapshots", max: 20 });

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

  // Mount charts after first paint so navigation stays responsive
  useEffect(() => {
    const id = window.setTimeout(() => setChartsReady(true), 120);
    return () => window.clearTimeout(id);
  }, []);

  const filteredOrders = useMemo(() => {
    if (channel === "all") return orders;
    return orders.filter((o) => String(o.channel || "").toLowerCase() === channel);
  }, [orders, channel]);

  const channels = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      const c = String(o.channel || "").trim();
      if (c) set.add(c.toLowerCase());
    }
    return [...set].sort();
  }, [orders]);

  const forecast = useMemo(
    () =>
      runSalesForecast({
        sales,
        orders: filteredOrders,
        expenses,
        purchases,
        inventory,
        horizon,
        accuracyBias: bias
      }),
    [sales, filteredOrders, expenses, purchases, inventory, horizon, bias]
  );

  const chartSeries = useMemo(() => downsample(forecast.series, 45), [forecast.series]);
  const chartBacktest = useMemo(() => downsample(forecast.actualVsForecast || [], 20), [forecast.actualVsForecast]);

  const weeklyTrend = useMemo(() => {
    const map = new Map<string, number>();
    forecast.history.forEach((p) => {
      const d = new Date(p.date + "T00:00:00");
      const key = `W${Math.ceil(d.getDate() / 7)}-${d.toLocaleString("en", { month: "short" })}`;
      map.set(key, (map.get(key) || 0) + p.revenue);
    });
    return [...map.entries()].map(([week, revenue]) => ({ week, revenue }));
  }, [forecast.history]);

  const monthlyTrend = useMemo(() => {
    const map = new Map<string, number>();
    forecast.history.forEach((p) => {
      const key = p.date.slice(0, 7);
      map.set(key, (map.get(key) || 0) + p.revenue);
    });
    return [...map.entries()].map(([month, revenue]) => ({ month, revenue }));
  }, [forecast.history]);

  const accuracyAvg = useMemo(() => {
    if (!accuracy.length) return null;
    const errs = accuracy.map((a) => Math.abs(Number(a.errorPct) || 0));
    const mae = errs.reduce((s, x) => s + x, 0) / errs.length;
    return Math.max(0, 100 - mae);
  }, [accuracy]);

  if (!canAccess) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700">
        No access to AI Sales Forecast for this role
      </div>
    );
  }

  const confColor =
    forecast.confidence === "high" ? "text-emerald-700" : forecast.confidence === "medium" ? "text-amber-700" : "text-rose-700";
  const riskColor =
    forecast.risk === "low" ? "text-emerald-700" : forecast.risk === "medium" ? "text-amber-700" : "text-rose-700";

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-indigo-200/60 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-indigo-100">AI Sales Forecast</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Enterprise Forecast Engine</h1>
            <p className="mt-1 text-sm text-indigo-100">
              {forecast.from} → {forecast.to} · bias ×{bias.toFixed(3)} · {forecast.model.sampleDays} history days
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/analytics" className="rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold backdrop-blur hover:bg-white/25">
              Analytics
            </Link>
            <Link to="/reports" className="rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold backdrop-blur hover:bg-white/25">
              Reports
            </Link>
            {canSnapshot ? (
              <button
                disabled={saving}
                className="rounded-xl bg-amber-400 px-3 py-2 text-sm font-bold text-slate-900 shadow disabled:opacity-60"
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
            ) : null}
          </div>
        </div>
      </div>

      {msg ? <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">{msg}</div> : null}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {HORIZONS.map((h) => (
          <button
            key={h.id}
            onClick={() => startTransition(() => setHorizon(h.id))}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              horizon === h.id
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {h.label}
          </button>
        ))}
        <select
          className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
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
              className="rounded-lg bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-800"
              onClick={() =>
                downloadText(
                  `forecast-${horizon}.csv`,
                  toCsv(
                    ["Date", "Forecast revenue", "Orders", "Profit", "Factors"],
                    forecast.series.map((d) => [d.date, d.forecastRevenue, d.forecastOrders, d.forecastProfit, d.factors.join("; ")])
                  )
                )
              }
            >
              CSV
            </button>
            <button
              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800"
              onClick={() =>
                downloadText(
                  `forecast-${horizon}.xls`,
                  toCsv(
                    ["Metric", "Value"],
                    [
                      ["Revenue", forecast.expectedRevenue],
                      ["Orders", forecast.expectedOrders],
                      ["Profit", forecast.expectedProfit],
                      ["Customers", forecast.expectedCustomers],
                      ["AOV", forecast.expectedAov],
                      ["Food cost", forecast.expectedFoodCost],
                      ["Growth %", forecast.growthPct],
                      ["Confidence", forecast.confidenceScore],
                      ["Risk", forecast.risk]
                    ]
                  ),
                  "application/vnd.ms-excel;charset=utf-8"
                )
              }
            >
              Excel
            </button>
            <button
              className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800"
              onClick={() =>
                printReport(
                  `AI Sales Forecast · ${horizon}`,
                  `<h2>${forecast.from} → ${forecast.to}</h2>
                   <p>Revenue ${inr(forecast.expectedRevenue)} · Orders ${forecast.expectedOrders} · Profit ${inr(forecast.expectedProfit)}</p>`
                )
              }
            >
              PDF
            </button>
          </div>
        ) : null}
      </div>

      {loading ? <div className="h-24 animate-pulse rounded-2xl bg-gradient-to-r from-indigo-100 via-violet-100 to-fuchsia-100" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Forecast revenue" value={inr(forecast.expectedRevenue)} tone="indigo" />
        <Kpi label="Forecast orders" value={String(forecast.expectedOrders)} tone="violet" />
        <Kpi label="Forecast profit" value={inr(forecast.expectedProfit)} tone="emerald" />
        <Kpi label="Growth %" value={`${forecast.growthPct > 0 ? "+" : ""}${forecast.growthPct}%`} tone="amber" />
        <Kpi label="Confidence" value={`${forecast.confidence} · ${forecast.confidenceScore}`} tone="sky" className={confColor} />
        <Kpi label="Risk" value={forecast.risk} tone="rose" className={riskColor} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Expected customers" value={String(forecast.expectedCustomers)} color="bg-fuchsia-50 border-fuchsia-200" />
        <MiniStat label="Avg bill (AOV)" value={inr(forecast.expectedAov)} color="bg-cyan-50 border-cyan-200" />
        <MiniStat label="Expected food cost" value={`${inr(forecast.expectedFoodCost)} (${forecast.foodCostPct}%)`} color="bg-orange-50 border-orange-200" />
        <MiniStat label="Model accuracy" value={accuracyAvg != null ? `${accuracyAvg.toFixed(0)}%` : "Learning…"} color="bg-lime-50 border-lime-200" />
      </div>

      {!chartsReady ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Prediction line (revenue)" accent="border-l-4 border-l-indigo-500">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartSeries}>
                <defs>
                  <linearGradient id="fcRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} hide={chartSeries.length > 20} />
                <YAxis tick={{ fontSize: 11 }} width={56} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Area type="monotone" dataKey="forecastRevenue" stroke="#4f46e5" fill="url(#fcRev)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Actual vs forecast" accent="border-l-4 border-l-fuchsia-500">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartBacktest}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={56} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Legend />
                <Line type="monotone" dataKey="actual" stroke="#db2777" strokeWidth={2} dot={false} isAnimationActive={false} name="Actual" />
                <Line type="monotone" dataKey="forecast" stroke="#6366f1" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} name="Forecast" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Order forecast" accent="border-l-4 border-l-violet-500">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartSeries.slice(0, 31)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} hide={chartSeries.length > 14} />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip />
                <Bar dataKey="forecastOrders" fill="#8b5cf6" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Profit forecast" accent="border-l-4 border-l-emerald-500">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" hide={chartSeries.length > 20} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={56} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Area type="monotone" dataKey="forecastProfit" stroke="#059669" fill="#10b98144" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Weekly trend" accent="border-l-4 border-l-amber-500">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyTrend}>
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} width={56} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Bar dataKey="revenue" fill="#f59e0b" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Monthly trend" accent="border-l-4 border-l-sky-500">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyTrend}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={56} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Line type="monotone" dataKey="revenue" stroke="#0284c7" strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Risk analysis" tone="rose">
          <p className={`mb-2 text-sm font-bold uppercase ${riskColor}`}>{forecast.risk} risk</p>
          <ul className="space-y-2 text-sm text-slate-700">
            {forecast.riskReasons.map((r) => (
              <li key={r} className="rounded-xl border border-rose-100 bg-rose-50/80 px-3 py-2">
                {r}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="AI insights" tone="indigo">
          <ul className="space-y-2 text-sm text-slate-700">
            {forecast.insights.map((r) => (
              <li key={r} className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2">
                {r}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Recommendations" tone="emerald">
          <ul className="space-y-2 text-sm text-slate-700">
            {forecast.recommendations.map((r) => (
              <li key={r} className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2">
                {r}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Comparison · accuracy" tone="violet">
          {!forecast.actualVsForecast?.length ? (
            <p className="text-sm text-slate-500">Not enough history for comparison yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-slate-500">
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
                      <tr key={r.date} className="border-b border-slate-100">
                        <td className="py-2 font-medium">{r.date}</td>
                        <td>{inr(r.actual)}</td>
                        <td>{inr(r.forecast)}</td>
                        <td className={diff >= 0 ? "text-emerald-600" : "text-rose-600"}>
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
        <Panel title="Recent snapshots" tone="amber">
          {!snapshots.length ? (
            <p className="text-sm text-slate-500">No snapshots yet. Save one to archive predictions.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {snapshots.slice(0, 8).map((s) => (
                <li key={s.id} className="flex justify-between rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
                  <span className="font-semibold capitalize">{s.horizon}</span>
                  <span>{inr(Number(s.expectedRevenue) || 0)}</span>
                  <span className="text-slate-500">conf {s.confidenceScore ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  indigo: "from-indigo-500/25 via-indigo-100 to-white border-indigo-200",
  violet: "from-violet-500/25 via-violet-100 to-white border-violet-200",
  emerald: "from-emerald-500/25 via-emerald-100 to-white border-emerald-200",
  amber: "from-amber-500/30 via-amber-100 to-white border-amber-200",
  sky: "from-sky-500/25 via-sky-100 to-white border-sky-200",
  rose: "from-rose-500/25 via-rose-100 to-white border-rose-200"
};

function Kpi({ label, value, tone, className }: { label: string; value: string; tone: string; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border bg-gradient-to-br p-4 shadow-sm ${TONES[tone] || TONES.indigo}`}
    >
      <div className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}</div>
      <div className={`mt-1 text-xl font-black tracking-tight text-slate-900 ${className || ""}`}>{value}</div>
    </motion.div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${color}`}>
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-0.5 text-base font-bold text-slate-900">{value}</div>
    </div>
  );
}

function ChartCard({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${accent || ""}`}>
      <div className="mb-3 text-sm font-bold text-slate-800">{title}</div>
      {children}
    </div>
  );
}

function Panel({ title, children, tone }: { title: string; children: React.ReactNode; tone?: string }) {
  const bar =
    tone === "rose"
      ? "border-t-rose-400"
      : tone === "indigo"
        ? "border-t-indigo-400"
        : tone === "emerald"
          ? "border-t-emerald-400"
          : tone === "violet"
            ? "border-t-violet-400"
            : tone === "amber"
              ? "border-t-amber-400"
              : "border-t-slate-300";
  return (
    <div className={`rounded-2xl border border-slate-200 border-t-4 bg-white p-4 shadow-sm ${bar}`}>
      <div className="mb-3 text-sm font-bold text-slate-800">{title}</div>
      {children}
    </div>
  );
}
