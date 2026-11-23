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
import { PageHeader } from "@/components/ui/PageHeader";

import { ContentLoading } from "@/components/ui/Loading";

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
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/orders" className="text-xs font-semibold text-primary"> ← Orders </Link>}
        title="Live order board"
        actions={
          <>
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              className="kg-input !pl-8 pr-3"
              placeholder="Order / customer / table / platform ID"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              aria-label="Search orders"
            />
          </div>
          <select
            className="kg-input !w-auto"
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
            className="kg-input !w-auto"
            value={filters.payment}
            onChange={(e) => setFilters({ ...filters, payment: e.target.value })}
          >
            <option value="all">Payment</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
          </>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div> : null}
      {loading ? <ContentLoading variant="table" label="Loading" /> : null}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {BOARD_COLUMNS.map((col) => (
          <div
            key={col.id}
            className="min-w-[260px] flex-1 rounded-[var(--radius-xl)] border border-stroke-0 bg-bg-1 p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId) void moveTo(dragId, col.id);
            }}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="text-xs font-bold uppercase tracking-wide text-text-secondary">{col.label}</div>
              <div className="rounded-md bg-card-0 px-2 py-0.5 text-[11px] font-bold text-text-muted">
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
                    "cursor-grab rounded-lg border bg-card-0 p-3 shadow-panel active:cursor-grabbing",
                    o.delayed ? "border-primary/40 ring-1 ring-primary/30" : "border-stroke-0",
                    o.priority === "vip" || o.priority === "express" ? "border-l-4 border-l-primary" : ""
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/orders/${o.id}`} className="text-[13px] font-bold text-text-primary hover:underline">
                      {o.invoiceNo || o.id.slice(0, 7)}
                    </Link>
                    <span className="text-[10px] font-bold uppercase text-text-muted">{o.ageMin}m</span>
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {ORDER_TYPE_LABELS[o.orderType] || o.orderType}
                    {o.platformOrderId ? ` · #${o.platformOrderId}` : ""}
                  </div>
                  <div className="mt-1 truncate text-xs font-semibold text-text-primary">
                    {o.tableName || o.customerName || "Walk-in"}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>{o.itemCount} items</span>
                    <span className="font-bold">{inr(o.total)}</span>
                  </div>
                  {o.chefName ? <div className="mt-1 text-[11px] text-text-muted">Chef: {o.chefName}</div> : null}
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
