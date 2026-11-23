import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { canAccessKds, canAssignChef } from "@/features/pos/utils/permissions";
import { filterByKitchenCategory, KDS_CATEGORIES, useLiveOrders, type LiveOrder } from "../hooks/useLiveOrders";
import { KDS_COLUMNS, ORDER_TYPE_LABELS } from "../engine/statusMachine";
import { assignChef, updateKitchenStatus, activateScheduledOrders } from "../services/orderEngine";
import type { KitchenStatus } from "@/features/pos/types";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { flushOfflineQueue } from "../services/channelOrders";

import { ContentLoading, PageLoading } from "@/components/ui/Loading";

export function KdsPage() {
  const { role, loading: authLoading } = usePosAuth();
  const { allOrders, loading, error } = useLiveOrders();
  const [category, setCategory] = useState("All");
  const [msg, setMsg] = useState<string | null>(null);
  const { data: staff } = useRestaurantCollection<{ name?: string }>({ path: "staff" });

  useEffect(() => {
    void activateScheduledOrders().catch(() => undefined);
    void flushOfflineQueue().catch(() => undefined);
    const t = window.setInterval(() => {
      void activateScheduledOrders().catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  const kitchenOrders = useMemo(() => {
    const active = allOrders.filter((o) =>
      ["pending", "confirmed", "accepted", "preparing", "cooking", "ready", "packed", "held"].includes(String(o.status))
    );
    return filterByKitchenCategory(active, category === "All" ? "all" : category);
  }, [allOrders, category]);

  const columns = useMemo(() => {
    const map: Record<string, LiveOrder[]> = {};
    KDS_COLUMNS.forEach((c) => (map[c.id] = []));
    kitchenOrders.forEach((o) => {
      const ks = normalizeKitchen(o);
      if (!map[ks]) map[ks] = [];
      map[ks].push(o);
    });
    return map;
  }, [kitchenOrders]);

  async function bump(order: LiveOrder, to: KitchenStatus) {
    try {
      await updateKitchenStatus({ orderId: order.id, toStatus: to, role });
      setMsg(`${order.invoiceNo || order.id.slice(0, 6)} → ${to}`);
    } catch (e: any) {
      setMsg(e?.message || "Update failed");
    }
  }

  if (authLoading) {
    return <PageLoading label="Loading kitchen…" />;
  }
  if (!canAccessKds(role)) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Order management" title="Kitchen Display" />
        <EmptyState
          title="Kitchen access denied"
          description={`Your role (${role}) cannot open the kitchen display.`}
          action={
            <Link to="/orders" className="kg-btn kg-btn-secondary">
              Back to orders
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Order management"
        title="Kitchen Display"
        description="Realtime · touch"
        actions={
          <>
            <Link to="/orders" className="kg-btn kg-btn-secondary">
              Orders
            </Link>
            <Link to="/pos" className="kg-btn kg-btn-secondary">
              POS
            </Link>
            {KDS_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={clsx("kg-btn capitalize", category === c ? "kg-btn-primary" : "kg-btn-secondary")}
              >
                {c}
              </button>
            ))}
          </>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div> : null}
      {loading ? <ContentLoading variant="block" label="Loading" /> : null}

      <div className="flex gap-3 overflow-x-auto">
        {KDS_COLUMNS.map((col) => (
          <div key={col.id} className="min-w-[280px] flex-1 rounded-[var(--radius-xl)] border border-stroke-0 bg-bg-1 p-2">
            <div className="mb-2 flex items-center justify-between px-2 py-1">
              <div className="text-xs font-bold uppercase tracking-wider text-text-muted">{col.label}</div>
              <div className="rounded-md bg-card-0 px-2 py-0.5 text-[11px] font-bold text-text-secondary ring-1 ring-stroke-0">
                {(columns[col.id] || []).length}
              </div>
            </div>
            <div className="space-y-2">
              {(columns[col.id] || []).map((o) => (
                <KdsCard
                  key={o.id}
                  order={o}
                  onBump={(to) => void bump(o, to)}
                  canAssign={canAssignChef(role)}
                  staff={staff}
                  onAssignChef={(name) => {
                    const id = staff.find((s) => s.name === name)?.id || name;
                    void assignChef({ orderId: o.id, chefId: String(id), chefName: name, role }).then(() =>
                      setMsg(`Chef ${name}`)
                    );
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeKitchen(o: LiveOrder): KitchenStatus {
  if (o.kitchenStatus && KDS_COLUMNS.some((c) => c.id === o.kitchenStatus)) return o.kitchenStatus as KitchenStatus;
  const s = String(o.status);
  if (s === "pending" || s === "confirmed" || s === "held") return "new";
  if (s === "accepted") return "accepted";
  if (s === "preparing") return "preparing";
  if (s === "cooking") return "cooking";
  if (s === "ready") return "ready";
  if (s === "packed") return "packed";
  return "new";
}

function KdsCard(props: {
  order: LiveOrder;
  onBump: (to: KitchenStatus) => void;
  canAssign: boolean;
  staff: Array<{ id: string; name?: string }>;
  onAssignChef: (name: string) => void;
}) {
  const o = props.order;
  const next = nextKitchenAction(normalizeKitchen(o));
  return (
    <article
      className={clsx(
        "rounded-[var(--radius-xl)] border p-3 shadow-panel",
        o.delayed ? "border-danger/40 bg-danger-bg" : "border-stroke-0 bg-card-0",
        o.priority === "vip" || o.priority === "express" ? "ring-1 ring-primary/50" : ""
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-bold text-text-primary">{o.invoiceNo || o.id.slice(0, 7)}</div>
          <div className="text-xs text-text-muted">
            {ORDER_TYPE_LABELS[o.orderType] || o.orderType}
            {o.tableName ? ` · ${o.tableName}` : ""}
            {o.customerName ? ` · ${o.customerName}` : ""}
          </div>
        </div>
        <div className={clsx("rounded-lg px-2 py-1 text-[13px] font-bold", o.ageMin > o.eta ? "bg-danger text-white" : "bg-bg-1 text-text-secondary")}>
          {o.ageMin}m
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {(o.items || []).map((l) => (
          <li key={l.lineId} className="text-[13px]">
            <span className="font-bold">
              {l.qty}× {l.name}
            </span>
            {(l.kitchenNote || l.note || l.specialInstructions) && (
              <div className="text-xs font-semibold text-warning">{l.kitchenNote || l.note || l.specialInstructions}</div>
            )}
          </li>
        ))}
      </ul>

      {o.kitchenNote ? <div className="mt-2 rounded-lg bg-bg-1 px-2 py-1 text-xs text-text-secondary">{o.kitchenNote}</div> : null}
      {o.chefName ? <div className="mt-2 text-[11px] text-text-muted">Chef: {o.chefName}</div> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {next ? (
          <button
            type="button"
            className="kg-btn kg-btn-primary min-h-11 flex-1"
            onClick={() => props.onBump(next)}
          >
            Mark {next}
          </button>
        ) : null}
        {props.canAssign && !o.chefName ? (
          <select
            className="kg-input min-h-11 !w-auto"
            defaultValue=""
            onChange={(e) => e.target.value && props.onAssignChef(e.target.value)}
          >
            <option value="">Chef</option>
            {props.staff.map((s) => (
              <option key={s.id} value={s.name || s.id}>
                {s.name || s.id}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </article>
  );
}

function nextKitchenAction(current: KitchenStatus): KitchenStatus | null {
  const flow: KitchenStatus[] = ["new", "accepted", "preparing", "cooking", "ready", "packed"];
  const i = flow.indexOf(current);
  if (i < 0 || i >= flow.length - 1) return current === "new" ? "accepted" : null;
  return flow[i + 1];
}
