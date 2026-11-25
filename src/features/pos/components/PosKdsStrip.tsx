import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { ChevronDown, ChevronUp, Link2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useLiveOrders, type LiveOrder } from "@/features/orders/hooks/useLiveOrders";
import { ORDER_TYPE_LABELS } from "@/features/orders/engine/statusMachine";
import { needsShopCollect } from "@/features/pos/services/posFirestore";
import { inr, isoDate, num } from "@/lib/utils";
import { formatKitchenLineView } from "@/features/pos/utils/kitchenLineFormat";
import { LiveOrderModal } from "./LiveOrderModal";

type Lane = "waiting" | "preparing" | "ready";

function kitchenLane(o: LiveOrder): Lane {
  const ks = String(o.kitchenStatus || "");
  const s = String(o.status || "");
  if (ks === "ready" || ks === "packed" || s === "ready" || s === "packed") return "ready";
  if (
    ks === "preparing" ||
    ks === "cooking" ||
    ks === "plating" ||
    s === "preparing" ||
    s === "cooking"
  ) {
    return "preparing";
  }
  return "waiting";
}

function tokenOf(o: LiveOrder) {
  const ch = String(o.orderType || "").toLowerCase();
  if (ch.includes("swiggy") || ch.includes("zomato")) {
    const raw = String(o.platformOrderId || o.tokenNumber || "").trim();
    if (raw) return raw;
    return "----";
  }
  if (o.tokenNumber) return String(o.tokenNumber).replace(/^0+/, "") || o.tokenNumber;
  if (o.invoiceNo) {
    const last = String(o.invoiceNo).split("-").pop() || o.invoiceNo;
    return /^\d+$/.test(last) ? String(Number(last)) : last;
  }
  return o.id.slice(0, 6);
}

function isUnpaid(o: LiveOrder) {
  return needsShopCollect(o);
}

function channelLabel(o: LiveOrder) {
  const t = String(o.orderType || "").toLowerCase();
  if (t.includes("swiggy")) return "Swiggy";
  if (t.includes("zomato")) return "Zomato";
  return ORDER_TYPE_LABELS[o.orderType] || o.orderType;
}

const LANE_STYLE: Record<Lane, string> = {
  waiting: "border-danger/35 bg-danger-bg text-danger",
  preparing: "border-warning/40 bg-warning-bg text-warning",
  ready: "border-success/45 bg-success-bg text-success"
};

const COLLAPSE_KEY = "kg_pos_kds_strip_collapsed";

type Props = {
  onEditOrder: (order: LiveOrder) => void;
  onCancelOrder: (order: LiveOrder) => void;
  onCollect: (order: LiveOrder, args: { mode?: "cash" | "upi"; cash?: number; upi?: number }) => void;
  onMarkReady: (order: LiveOrder) => void;
  onMarkPreparing: (order: LiveOrder) => void;
  onDeliver: (order: LiveOrder) => void;
  onShareWhatsApp?: (order: LiveOrder) => void;
  busy?: boolean;
};

export function PosKdsStrip({
  onEditOrder,
  onCancelOrder,
  onCollect,
  onMarkReady,
  onMarkPreparing,
  onDeliver,
  onShareWhatsApp,
  busy
}: Props) {
  const { allOrders } = useLiveOrders();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [forceCollect, setForceCollect] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const clickTimer = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const live = useMemo(() => {
    const today = isoDate();
    return allOrders
      .filter((o) =>
        ["pending", "confirmed", "accepted", "preparing", "cooking", "ready", "packed", "held"].includes(
          String(o.status)
        )
      )
      .filter((o) => String(o.status) !== "completed" && String(o.status) !== "cancelled")
      .filter((o) => {
        const d = String(o.date || "").slice(0, 10);
        if (d && d !== today) return false;
        // Drop stale tickets older than 18h
        if ((o.ageMin || 0) > 18 * 60) return false;
        return true;
      })
      .map((o) => ({ o, lane: kitchenLane(o) }))
      .sort((a, b) => {
        const au = isUnpaid(a.o) ? 0 : 1;
        const bu = isUnpaid(b.o) ? 0 : 1;
        if (au !== bu) return au - bu;
        const laneRank = { ready: 0, waiting: 1, preparing: 2 } as const;
        if (laneRank[a.lane] !== laneRank[b.lane]) return laneRank[a.lane] - laneRank[b.lane];
        return (a.o.urgencyScore ?? 0) - (b.o.urgencyScore ?? 0);
      })
      .slice(0, 16);
  }, [allOrders]);

  const waiting = live.filter((r) => r.lane === "waiting").length;
  const preparing = live.filter((r) => r.lane === "preparing").length;
  const ready = live.filter((r) => r.lane === "ready").length;
  const unpaid = live.filter((r) => isUnpaid(r.o)).length;
  const active = live.find((r) => r.o.id === activeId)?.o || null;

  function openOrder(o: LiveOrder, collectOnly = false) {
    setForceCollect(collectOnly);
    setActiveId(o.id);
  }

  function handleCardClick(o: LiveOrder, lane: Lane) {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      // Double-click
      if (lane === "waiting" || lane === "preparing") {
        void onMarkReady(o);
        return;
      }
      if (lane === "ready") {
        if (isUnpaid(o)) {
          openOrder(o, true);
        } else {
          void onDeliver(o);
        }
      }
      return;
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      openOrder(o, false);
    }, 240);
  }

  if (!live.length) return null;

  return (
    <div className="shrink-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 px-0.5">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="inline-flex items-center gap-1 rounded-md border border-stroke-0 bg-bg-1 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted hover:border-primary/40"
          title={collapsed ? "Show kitchen orders" : "Hide kitchen orders"}
        >
          Kitchen live
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <span className="rounded-md bg-danger-bg px-1.5 py-0.5 text-[10px] font-bold text-danger">Wait {waiting}</span>
        <span className="rounded-md bg-warning-bg px-1.5 py-0.5 text-[10px] font-bold text-warning">Prep {preparing}</span>
        {ready ? (
          <span className="rounded-md bg-success-bg px-1.5 py-0.5 text-[10px] font-bold text-success">Ready {ready}</span>
        ) : null}
        {unpaid ? (
          <span className="rounded-md bg-primary-light px-1.5 py-0.5 text-[10px] font-bold text-primary">Unpaid {unpaid}</span>
        ) : null}
        <a href="/kds" target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
          <Link2 size={12} /> Open KDS
        </a>
      </div>

      {!collapsed ? (
        <div className="flex gap-2 overflow-x-auto pb-0.5 kg-hide-scrollbar">
          {live.map(({ o, lane }) => {
            const unpaidBill = isUnpaid(o);
            const note = o.kitchenNote || o.notes || "";
            return (
              <div
                key={o.id}
                role="button"
                tabIndex={0}
                onClick={() => !busy && handleCardClick(o, lane)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openOrder(o);
                  }
                }}
                className={clsx(
                  "relative min-w-[168px] max-w-[200px] shrink-0 cursor-pointer rounded-xl border px-2.5 py-2 text-left outline-none transition hover:brightness-[0.98]",
                  LANE_STYLE[lane],
                  unpaidBill && "ring-1 ring-primary/35",
                  lane === "ready" && unpaidBill && "animate-pulse"
                )}
                title="Click: open · Double-click: ready / deliver"
              >
                <button
                  type="button"
                  disabled={busy}
                  className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white/80 text-danger hover:bg-danger-bg disabled:opacity-50"
                  aria-label="Cancel order"
                  title="Cancel"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmCancelId(o.id);
                  }}
                >
                  <X size={13} strokeWidth={2.5} />
                </button>

                <div className="pr-6">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[15px] font-bold tabular-nums">#{tokenOf(o)}</span>
                    {(() => {
                      const ch = String(o.orderType || "").toLowerCase();
                      const isAgg = ch.includes("swiggy") || ch.includes("zomato");
                      const ageSec = o.ageSec ?? o.ageMin * 60;
                      const remain = o.remainSec ?? (o.eta || 18) * 60 - ageSec;
                      if (isAgg) {
                        const late = remain < 0;
                        const abs = Math.abs(remain);
                        const label = `${late ? "-" : ""}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
                        return (
                          <span
                            className={clsx(
                              "rounded px-1 py-0.5 text-[10px] font-bold tabular-nums",
                              late ? "bg-danger text-white" : remain <= 300 ? "bg-warning-bg text-warning" : "bg-success-bg text-success"
                            )}
                            title="18 min countdown"
                          >
                            {label}
                          </span>
                        );
                      }
                      return (
                        <span
                          className={clsx(
                            "rounded px-1 py-0.5 text-[10px] font-bold tabular-nums",
                            ageSec / 60 > (o.eta || 25)
                              ? "bg-danger text-white"
                              : ageSec / 60 >= (o.eta || 25) - 5
                                ? "bg-warning-bg text-warning"
                                : "bg-success-bg text-success"
                          )}
                          title={`Target ${o.eta}m`}
                        >
                          {Math.max(1, Math.ceil(ageSec / 60))}m
                        </span>
                      );
                    })()}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] font-semibold opacity-90">
                    {channelLabel(o)}
                    {o.tableName ? ` · ${o.tableName}` : ""}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[11px] font-medium leading-snug">
                    {(o.items || [])
                      .slice(0, 3)
                      .map((l) => {
                        const view = formatKitchenLineView("hi", l);
                        return `${l.qty}× ${view.title}`;
                      })
                      .join(", ")}
                    {(o.items || []).length > 3 ? "…" : ""}
                  </div>
                  {note ? <div className="mt-1 line-clamp-2 text-[10px] font-semibold opacity-90">{note}</div> : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {num(o.kotVersion) > 1 || (o as { kitchenModified?: boolean }).kitchenModified ? (
                      <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase text-white animate-pulse">
                        Updated
                      </span>
                    ) : null}
                    {unpaidBill ? (
                      <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                        Unpaid · {inr(o.balanceDue || o.total)}
                      </span>
                    ) : (
                      <span className="rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-bold uppercase text-text-primary">
                        Paid
                      </span>
                    )}
                    {lane === "ready" ? (
                      <span className="rounded bg-success px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Ready</span>
                    ) : (
                      <span className="rounded bg-white/60 px-1.5 py-0.5 text-[9px] font-bold capitalize text-text-primary">
                        {lane}
                      </span>
                    )}
                  </div>
                </div>

                {lane === "waiting" ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="mt-2 w-full rounded-md border border-current/20 bg-white/70 px-1.5 py-1 text-[10px] font-bold text-text-primary disabled:opacity-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkPreparing(o);
                    }}
                  >
                    Start prep
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-stroke-0 bg-bg-1 px-3 py-2 text-[12px] text-text-secondary">
          Kitchen strip hidden · {waiting} waiting · {preparing} prep
          {ready ? ` · ${ready} ready` : ""}
          {unpaid ? ` · ${unpaid} unpaid` : ""}. Tap <b>Kitchen live</b> to expand.
        </div>
      )}

      {confirmCancelId ? (
        <div
          className="fixed inset-0 z-[95] grid place-items-center bg-text-primary/40 p-4"
          onClick={() => setConfirmCancelId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-stroke-0 bg-card-0 p-4 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-bold text-text-primary">Cancel this order?</div>
            <div className="mt-1 text-[13px] text-text-secondary">
              #{tokenOf(live.find((r) => r.o.id === confirmCancelId)?.o || ({ id: confirmCancelId } as LiveOrder))} will be
              removed from kitchen.
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="kg-btn kg-btn-primary flex-1 !bg-danger"
                disabled={busy}
                onClick={() => {
                  const o = live.find((r) => r.o.id === confirmCancelId)?.o;
                  setConfirmCancelId(null);
                  if (o) onCancelOrder(o);
                }}
              >
                Yes, cancel
              </button>
              <button type="button" className="kg-btn kg-btn-secondary flex-1" onClick={() => setConfirmCancelId(null)}>
                Keep
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {active ? (
        <LiveOrderModal
          order={active}
          busy={busy}
          forceCollect={forceCollect}
          onClose={() => {
            setActiveId(null);
            setForceCollect(false);
          }}
          onEdit={() => {
            onEditOrder(active);
            setActiveId(null);
          }}
          onCancel={() => {
            onCancelOrder(active);
            setActiveId(null);
          }}
          onMarkReady={() => {
            onMarkReady(active);
            setActiveId(null);
          }}
          onDeliver={() => {
            onDeliver(active);
            setActiveId(null);
          }}
          onCollect={(args) => {
            onCollect(active, args);
            setActiveId(null);
          }}
          onShareWhatsApp={
            onShareWhatsApp
              ? () => {
                  onShareWhatsApp(active);
                  setActiveId(null);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
