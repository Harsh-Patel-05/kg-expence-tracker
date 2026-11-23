import { useMemo, useState } from "react";
import { inr, num } from "@/lib/utils";
import type { PaymentMode } from "../types";
import { usePosStore } from "../store/posStore";

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

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Payments</div>
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setAmount(String(due || t.total));
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${mode === m ? "bg-cyan-500 text-white" : "bg-white text-slate-700 border border-slate-200"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          type="number"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          type="button"
          className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
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
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
        placeholder="UPI / card reference (optional)"
        value={refNo}
        onChange={(e) => setRefNo(e.target.value)}
      />
      <div className="space-y-1">
        {payments.map((p) => (
          <div key={p.id} className="flex justify-between text-xs text-slate-600">
            <span className="capitalize">{p.mode}</span>
            <span className="font-semibold">{inr(p.amount)}</span>
          </div>
        ))}
        {!payments.length ? <div className="text-xs text-slate-400">No payments yet</div> : null}
      </div>
      <div className="flex gap-2">
        <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold" onClick={() => clearPayments()}>
          Clear
        </button>
        <button
          type="button"
          disabled={props.busy}
          className="flex-1 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
          onClick={() => void props.onCharge()}
        >
          {props.busy ? "Processing…" : `Charge ${inr(t.total)}`}
        </button>
      </div>
    </div>
  );
}
