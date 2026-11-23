import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { inr } from "@/lib/utils";
import { useLiveOrders, type LiveOrder } from "../hooks/useLiveOrders";
import { BOARD_COLUMNS, ORDER_TYPE_LABELS } from "../engine/statusMachine";
import { updateOrderStatus } from "../services/orderEngine";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { OrderStatus } from "@/features/pos/types";
import { clsx } from "clsx";

export function OrderBoardPage() {
  const { role } = usePosAuth();
  const { orders, filters, setFilters, loading, error } = useLiveOrders();
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const columns = useMemo(() => {
    const map: Record<string, LiveOrder[]> = {};
    BOARD_COLUMNS.forEach((c) => (map[c.id] = []));
    orders.forEach((o) => {
      const key = normalizeBoardStatus(String(o.status || "pending"));
      if (!map[key]) map[key] = [];
      map[key].push(o);
    });
    return map;
  }, [orders]);

  async function moveTo(orderId: string, status: OrderStatus) {
    try {
      setBusy(true);
      await updateOrderStatus({ orderId, toStatus: status, role });
      setMsg(`Moved to ${status}`);
    } catch (e: any) {
      setMsg(e?.message || "Update failed");
    } finally {
      setBusy(false);
      setDragId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/orders" className="text-xs font-semibold text-cyan-700">
            ← Orders
          </Link>
          <h1 className="text-xl font-black text-slate-900">Live order board</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm"
              placeholder="Order / customer / table / platform ID"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={filters.orderType}
            onChange={(e) => setFilters({ ...filters, orderType: e.target.value })}
          >
            <option value="all">All types</option>
            {Object.entries(ORDER_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={filters.payment}
            onChange={(e) => setFilters({ ...filters, payment: e.target.value })}
          >
            <option value="all">Payment</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
      </div>

      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}
      {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {loading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200/60" /> : null}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {BOARD_COLUMNS.map((col) => (
          <div
            key={col.id}
            className="min-w-[260px] flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId) void moveTo(dragId, col.id);
            }}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-600">{col.label}</div>
              <div className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500">
                {(columns[col.id] || []).length}
              </div>
            </div>
            <div className="space-y-2">
              {(columns[col.id] || []).map((o) => (
                <article
                  key={o.id}
                  draggable={!busy}
                  onDragStart={() => setDragId(o.id)}
                  className={clsx(
                    "cursor-grab rounded-xl border bg-white p-3 shadow-sm active:cursor-grabbing",
                    o.delayed ? "border-orange-300 ring-1 ring-orange-200" : "border-slate-200",
                    o.priority === "vip" || o.priority === "express" ? "border-l-4 border-l-cyan-500" : ""
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/orders/${o.id}`} className="text-sm font-bold text-slate-900 hover:underline">
                      {o.invoiceNo || o.id.slice(0, 7)}
                    </Link>
                    <span className="text-[10px] font-bold uppercase text-slate-500">{o.ageMin}m</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {ORDER_TYPE_LABELS[o.orderType] || o.orderType}
                    {o.platformOrderId ? ` · #${o.platformOrderId}` : ""}
                  </div>
                  <div className="mt-1 truncate text-xs font-semibold text-slate-800">
                    {o.tableName || o.customerName || "Walk-in"}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>{o.itemCount} items</span>
                    <span className="font-bold">{inr(o.total)}</span>
                  </div>
                  {o.chefName ? <div className="mt-1 text-[11px] text-slate-500">Chef: {o.chefName}</div> : null}
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeBoardStatus(status: string): OrderStatus {
  if (status === "cooking" || status === "confirmed") return "preparing";
  if (status === "packed" || status === "waiting_pickup") return "ready";
  if (status === "delivered" || status === "out_for_delivery") return "served";
  if (status === "rejected") return "cancelled";
  if (status === "held" || status === "draft") return "pending";
  if (BOARD_COLUMNS.some((c) => c.id === status)) return status as OrderStatus;
  return "pending";
}
