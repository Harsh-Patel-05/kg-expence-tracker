import { useState } from "react";
import { clsx } from "clsx";
import { inr } from "@/lib/utils";
import { usePosStore } from "../store/posStore";
import { LoadingLabel } from "@/components/ui/Loading";

type SettleMode = "cash" | "upi" | "split" | "paylater";

export function PaymentPanel(props: {
  onCharge: () => Promise<void>;
  onPayLater: () => Promise<void>;
  busy: boolean;
}) {
  const addPayment = usePosStore((s) => s.addPayment);
  const clearPayments = usePosStore((s) => s.clearPayments);
  const orderType = usePosStore((s) => s.orderType);
  const platformOrderId = usePosStore((s) => s.platformOrderId);
  const totals = usePosStore((s) => s.totals);
  const t = totals();
  const [mode, setMode] = useState<SettleMode>("cash");
  const [cashAmt, setCashAmt] = useState("");
  const [upiAmt, setUpiAmt] = useState("");

  const due = t.balance || t.total;
  const needsPlatformId = orderType === "swiggy" || orderType === "zomato";
  const platformOk = !needsPlatformId || Boolean(String(platformOrderId || "").trim());
  const platformLabel = orderType === "zomato" ? "Zomato" : "Swiggy";

  function applyModePayments() {
    clearPayments();
    if (mode === "paylater") return;
    if (mode === "cash") {
      if (due > 0) addPayment("cash", due);
      return;
    }
    if (mode === "upi") {
      if (due > 0) addPayment("upi", due);
      return;
    }
    const cash = Math.max(0, Number(cashAmt) || 0);
    const upi = Math.max(0, Number(upiAmt) || 0);
    if (cash > 0) addPayment("cash", cash);
    if (upi > 0) addPayment("upi", upi);
  }

  async function charge() {
    if (needsPlatformId) {
      // Kitchen prep only — never posts sales / cash / online balance
      clearPayments();
      await props.onCharge();
      return;
    }
    if (mode === "paylater") {
      await props.onPayLater();
      return;
    }
    applyModePayments();
    await props.onCharge();
  }

  if (needsPlatformId) {
    return (
      <div className="space-y-2 bg-card-0">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Kitchen only</div>
        <p className="text-[12px] leading-snug text-text-secondary">
          {platformLabel} tickets go to KDS only. Sales are entered manually every week — not counted in shop balance.
        </p>
        <button
          type="button"
          disabled={props.busy || t.total <= 0 || !platformOk}
          className="kg-btn kg-btn-primary w-full !py-3 !text-[14px] disabled:opacity-60"
          title={!platformOk ? `Enter ${platformLabel} order ID first` : undefined}
          onClick={() => void charge()}
        >
          {props.busy ? (
            <LoadingLabel>Sending…</LoadingLabel>
          ) : !platformOk ? (
            `Enter ${platformLabel} ID`
          ) : (
            `Send to kitchen · ${inr(t.total)}`
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 bg-card-0">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Payment</div>

      <div className="grid grid-cols-4 gap-1.5">
        {(
          [
            ["cash", "Cash"],
            ["upi", "UPI"],
            ["split", "Split"],
            ["paylater", "Pay later"]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              clearPayments();
            }}
            className={clsx(
              "rounded-lg px-1.5 py-2 text-[11px] font-semibold",
              mode === id
                ? "bg-primary text-white"
                : "border border-stroke-0 bg-bg-1 text-text-secondary hover:border-primary/40"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "split" ? (
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="number"
            className="kg-input !py-2"
            placeholder={`Cash · due ${inr(due)}`}
            value={cashAmt}
            onChange={(e) => setCashAmt(e.target.value)}
          />
          <input
            type="number"
            className="kg-input !py-2"
            placeholder="UPI"
            value={upiAmt}
            onChange={(e) => setUpiAmt(e.target.value)}
          />
        </div>
      ) : null}

      <button
        type="button"
        disabled={props.busy || t.total <= 0 || !platformOk}
        className="kg-btn kg-btn-primary w-full !py-3 !text-[14px] disabled:opacity-60"
        onClick={() => void charge()}
      >
        {props.busy ? (
          <LoadingLabel>Processing…</LoadingLabel>
        ) : mode === "paylater" ? (
          `Send to kitchen · ${inr(t.total)}`
        ) : (
          `Settle ${inr(t.total)}`
        )}
      </button>
    </div>
  );
}
