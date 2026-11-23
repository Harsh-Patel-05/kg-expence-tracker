import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { ArrowLeft } from "lucide-react";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { canAccessKds, canAssignChef } from "@/features/pos/utils/permissions";
import { filterByKitchenCategory, KDS_CATEGORIES, useLiveOrders, type LiveOrder } from "../hooks/useLiveOrders";
import { KDS_COLUMNS, ORDER_TYPE_LABELS } from "../engine/statusMachine";
import { assignChef, updateKitchenStatus, activateScheduledOrders } from "../services/orderEngine";
import type { KitchenStatus } from "@/features/pos/types";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { flushOfflineQueue } from "../services/channelOrders";

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
    return <div className="grid min-h-screen place-items-center bg-slate-950 text-slate-300">Loading KDS…</div>;
  }
  if (!canAccessKds(role)) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-center text-slate-200">
        <div>
          <div className="text-lg font-bold">Kitchen access denied</div>
          <div className="mt-2 text-sm text-slate-400">Role: {role}</div>
          <Link to="/orders" className="mt-4 inline-block text-cyan-400">
            Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-3">
          <Link to="/orders" className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-sm text-slate-300">
            <ArrowLeft size={14} /> OMS
          </Link>
          <div className="text-lg font-black tracking-tight">Kitchen Display</div>
          <div className="text-xs text-slate-400">Realtime · dark · touch</div>
          <div className="ml-auto flex flex-wrap gap-2">
            {KDS_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-xs font-bold",
                  category === c ? "bg-cyan-400 text-slate-950" : "bg-white/5 text-slate-300"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </header>

      {msg ? <div className="mx-auto max-w-[1800px] px-4 pt-3 text-sm text-cyan-300">{msg}</div> : null}
      {error ? <div className="mx-auto max-w-[1800px] px-4 pt-3 text-sm text-rose-300">{error}</div> : null}
      {loading ? <div className="mx-4 mt-4 h-24 animate-pulse rounded-2xl bg-white/5" /> : null}

      <div className="mx-auto flex max-w-[1800px] gap-3 overflow-x-auto p-4">
        {KDS_COLUMNS.map((col) => (
          <div key={col.id} className="min-w-[280px] flex-1 rounded-2xl border border-white/10 bg-slate-900/80 p-2">
            <div className="mb-2 flex items-center justify-between px-2 py-1">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">{col.label}</div>
              <div className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold">{(columns[col.id] || []).length}</div>
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
        "rounded-2xl border p-3",
        o.delayed ? "border-orange-400/60 bg-orange-500/10" : "border-white/10 bg-slate-950/60",
        o.priority === "vip" || o.priority === "express" ? "ring-1 ring-cyan-400/50" : ""
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-black">{o.invoiceNo || o.id.slice(0, 7)}</div>
          <div className="text-xs text-slate-400">
            {ORDER_TYPE_LABELS[o.orderType] || o.orderType}
            {o.tableName ? ` · ${o.tableName}` : ""}
            {o.customerName ? ` · ${o.customerName}` : ""}
          </div>
        </div>
        <div className={clsx("rounded-lg px-2 py-1 text-sm font-black", o.ageMin > o.eta ? "bg-rose-500 text-white" : "bg-white/10")}>
          {o.ageMin}m
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {(o.items || []).map((l) => (
          <li key={l.lineId} className="text-sm">
            <span className="font-bold">
              {l.qty}× {l.name}
            </span>
            {(l.kitchenNote || l.note || l.specialInstructions) && (
              <div className="text-xs text-amber-200/90">{l.kitchenNote || l.note || l.specialInstructions}</div>
            )}
          </li>
        ))}
      </ul>

      {o.kitchenNote ? <div className="mt-2 rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-300">{o.kitchenNote}</div> : null}
      {o.chefName ? <div className="mt-2 text-[11px] text-slate-400">Chef: {o.chefName}</div> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {next ? (
          <button
            type="button"
            className="min-h-11 flex-1 rounded-xl bg-cyan-400 px-3 text-sm font-black text-slate-950"
            onClick={() => props.onBump(next)}
          >
            Mark {next}
          </button>
        ) : null}
        {props.canAssign && !o.chefName ? (
          <select
            className="min-h-11 rounded-xl border border-white/10 bg-slate-900 px-2 text-xs"
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
