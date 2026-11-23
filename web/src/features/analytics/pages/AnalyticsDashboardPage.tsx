import { useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { ExpenseDoc } from "@/features/tasks/types";
import type { InventoryItemDoc, PurchaseEntryDoc, WastageDoc } from "@/features/inventory/types";
import type { SaleLike } from "@/features/reports/utils/reportEngine";
import { downloadText, toCsv, printReport, wastageReport } from "@/features/reports/utils/reportEngine";
import { canAccessReports, canExportReports } from "@/features/suppliers/utils/permissions";
import type { DatePreset } from "../types";
import { resolveDatePreset } from "../utils/datePresets";
import { buildAnalytics, slowMovingItems } from "../utils/analyticsEngine";
import { writeDashboardMetrics } from "../services/snapshotService";
import { runInventoryAlertScan } from "@/features/notifications/services/notificationEngine";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

import { ContentLoading } from "@/components/ui/Loading";

const COLORS = ["#9A3F24", "#E56B2C", "#6B7280", "#F2A65A", "#059669", "#DC2626", "#CF5A1F"];

const PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "7D" },
  { id: "last30", label: "30D" },
  { id: "thisMonth", label: "Month" },
  { id: "lastMonth", label: "Last Mo" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
  { id: "custom", label: "Custom" }
];

export function AnalyticsDashboardPage() {
  const { role } = usePosAuth();
  const canAccess = canAccessReports(role);
  const canExport = canExportReports(role);

  const [preset, setPreset] = useState<DatePreset>("last30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [supplier, setSupplier] = useState("all");
  const [drill, setDrill] = useState<{ title: string; rows: Array<Record<string, string | number>> } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  const range = resolveDatePreset(preset, { from: customFrom, to: customTo });

  const { data: sales, loading } = useRestaurantCollection<SaleLike>({ path: "sales" });
  const { data: expenses } = useRestaurantCollection<ExpenseDoc>({ path: "expenses" });
  const { data: purchases } = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases" });
  const { data: inventory } = useRestaurantCollection<InventoryItemDoc>({ path: "inventory" });
  const { data: wastage } = useRestaurantCollection<WastageDoc>({ path: "wastage" });
  const { data: orders } = useRestaurantCollection<{ date?: string; total?: number; grandTotal?: number; status?: string }>({ path: "orders" });
  const { data: suppliers } = useRestaurantCollection<{ name?: string }>({ path: "suppliers" });

  useEffect(() => {
    if (scanned || !inventory.length) return;
    runInventoryAlertScan(inventory as any)
      .catch(() => null)
      .finally(() => setScanned(true));
  }, [inventory, scanned]);

  const bundle = useMemo(
    () =>
      buildAnalytics({
        from: range.from,
        to: range.to,
        sales,
        expenses,
        purchases,
        inventory,
        wastage,
        orders,
        supplier
      }),
    [range.from, range.to, sales, expenses, purchases, inventory, wastage, orders, supplier]
  );

  const waste = useMemo(() => wastageReport(wastage, { from: range.from, to: range.to }), [wastage, range.from, range.to]);
  const slow = useMemo(() => slowMovingItems(inventory), [inventory]);

  if (!canAccess) {
    return <EmptyState title="No access to analytics" description="Your role cannot open this module." />;
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Business intelligence"
        title="Analytics"
        actions={
          <>
          <Link to="/forecast" className="kg-btn kg-btn-secondary">
            AI Forecast
          </Link>
          <Link to="/reports" className="kg-btn kg-btn-secondary">
            Reports
          </Link>
          <Link to="/notifications" className="kg-btn kg-btn-secondary">
            Notifications
          </Link>
          <button
            className="kg-btn kg-btn-primary"
            onClick={async () => {
              await writeDashboardMetrics(bundle, preset === "year" ? "year" : preset === "thisMonth" || preset === "lastMonth" ? "month" : "day");
              setMsg("Dashboard snapshot saved");
            }}
          >
            Save snapshot
          </button>
          </>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <Card hover={false} className="!p-3"><div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`kg-btn ${preset === p.id ? "kg-btn-primary" : "kg-btn-secondary"}`}
          >
            {p.label}
          </button>
        ))}
        {preset === "custom" ? (
          <>
            <input type="date" className="kg-input !w-auto" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <input type="date" className="kg-input !w-auto" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </>
        ) : null}
        <select className="kg-input ml-auto !w-auto" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
          <option value="all">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.name || ""}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="text-xs font-semibold text-text-muted self-center">
          {range.label}: {range.from} → {range.to}
        </div>
      </div></Card>

      {loading ? <ContentLoading variant="block" label="Loading" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {bundle.kpis.map((k) => (
          <KpiCard
            key={k.id}
            label={k.label}
            value={k.format === "inr" ? inr(k.value) : k.format === "pct" ? `${k.value.toFixed(1)}%` : String(Math.round(k.value))}
            change={k.change}
            spark={k.spark}
            onClick={() =>
              setDrill({
                title: k.label,
                rows: bundle.sales.daily.map((d) => ({ date: d.date, value: d.value }))
              })
            }
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue trend" onExport={canExport ? () => downloadText(`sales-${range.from}_${range.to}.csv`, toCsv(["Date", "Sales"], bundle.sales.daily.map((d) => [d.date, d.value]))) : undefined}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={bundle.sales.daily}
              onClick={(e: any) => {
                const p = e?.activePayload?.[0]?.payload;
                if (p) setDrill({ title: `Sales ${p.date}`, rows: [{ date: p.date, sales: p.value }] });
              }}
            >
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E56B2C" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#E56B2C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EE" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => inr(num(v))} />
              <Area type="monotone" dataKey="value" stroke="#E56B2C" fill="url(#salesFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cash vs online">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={[{ name: "Cash", value: bundle.sales.cash }, { name: "Online", value: bundle.sales.online }]}
              onClick={(e: any) => {
                const p = e?.activePayload?.[0]?.payload;
                if (p) setDrill({ title: p.name, rows: [{ mode: p.name, amount: p.value }] });
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EE" />
              <XAxis dataKey="name" />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => inr(num(v))} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                <Cell fill="#9A3F24" />
                <Cell fill="#E56B2C" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Expense categories">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={bundle.expenses.byCategory.slice(0, 8).map((c) => ({ name: c.category, value: c.total }))}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={95}
                onClick={(_: any, idx: number) => {
                  const row = bundle.expenses.byCategory[idx];
                  if (row) setDrill({ title: row.category, rows: [{ category: row.category, total: row.total }] });
                }}
              >
                {bundle.expenses.byCategory.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => inr(num(v))} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Profit vs expenses">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={[
                { name: "Sales", value: bundle.sales.total },
                { name: "Expenses", value: bundle.expenses.paid },
                { name: "COGS", value: bundle.profit.cogs },
                { name: "Net", value: bundle.profit.net }
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EE" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => inr(num(v))} />
              <Line type="monotone" dataKey="value" stroke="#9A3F24" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="sm" hover={false}>
          <SectionTitle title="Top revenue items" />
          {bundle.itemAnalytics.slice(0, 10).map((i) => (
            <button
              key={i.item}
              type="button"
              className="flex w-full items-center justify-between border-t border-stroke-0 py-2 text-left text-[13px] hover:bg-bg-1"
              onClick={() => setDrill({ title: i.item, rows: [{ item: i.item, qty: i.qty, revenue: i.revenue }] })}
            >
              <span className="font-semibold">{i.item}</span>
              <span>
                {i.qty} · {inr(i.revenue)}
              </span>
            </button>
          ))}
          {!bundle.itemAnalytics.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No item data in range." /> : null}
        </Card>
        <Card padding="sm" hover={false}>
          <SectionTitle title={`Slow / high stock · wastage ${inr(waste.cost)}`} />
          {slow.slice(0, 10).map((i) => (
            <div key={i.item} className="flex justify-between border-t border-stroke-0 py-2 text-[13px]">
              <span>{i.item}</span>
              <span className="font-semibold">
                {i.qty} · {inr(i.value)}
              </span>
            </div>
          ))}
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={!canExport}
          className="kg-btn kg-btn-primary disabled:opacity-40"
          onClick={() =>
            downloadText(
              `analytics-kpis-${range.from}.csv`,
              toCsv(
                ["KPI", "Value", "Change%"],
                bundle.kpis.map((k) => [k.label, k.value, k.change.toFixed(1)])
              )
            )
          }
        >
          Export CSV
        </button>
        <button
          disabled={!canExport}
          className="kg-btn kg-btn-secondary disabled:opacity-40"
          onClick={() =>
            printReport(
              "Analytics Snapshot",
              `<p>${range.from} → ${range.to}</p><p>Sales ${inr(bundle.sales.total)} · Profit ${inr(bundle.profit.net)} · Margin ${bundle.profit.margin.toFixed(1)}%</p>`
            )
          }
        >
          Print / PDF
        </button>
      </div>

      {drill ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-text-primary/40 p-4 sm:items-center" onClick={() => setDrill(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-[var(--radius-xl)] bg-card-0 p-4 shadow-float" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[14px] font-bold text-text-primary">{drill.title}</div>
              <button className="text-xs font-semibold text-text-muted" onClick={() => setDrill(null)}>
                Close
              </button>
            </div>
            <table className="w-full text-left text-[13px]">
              <thead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                <tr>
                  {Object.keys(drill.rows[0] || {}).map((k) => (
                    <th key={k} className="px-2 py-1">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drill.rows.map((r, i) => (
                  <tr key={i} className="border-t border-stroke-0">
                    {Object.values(r).map((v, j) => (
                      <td key={j} className="px-2 py-1">
                        {typeof v === "number" && v > 100 ? inr(v) : String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  change,
  spark,
  onClick
}: {
  label: string;
  value: string;
  change: number;
  spark: number[];
  onClick?: () => void;
}) {
  const up = change >= 0;
  const max = Math.max(...spark, 1);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 p-4 text-left text-text-primary shadow-panel hover:border-stroke-1"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">{label}</div>
      <div className="mt-1.5 text-[22px] font-bold tracking-tight text-text-primary tabular-nums">{value}</div>
      <div className={`mt-1 text-xs font-bold ${up ? "text-success" : "text-danger"}`}>
        {up ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% vs prior
      </div>
      <div className="mt-3 flex h-8 items-end gap-0.5">
        {spark.slice(-16).map((v, i) => (
          <div key={i} className="flex-1 rounded-sm bg-primary/70" style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />
        ))}
      </div>
    </motion.button>
  );
}

function ChartCard({ title, children, onExport }: { title: string; children: React.ReactNode; onExport?: () => void }) {
  return (
    <Card padding="sm" hover={false}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[14px] font-bold text-text-primary">{title}</div>
        {onExport ? (
          <button className="text-xs font-semibold text-primary" onClick={onExport}>
            Export
          </button>
        ) : null}
      </div>
      {children}
    </Card>
  );
}
