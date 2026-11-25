import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import type { LiveOrder } from "@/features/orders/hooks/useLiveOrders";
import { ORDER_TYPE_LABELS } from "@/features/orders/engine/statusMachine";
import { isPlatformKitchenOrder, needsShopCollect } from "@/features/pos/services/posFirestore";
import { inr, num } from "@/lib/utils";

function tokenOf(o: LiveOrder) {
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

function laneOf(o: LiveOrder) {
  const ks = String(o.kitchenStatus || "");
  const s = String(o.status || "");
  if (ks === "ready" || ks === "packed" || s === "ready" || s === "packed") return "ready";
  if (ks === "preparing" || ks === "cooking" || s === "preparing" || s === "cooking") return "preparing";
  return "waiting";
}

type Props = {
  order: LiveOrder;
  busy?: boolean;
  forceCollect?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onMarkReady: () => void;
  onDeliver: () => void;
  onCollect: (args: { mode?: "cash" | "upi"; cash?: number; upi?: number }) => void;
  onShareWhatsApp?: () => void;
};

export function LiveOrderModal({
  order,
  busy,
  forceCollect,
  onClose,
  onEdit,
  onCancel,
  onMarkReady,
  onDeliver,
  onCollect,
  onShareWhatsApp
}: Props) {
  const unpaid = isUnpaid(order);
  const platformKitchen = isPlatformKitchenOrder(order);
  const lane = laneOf(order);
  const due = num(order.balanceDue || order.total);
  const [payMode, setPayMode] = useState<"cash" | "upi" | "split">(forceCollect ? "cash" : "cash");
  const [cashAmt, setCashAmt] = useState(String(due));
  const [upiAmt, setUpiAmt] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const channel = ORDER_TYPE_LABELS[order.orderType] || order.orderType;

  const splitOk = useMemo(() => {
    if (payMode !== "split") return true;
    return Math.max(0, Number(cashAmt) || 0) + Math.max(0, Number(upiAmt) || 0) + 0.009 >= due;
  }, [payMode, cashAmt, upiAmt, due]);

  function submitCollect() {
    if (payMode === "cash") onCollect({ mode: "cash" });
    else if (payMode === "upi") onCollect({ mode: "upi" });
    else {
      onCollect({
        cash: Math.max(0, Number(cashAmt) || 0),
        upi: Math.max(0, Number(upiAmt) || 0)
      });
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-text-primary/45 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-auto rounded-2xl border border-stroke-0 bg-card-0 p-4 shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[18px] font-bold text-text-primary">#{tokenOf(order)}</div>
            <div className="text-[12px] text-text-muted">
              {channel}
              {order.invoiceNo ? ` · ${order.invoiceNo}` : ""}
              {order.tableName ? ` · ${order.tableName}` : ""}
              {order.customerName ? ` · ${order.customerName}` : ""}
            </div>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full border border-stroke-0 text-text-muted hover:bg-bg-1"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <span
            className={clsx(
              "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
              lane === "ready" ? "bg-success text-white" : lane === "preparing" ? "bg-warning text-white" : "bg-danger text-white"
            )}
          >
            {lane}
          </span>
          {unpaid ? (
            <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              Unpaid · {inr(due)}
            </span>
          ) : (
            <span className="rounded-md bg-bg-1 px-2 py-0.5 text-[10px] font-bold uppercase text-text-secondary">Paid</span>
          )}
          <span
            className={clsx(
              "rounded-md px-2 py-0.5 text-[10px] font-bold tabular-nums",
              (order.ageSec ?? order.ageMin * 60) / 60 > (order.eta || 25)
                ? "bg-danger-bg text-danger"
                : (order.ageSec ?? order.ageMin * 60) / 60 >= (order.eta || 25) - 5
                  ? "bg-warning-bg text-warning"
                  : "bg-success-bg text-success"
            )}
          >
            {Math.max(1, Math.ceil((order.ageSec ?? order.ageMin * 60) / 60))}m elapsed
            {num(order.kotVersion) > 1 ? " · UPDATED" : ""}
          </span>
        </div>

        {(order.kitchenNote || order.notes) && (
          <div className="mt-3 rounded-lg bg-bg-1 px-3 py-2 text-[12px] text-text-secondary">
            Notes: {order.kitchenNote || order.notes}
          </div>
        )}

        <ul className="mt-3 space-y-2 border-t border-stroke-0 pt-3">
          {(order.items || []).map((l) => (
            <li key={l.lineId} className="flex items-start justify-between gap-2 text-[13px] text-text-primary">
              <div>
                <div className="font-semibold">
                  {l.qty}× {l.name}
                </div>
                {(l.kitchenNote || l.note) && (
                  <div className="text-[11px] font-medium text-warning">{l.kitchenNote || l.note}</div>
                )}
              </div>
              <div className="tabular-nums font-semibold">{inr(num(l.price) * num(l.qty))}</div>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex justify-between rounded-lg bg-primary-light px-3 py-2 text-[14px] font-bold text-text-primary">
          <span>Total</span>
          <span className="text-primary">{inr(order.total)}</span>
        </div>

        {platformKitchen ? (
          <div className="mt-4 rounded-xl border border-stroke-0 bg-bg-1 px-3 py-2 text-[12px] font-semibold text-text-secondary">
            Swiggy / Zomato · kitchen only — paid on the app. Enter weekly totals on Sales. Deliver when ready.
          </div>
        ) : null}

        {unpaid ? (
          <div className="mt-4 space-y-2 rounded-xl border border-primary/25 bg-primary-light/40 p-3">
            <div className="text-[12px] font-bold text-primary">
              Collect unpaid {inr(due)}
              {lane === "ready" ? " · then deliver" : ""}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["cash", "Cash"],
                  ["upi", "Online"],
                  ["split", "Split"]
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setPayMode(id);
                    if (id === "cash") {
                      setCashAmt(String(due));
                      setUpiAmt("");
                    } else if (id === "upi") {
                      setCashAmt("");
                      setUpiAmt(String(due));
                    } else {
                      setCashAmt(String(Math.floor(due / 2)));
                      setUpiAmt(String(due - Math.floor(due / 2)));
                    }
                  }}
                  className={clsx(
                    "rounded-lg px-2 py-2 text-[12px] font-semibold",
                    payMode === id ? "bg-primary text-white" : "border border-stroke-0 bg-card-0 text-text-secondary"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {payMode === "split" ? (
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  className="kg-input !py-2"
                  placeholder="Cash"
                  value={cashAmt}
                  onChange={(e) => setCashAmt(e.target.value)}
                />
                <input
                  type="number"
                  className="kg-input !py-2"
                  placeholder="Online / UPI"
                  value={upiAmt}
                  onChange={(e) => setUpiAmt(e.target.value)}
                />
              </div>
            ) : null}
            <button
              type="button"
              disabled={busy || !splitOk}
              className="kg-btn kg-btn-primary w-full disabled:opacity-50"
              onClick={submitCollect}
            >
              {payMode === "cash"
                ? `Collect cash ${inr(due)}`
                : payMode === "upi"
                  ? `Collect online ${inr(due)}`
                  : `Collect split ${inr(due)}`}
            </button>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {onShareWhatsApp ? (
            <button type="button" className="kg-btn kg-btn-secondary" disabled={busy} onClick={onShareWhatsApp}>
              WhatsApp bill
            </button>
          ) : null}
          <button type="button" className="kg-btn kg-btn-secondary" disabled={busy} onClick={onEdit}>
            Edit / add items
          </button>
          {lane !== "ready" ? (
            <button type="button" className="kg-btn kg-btn-primary" disabled={busy} onClick={onMarkReady}>
              Mark ready
            </button>
          ) : unpaid ? (
            <button type="button" className="kg-btn kg-btn-secondary" disabled title="Collect payment first">
              Deliver (pay first)
            </button>
          ) : (
            <button type="button" className="kg-btn kg-btn-primary" disabled={busy} onClick={onDeliver}>
              Mark delivered
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-stroke-0 pt-3">
          {!confirmCancel ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-danger hover:bg-danger-bg"
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
            >
              <X size={14} /> Cancel order
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-text-secondary">Cancel this order?</span>
              <button type="button" className="kg-btn kg-btn-primary !bg-danger !py-1.5 !text-[12px]" disabled={busy} onClick={onCancel}>
                Yes, cancel
              </button>
              <button type="button" className="kg-btn kg-btn-secondary !py-1.5 !text-[12px]" onClick={() => setConfirmCancel(false)}>
                No
              </button>
            </div>
          )}
          <button type="button" className="text-[12px] font-semibold text-text-muted" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
