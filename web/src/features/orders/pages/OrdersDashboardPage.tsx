import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChefHat, ClipboardList, MonitorSmartphone } from "lucide-react";
import { inr } from "@/lib/utils";
import { useLiveOrders } from "../hooks/useLiveOrders";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { canAccessOrders } from "@/features/pos/utils/permissions";

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${tone || ""}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
    </motion.div>
  );
}

export function OrdersDashboardPage() {
  const { role, loading: authLoading } = usePosAuth();
  const { stats, loading, error, allOrders } = useLiveOrders();

  if (authLoading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (!canAccessOrders(role)) {
    return <div className="p-6">Orders access denied for role: {role}</div>;
  }

  const recent = [...allOrders]
    .sort((a, b) => String(b.updatedAt || b.date || "").localeCompare(String(a.updatedAt || a.date || "")))
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order management</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Live operations</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/orders/board" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            <ClipboardList size={16} /> Live board
          </Link>
          <Link to="/kds" className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white">
            <MonitorSmartphone size={16} /> Kitchen display
          </Link>
          <Link to="/pos" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            <ChefHat size={16} /> POS
          </Link>
        </div>
      </div>

      {loading ? <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" /> : null}
      {error ? <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <Stat label="Live orders" value={stats.live} />
        <Stat label="Preparing" value={stats.preparing} tone="bg-amber-50/50" />
        <Stat label="Ready" value={stats.ready} tone="bg-emerald-50/50" />
        <Stat label="Served" value={stats.served} />
        <Stat label="Completed" value={stats.completed} />
        <Stat label="Cancelled" value={stats.cancelled} tone="bg-rose-50/40" />
        <Stat label="Refunded" value={stats.refunded} />
        <Stat label="Delayed" value={stats.delayed} tone="bg-orange-50/60" />
        <Stat label="Priority" value={stats.priority} />
        <Stat label="Scheduled upcoming" value={stats.scheduled} />
        <Stat label="Pending payments" value={stats.pendingPay} />
        <Stat label="Today's revenue" value={inr(stats.revenue)} />
        <Stat label="Today's orders" value={stats.ordersToday} />
        <Stat label="Avg prep (min)" value={stats.avgPrep.toFixed(1)} />
        <Stat label="Avg delivery (min)" value={stats.avgDelivery.toFixed(1)} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-bold">Recent orders</div>
        <div className="divide-y divide-slate-100">
          {recent.map((o) => (
            <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {o.invoiceNo || o.id.slice(0, 8)} · {o.customerName || o.tableName || "—"}
                </div>
                <div className="text-xs capitalize text-slate-500">
                  {o.orderType.replace(/_/g, " ")} · {o.status}
                  {o.delayed ? " · delayed" : ""}
                </div>
              </div>
              <div className="text-sm font-bold">{inr(o.total)}</div>
            </Link>
          ))}
          {!recent.length ? <div className="py-6 text-center text-sm text-slate-500">No orders yet — create from POS.</div> : null}
        </div>
      </div>
    </div>
  );
}
