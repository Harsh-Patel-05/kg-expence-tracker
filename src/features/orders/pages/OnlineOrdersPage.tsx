import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  limit
} from "firebase/firestore";
import {
  Bike,
  Check,
  ChefHat,
  Clock,
  Globe,
  MapPin,
  PackageCheck,
  Phone,
  Store,
  XCircle
} from "lucide-react";
import { clsx } from "clsx";
import { db } from "@/lib/firebase";
import { inr } from "@/lib/utils";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { canAccessOrders, canChangeOrderStatus } from "@/features/pos/utils/permissions";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ContentLoading, PageLoading } from "@/components/ui/Loading";
import {
  acceptOnlineOrder,
  ensureKitchenOrderFromOnline,
  rejectOnlineOrder
} from "../services/onlineOrderBridge";
import { PosOnlineOrderingSwitch } from "@/features/pos/components/PosOnlineOrderingSwitch";

type OnlineOrder = {
  id: string;
  orderId?: string;
  orderStatus?: string;
  orderType?: string;
  customer?: { fullName?: string; mobile?: string };
  items?: Array<{ name: string; optionLabel?: string | null; qty: number; unitPrice: number; lineTotal?: number }>;
  pricing?: { subtotal?: number; deliveryCharge?: number; discount?: number; total?: number };
  deliveryAddress?: {
    flat?: string;
    society?: string;
    area?: string;
    landmark?: string;
    latitude?: number;
    longitude?: number;
  };
  distanceKm?: number | null;
  paymentMethod?: string;
  paymentStatus?: string;
  deliveryInstructions?: string;
  createdAtIso?: string;
  estimatedDeliveryMinutes?: { min: number; max: number };
  linkedKitchenOrderId?: string | null;
};

const FLOW = [
  { id: "placed", label: "New" },
  { id: "confirmed", label: "Confirm" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "out_for_delivery", label: "Out" },
  { id: "delivered", label: "Delivered" }
] as const;

const NEXT: Record<string, string | null> = {
  placed: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "out_for_delivery",
  out_for_delivery: "delivered",
  delivered: null
};

const NEXT_LABEL: Record<string, string> = {
  confirmed: "Accept / Confirm",
  preparing: "Start preparing",
  ready: "Mark ready",
  out_for_delivery: "Out for delivery",
  delivered: "Mark delivered"
};

type InboxFilter = "all" | "awaiting" | "live" | "done";

const TERMINAL = new Set(["delivered", "cancelled", "rejected", "refund_pending"]);

function addressLine(o: OnlineOrder) {
  const a = o.deliveryAddress;
  if (!a) return "Pickup at restaurant";
  return [a.flat, a.society, a.area, a.landmark].filter(Boolean).join(", ");
}

function statusLabel(status?: string, orderType?: string) {
  if (!status) return "—";
  if (status === "ready" && orderType === "pickup") return "Ready for pickup";
  if (status === "delivered" && orderType === "pickup") return "Picked up";
  return status.replace(/_/g, " ");
}

function statusTone(status?: string) {
  switch (status) {
    case "placed":
      return "bg-warning-bg text-warning ring-warning/25";
    case "confirmed":
    case "preparing":
      return "bg-primary-light text-primary ring-primary/25";
    case "ready":
    case "out_for_delivery":
      return "bg-success-bg text-success ring-success/25";
    case "delivered":
      return "bg-success-bg/70 text-success ring-success/20";
    case "cancelled":
    case "rejected":
    case "refund_pending":
      return "bg-danger-bg text-danger ring-danger/25";
    default:
      return "bg-bg-1 text-text-muted ring-stroke-0";
  }
}

function formatWhen(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

async function setOnlineStatus(orderId: string, status: string, note: string) {
  const at = new Date().toISOString();
  await updateDoc(doc(db, "onlineOrders", orderId), {
    orderStatus: status,
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({ status, at, note })
  });
}

function StatusBadge({ status, orderType }: { status?: string; orderType?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1",
        statusTone(status)
      )}
    >
      {statusLabel(status, orderType)}
    </span>
  );
}

function FlowStepper({ status, orderType }: { status?: string; orderType?: string }) {
  const steps =
    orderType === "pickup" ? FLOW.filter((s) => s.id !== "out_for_delivery") : [...FLOW];
  const cur = steps.findIndex((s) => s.id === status);
  const doneAll = status === "delivered";

  return (
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-1" aria-label="Order flow">
      {steps.map((s, idx) => {
        const done = doneAll || (cur >= 0 && idx <= cur);
        const current = s.id === status && !doneAll;
        const label =
          s.id === "ready" && orderType === "pickup"
            ? "Pickup"
            : s.id === "delivered" && orderType === "pickup"
              ? "Picked up"
              : s.label;
        return (
          <li
            key={s.id}
            className={clsx(
              "relative flex flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-center",
              current ? "bg-primary-light/70" : done ? "bg-bg-1" : "bg-transparent"
            )}
          >
            <span
              className={clsx(
                "grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold",
                current
                  ? "bg-primary text-white shadow-[var(--shadow-neonCyan)]"
                  : done
                    ? "bg-primary/15 text-primary"
                    : "bg-bg-1 text-text-muted ring-1 ring-stroke-0"
              )}
            >
              {done && !current ? <Check size={13} strokeWidth={2.5} /> : idx + 1}
            </span>
            <span
              className={clsx(
                "text-[10px] font-semibold leading-tight",
                current ? "text-primary" : done ? "text-text-secondary" : "text-text-muted"
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OnlineOrdersPage() {
  const { role, loading: authLoading } = usePosAuth();
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [etaMin, setEtaMin] = useState(40);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | "reject" | "cancel">(null);

  useEffect(() => {
    const q = query(collection(db, "onlineOrders"), orderBy("createdAtIso", "desc"), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OnlineOrder, "id">) }));
        setOrders(rows);
        setLoading(false);
        setError("");
        setSelectedId((prev) => prev || rows[0]?.id || null);
      },
      (err) => {
        setError(err.message || "Failed to load online orders");
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) || null,
    [orders, selectedId]
  );

  useEffect(() => {
    if (!selected?.estimatedDeliveryMinutes?.max) return;
    setEtaMin(selected.estimatedDeliveryMinutes.max);
  }, [selected?.id, selected?.estimatedDeliveryMinutes?.max]);

  useEffect(() => {
    setConfirmAction(null);
  }, [selectedId]);

  const stats = useMemo(() => {
    const open = orders.filter((o) => !TERMINAL.has(o.orderStatus || ""));
    return {
      open: open.length,
      placed: orders.filter((o) => o.orderStatus === "placed").length,
      delivery: orders.filter((o) => o.orderType === "delivery" && o.orderStatus === "out_for_delivery").length,
      todayTotal: orders
        .filter((o) => (o.createdAtIso || "").slice(0, 10) === new Date().toISOString().slice(0, 10))
        .reduce((s, o) => s + Number(o.pricing?.total || 0), 0)
    };
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const st = o.orderStatus || "";
      if (filter === "awaiting") return st === "placed";
      if (filter === "live") return !TERMINAL.has(st);
      if (filter === "done") return TERMINAL.has(st);
      return true;
    });
  }, [orders, filter]);

  if (authLoading) return <PageLoading label="Loading online orders…" />;
  if (!canAccessOrders(role)) {
    return <EmptyState title="Orders access denied" description={`Your role (${role}) cannot open online orders.`} />;
  }

  const canChange = canChangeOrderStatus(role);
  const next = selected ? NEXT[selected.orderStatus || "placed"] : null;
  const isTerminal = selected ? TERMINAL.has(selected.orderStatus || "") : false;

  const advance = async (to: string, note: string) => {
    if (!selected || !canChange) return;
    setBusy(true);
    try {
      if (to === "confirmed") {
        await acceptOnlineOrder({ onlineOrderId: selected.id, etaMaxMin: etaMin, role });
      } else {
        await setOnlineStatus(selected.id, to, note);
        if (["preparing", "ready", "out_for_delivery", "delivered"].includes(to)) {
          const kitchenId =
            selected.linkedKitchenOrderId ||
            (await ensureKitchenOrderFromOnline({
              ...selected,
              orderStatus: to === "delivered" ? "ready" : to
            }));
          if (kitchenId) {
            const kitchenStatus =
              to === "preparing"
                ? "preparing"
                : to === "ready"
                  ? "ready"
                  : to === "delivered"
                    ? "completed"
                    : to === "out_for_delivery"
                      ? "packed"
                      : "preparing";
            const orderStatus =
              to === "out_for_delivery"
                ? "out_for_delivery"
                : to === "delivered"
                  ? "delivered"
                  : to;
            await updateDoc(doc(db, "orders", kitchenId), {
              status: orderStatus,
              kitchenStatus,
              updatedAt: serverTimestamp()
            }).catch(() => undefined);
          }
        }
      }
    } catch (e: any) {
      setError(e?.message || "Status update failed");
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!selected || !canChange) return;
    if (confirmAction !== "reject") {
      setConfirmAction("reject");
      return;
    }
    setBusy(true);
    try {
      await rejectOnlineOrder({
        onlineOrderId: selected.id,
        reason: "Rejected by restaurant",
        role
      });
      setConfirmAction(null);
    } catch (e: any) {
      setError(e?.message || "Reject failed");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!selected || !canChange) return;
    if (confirmAction !== "cancel") {
      setConfirmAction("cancel");
      return;
    }
    setBusy(true);
    try {
      await rejectOnlineOrder({
        onlineOrderId: selected.id,
        reason: "Cancelled by restaurant",
        asCancel: true,
        role
      });
      setConfirmAction(null);
    } catch (e: any) {
      setError(e?.message || "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  const markRefund = async () => {
    if (!selected || !canChange) return;
    await advance("refund_pending", "Refund pending");
  };

  const pickOrder = (id: string) => {
    setSelectedId(id);
    setMobileShowDetail(true);
  };

  const filters: Array<{ id: InboxFilter; label: string; count?: number }> = [
    { id: "all", label: "All", count: orders.length },
    { id: "awaiting", label: "Awaiting", count: stats.placed },
    { id: "live", label: "Live", count: stats.open },
    { id: "done", label: "Done" }
  ];

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <PageHeader
        card={false}
        className="!mb-0"
        eyebrow="Website · Delivery"
        title="Online orders"
        description="Live inbox for website delivery & pickup. Status syncs to customer tracking."
        actions={
          <>
            <PosOnlineOrderingSwitch />
            <a
              className="kg-btn kg-btn-secondary"
              href="https://the-kilogram-ahmedabad.netlify.app/"
              target="_blank"
              rel="noreferrer"
            >
              <Globe size={16} /> Open website
            </a>
          </>
        }
      />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>
      ) : null}

      {/* Compact KPI strip */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Open", value: String(stats.open), tone: "text-text-primary" },
          {
            label: "Awaiting accept",
            value: String(stats.placed),
            tone: stats.placed > 0 ? "text-warning" : "text-text-primary"
          },
          { label: "Out for delivery", value: String(stats.delivery), tone: "text-primary" },
          { label: "Today revenue", value: inr(stats.todayTotal), tone: "text-text-primary" }
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-stroke-0 bg-card-0 px-3 py-2.5 shadow-panel"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">{k.label}</div>
            <div className={clsx("mt-0.5 text-[18px] font-bold tabular-nums tracking-tight md:text-[20px]", k.tone)}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {loading ? <ContentLoading variant="block" label="Loading" /> : null}

      {/* Split workspace */}
      <div className="grid min-h-[calc(100dvh-220px)] gap-3 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:items-stretch">
        {/* Inbox */}
        <Card
          padding="sm"
          hover={false}
          className={clsx(
            "flex min-h-0 flex-col !p-0",
            mobileShowDetail ? "hidden lg:flex" : "flex"
          )}
        >
          <div className="border-b border-stroke-0 px-3 pb-2 pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[14px] font-bold text-text-primary">Inbox</div>
              <span className="text-[11px] text-text-muted">{filtered.length} shown</span>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={clsx(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                    filter === f.id
                      ? "bg-primary text-white"
                      : "bg-bg-1 text-text-muted hover:text-text-primary"
                  )}
                >
                  {f.label}
                  {typeof f.count === "number" ? (
                    <span className="ml-1 opacity-80">{f.count}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {filtered.map((o) => {
              const active = o.id === selectedId;
              const awaiting = o.orderStatus === "placed";
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => pickOrder(o.id)}
                  className={clsx(
                    "flex w-full flex-col gap-1.5 border-b border-stroke-0 px-3 py-3 text-left transition",
                    active
                      ? "border-l-[3px] border-l-primary bg-primary-light/45"
                      : "border-l-[3px] border-l-transparent hover:bg-bg-1",
                    awaiting && !active ? "bg-warning-bg/25" : ""
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-text-primary">
                      {o.orderId || o.id}
                    </span>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums">{inr(o.pricing?.total || 0)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={o.orderStatus} orderType={o.orderType} />
                    <span className="text-[11px] capitalize text-text-muted">
                      {o.orderType || "delivery"}
                      {o.distanceKm != null ? ` · ${o.distanceKm} km` : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] text-text-secondary">
                      {o.customer?.fullName || "Guest"}
                    </span>
                    <span className="shrink-0 text-[11px] text-text-muted">{formatWhen(o.createdAtIso)}</span>
                  </div>
                </button>
              );
            })}
            {!filtered.length && !loading ? (
              <EmptyState
                className="m-3 !py-10"
                icon={<Globe size={18} />}
                title={orders.length ? "No orders in this filter" : "No website orders yet"}
                description={orders.length ? "Try another tab." : "New orders from the website appear here live."}
              />
            ) : null}
          </div>
        </Card>

        {/* Detail */}
        <Card
          padding="sm"
          hover={false}
          className={clsx(
            "flex min-h-0 flex-col !p-0",
            mobileShowDetail ? "flex" : "hidden lg:flex"
          )}
        >
          {!selected ? (
            <div className="grid flex-1 place-items-center p-6">
              <EmptyState title="Select an order" description="Choose a website order from the inbox." />
            </div>
          ) : (
            <>
              <div className="border-b border-stroke-0 px-4 py-3">
                <button
                  type="button"
                  className="mb-2 text-[12px] font-semibold text-primary lg:hidden"
                  onClick={() => setMobileShowDetail(false)}
                >
                  ← Inbox
                </button>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[17px] font-bold tracking-tight md:text-[18px]">
                        {selected.orderId || selected.id}
                      </h2>
                      <StatusBadge status={selected.orderStatus} orderType={selected.orderType} />
                    </div>
                    <p className="mt-1 text-[12px] text-text-muted">
                      {formatWhen(selected.createdAtIso)}
                      <span aria-hidden> · </span>
                      <span className="capitalize">{selected.orderType || "delivery"}</span>
                      <span aria-hidden> · </span>
                      <span className="capitalize">
                        {selected.paymentMethod || "cod"} · {selected.paymentStatus || "pending"}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-[22px] font-bold tabular-nums tracking-tight text-text-primary">
                      {inr(selected.pricing?.total || 0)}
                    </div>
                    {(selected.items || []).length ? (
                      <div className="text-[11px] text-text-muted">
                        {(selected.items || []).length} item{(selected.items || []).length === 1 ? "" : "s"}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4">
                <FlowStepper status={selected.orderStatus} orderType={selected.orderType} />

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-stroke-0 bg-bg-0/80 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
                      <Phone size={12} /> Customer
                    </div>
                    <div className="text-[14px] font-semibold">{selected.customer?.fullName || "—"}</div>
                    {selected.customer?.mobile ? (
                      <a
                        className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
                        href={`tel:${selected.customer.mobile}`}
                      >
                        {selected.customer.mobile}
                      </a>
                    ) : (
                      <div className="text-[13px] text-text-muted">—</div>
                    )}
                  </div>
                  <div className="rounded-xl border border-stroke-0 bg-bg-0/80 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
                      {selected.orderType === "pickup" ? <Store size={12} /> : <MapPin size={12} />}
                      {selected.orderType === "pickup" ? "Pickup" : "Delivery"}
                    </div>
                    <div className="text-[13px] leading-snug text-text-secondary">{addressLine(selected)}</div>
                    {selected.distanceKm != null ? (
                      <div className="mt-1 text-[11px] text-text-muted">{selected.distanceKm} km from restaurant</div>
                    ) : null}
                    {selected.deliveryInstructions ? (
                      <div className="mt-2 rounded-lg border-l-2 border-primary/50 bg-bg-1 px-2 py-1.5 text-[12px] text-text-secondary">
                        {selected.deliveryInstructions}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[13px] font-bold text-text-primary">Items</div>
                  <ul className="overflow-hidden rounded-xl border border-stroke-0">
                    {(selected.items || []).map((it, i) => (
                      <li
                        key={`${it.name}-${i}`}
                        className="flex items-start justify-between gap-3 border-b border-stroke-0 bg-card-0 px-3 py-2.5 last:border-b-0"
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-bg-1 text-[11px] font-bold text-text-secondary">
                            {it.qty}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold leading-snug">{it.name}</div>
                            {it.optionLabel ? (
                              <div className="text-[11px] text-text-muted">{it.optionLabel}</div>
                            ) : null}
                          </div>
                        </div>
                        <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                          {inr(it.lineTotal ?? it.unitPrice * it.qty)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 space-y-1 px-1 text-[12px] text-text-muted">
                    <div className="flex justify-between gap-3">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{inr(selected.pricing?.subtotal || 0)}</span>
                    </div>
                    {selected.orderType === "delivery" ? (
                      <div className="flex justify-between gap-3">
                        <span>Delivery</span>
                        <span className="tabular-nums">
                          {Number(selected.pricing?.deliveryCharge || 0) === 0
                            ? "Free"
                            : inr(selected.pricing?.deliveryCharge || 0)}
                        </span>
                      </div>
                    ) : null}
                    {Number(selected.pricing?.discount || 0) > 0 ? (
                      <div className="flex justify-between gap-3">
                        <span>Discount</span>
                        <span className="tabular-nums">−{inr(selected.pricing?.discount || 0)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3 border-t border-dashed border-stroke-0 pt-1.5 text-[13px] font-bold text-text-primary">
                      <span>Total</span>
                      <span className="tabular-nums">{inr(selected.pricing?.total || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {canChange && !isTerminal ? (
                <div className="sticky bottom-0 border-t border-stroke-0 bg-card-0 px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-[12px] text-text-muted">
                      <Clock size={13} />
                      ETA max
                      <input
                        type="number"
                        min={20}
                        max={120}
                        value={etaMin}
                        onChange={(e) => setEtaMin(Number(e.target.value) || 40)}
                        className="kg-input !h-8 !w-[72px] !px-2 !text-[13px]"
                      />
                      <span className="text-text-muted">min</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.orderStatus === "placed" ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="kg-btn kg-btn-primary"
                        onClick={() => advance("confirmed", "Order confirmed")}
                      >
                        <Check size={16} /> Accept / Confirm
                      </button>
                    ) : null}
                    {next && selected.orderStatus !== "placed" ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="kg-btn kg-btn-primary"
                        onClick={() => advance(next, `Moved to ${next}`)}
                      >
                        {next === "preparing" ? <ChefHat size={16} /> : null}
                        {next === "ready" ? <PackageCheck size={16} /> : null}
                        {next === "out_for_delivery" ? <Bike size={16} /> : null}
                        {next === "delivered" ? <Check size={16} /> : null}
                        {NEXT_LABEL[next] || `Mark ${next.replace(/_/g, " ")}`}
                      </button>
                    ) : null}
                    {selected.orderType === "pickup" && selected.orderStatus === "ready" ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="kg-btn kg-btn-secondary"
                        onClick={() => advance("delivered", "Picked up by customer")}
                      >
                        Mark picked up
                      </button>
                    ) : null}
                    {confirmAction ? (
                      <div className="w-full rounded-xl border border-danger/30 bg-danger-bg/40 p-3">
                        <p className="mb-2 text-[13px] font-semibold text-danger">
                          {confirmAction === "reject"
                            ? "Reject this order? Customer tracking will show Rejected."
                            : "Cancel this order? Customer tracking will show Cancelled."}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            className="kg-btn kg-btn-primary !bg-danger"
                            onClick={() => void (confirmAction === "reject" ? reject() : cancel())}
                          >
                            <XCircle size={16} />{" "}
                            {confirmAction === "reject" ? "Yes, reject" : "Yes, cancel"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className="kg-btn kg-btn-secondary"
                            onClick={() => setConfirmAction(null)}
                          >
                            Keep order
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button type="button" disabled={busy} className="kg-btn kg-btn-secondary" onClick={() => void reject()}>
                          <XCircle size={16} /> Reject
                        </button>
                        <button type="button" disabled={busy} className="kg-btn kg-btn-ghost" onClick={() => void cancel()}>
                          Cancel
                        </button>
                        <button type="button" disabled={busy} className="kg-btn kg-btn-ghost" onClick={markRefund}>
                          Refund pending
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              {isTerminal ? (
                <div className="border-t border-stroke-0 px-4 py-3 text-[12px] text-text-muted">
                  This order is <span className="font-semibold capitalize">{statusLabel(selected.orderStatus, selected.orderType)}</span>.
                  {canChange && selected.orderStatus !== "refund_pending" && selected.orderStatus !== "delivered" ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="ml-2 font-semibold text-primary hover:underline"
                      onClick={markRefund}
                    >
                      Mark refund pending
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
