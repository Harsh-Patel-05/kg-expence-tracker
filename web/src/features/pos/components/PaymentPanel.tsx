import { useMemo, useState } from "react";
import { inr, num } from "@/lib/utils";
import type { PaymentMode } from "../types";
import { usePosStore } from "../store/posStore";
import { LoadingLabel } from "@/components/ui/Loading";

const MODES: PaymentMode[] = ["cash", "upi", "card", "wallet", "bank", "credit"];

export function PaymentPanel(props: { onCharge: () => Promise<void>; busy: boolean }) {
  const payments = usePosStore((s) => s.payments);
  const addPayment = usePosStore((s) => s.addPayment);
  const clearPayments = usePosStore((s) => s.clearPayments);
  const totals = usePosStore((s) => s.totals);
  const t = totals();
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [amount, setAmount] = useState("");
  const [refNo, setRefNo] = useState("");

  const due = useMemo(() => t.balance, [t.balance]);

  function quickPay(m: PaymentMode) {
    setMode(m);
    const a = due || t.total;
    if (a > 0) {
      addPayment(m, a);
      setAmount("");
    } else {
      setAmount(String(a || ""));
    }
  }

  return (
    <div className="space-y-2 bg-card-0">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Payments</div>
        {payments.length ? (
          <button type="button" className="text-[11px] font-semibold text-danger hover:underline" onClick={() => clearPayments()}>
            Clear pays
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => quickPay(m)}
            className={
              mode === m
                ? "rounded-lg bg-primary px-1.5 py-2 text-[11px] font-semibold capitalize text-white"
                : "rounded-lg border border-stroke-0 bg-bg-1 px-1.5 py-2 text-[11px] font-semibold capitalize text-text-secondary hover:border-primary/40"
            }
          >
            {m}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <input
          type="number"
          className="kg-input !py-2"
          placeholder={`Amount · due ${inr(due || t.total)}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          type="button"
          className="kg-btn kg-btn-secondary"
          onClick={() => {
            const a = num(amount);
            if (a <= 0) return;
            addPayment(mode, a, refNo || undefined);
            setAmount("");
            setRefNo("");
          }}
        >
          Add
        </button>
      </div>

      <input
        className="kg-input !py-1.5 !text-[12px]"
        placeholder="UPI / card reference (optional)"
        value={refNo}
        onChange={(e) => setRefNo(e.target.value)}
      />

      {payments.length ? (
        <div className="flex flex-wrap gap-1.5">
          {payments.map((p) => (
            <span key={p.id} className="rounded-md bg-bg-1 px-2 py-1 text-[11px] font-semibold capitalize text-text-secondary">
              {p.mode} {inr(p.amount)}
            </span>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        disabled={props.busy || t.total <= 0}
        className="kg-btn kg-btn-primary w-full !py-3 !text-[14px] disabled:opacity-60"
        onClick={() => void props.onCharge()}
      >
        {props.busy ? <LoadingLabel>Processing…</LoadingLabel> : `Charge ${inr(t.total)}`}
      </button>
    </div>
  );
}
