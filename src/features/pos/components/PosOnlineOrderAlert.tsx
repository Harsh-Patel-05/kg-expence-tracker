import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query
} from "firebase/firestore";
import { Bike, Check, Globe, Phone, Store, XCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { inr, num } from "@/lib/utils";
import {
  acceptOnlineOrder,
  ensureKitchenOrderFromOnline,
  rejectOnlineOrder,
  type OnlineOrderDoc
} from "@/features/orders/services/onlineOrderBridge";
import {
  installOnlineOrderSoundAutoUnlock,
  onOnlineOrderSoundArmed,
  playOnlineOrderAlert,
  unlockOnlineOrderSound
} from "@/features/pos/utils/onlineOrderSound";

function addressLine(o: OnlineOrderDoc) {
  const a = o.deliveryAddress;
  if (!a) return "Pickup at restaurant";
  return [a.flat, a.society, a.area, a.landmark].filter(Boolean).join(", ") || "Delivery";
}

export function PosOnlineOrderAlert() {
  const [orders, setOrders] = useState<OnlineOrderDoc[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [etaMin, setEtaMin] = useState(40);
  const [confirmReject, setConfirmReject] = useState(false);
  const seenPlaced = useRef<Set<string>>(new Set());
  const lastPhraseAt = useRef(0);

  // Unlock early (also installed at App root on login)
  useEffect(() => {
    installOnlineOrderSoundAutoUnlock();
    void unlockOnlineOrderSound();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "onlineOrders"), orderBy("createdAtIso", "desc"), limit(80));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OnlineOrderDoc, "id">) }));
        setOrders(rows);

        for (const o of rows) {
          if (["confirmed", "preparing", "ready", "out_for_delivery"].includes(o.orderStatus || "")) {
            // Creates if missing + cancels accidental duplicate kitchen tickets
            void ensureKitchenOrderFromOnline(o).catch(() => undefined);
          }
        }
      },
      (err) => setError(err.message || "Could not listen for online orders")
    );
    return unsub;
  }, []);

  const placed = useMemo(
    () => orders.filter((o) => (o.orderStatus || "placed") === "placed"),
    [orders]
  );

  useEffect(() => {
    if (!placed.length) {
      setIndex(0);
      setConfirmReject(false);
      return;
    }
    setIndex((i) => Math.min(i, placed.length - 1));
    setConfirmReject(false);
  }, [placed.length]);

  const ringPhrase = () => {
    playOnlineOrderAlert("phrase");
    lastPhraseAt.current = Date.now();
  };

  // New order → loud phrase immediately (queues if browser still blocked)
  useEffect(() => {
    for (const o of placed) {
      if (!seenPlaced.current.has(o.id)) {
        seenPlaced.current.add(o.id);
        void unlockOnlineOrderSound().then((ok) => {
          if (ok) ringPhrase();
          else {
            // Still queues inside playOnlineOrderAlert until login/POS gesture arms audio
            playOnlineOrderAlert("phrase");
            lastPhraseAt.current = Date.now();
          }
        });
      }
    }
  }, [placed]);

  // When audio finally arms (after earlier login/click), ring if orders are waiting
  useEffect(() => {
    return onOnlineOrderSoundArmed(() => {
      if (!placed.length) return;
      if (Date.now() - lastPhraseAt.current < 800) return;
      ringPhrase();
    });
  }, [placed.length]);

  // Keep loud ping until accept/reject
  useEffect(() => {
    if (!placed.length) return undefined;
    const tick = () => {
      void unlockOnlineOrderSound().then(() => playOnlineOrderAlert("ping"));
    };
    const first = window.setTimeout(tick, 1600);
    const id = window.setInterval(tick, 2500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [placed.length]);

  // Modal open → try phrase once audio is ready
  useEffect(() => {
    if (!placed.length) return;
    void unlockOnlineOrderSound().then((ok) => {
      if (!ok) {
        playOnlineOrderAlert("phrase");
        return;
      }
      if (Date.now() - lastPhraseAt.current > 1200) ringPhrase();
    });
  }, [placed.length > 0]);

  const current = placed[index] || null;

  const onAccept = async () => {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      void unlockOnlineOrderSound();
      await acceptOnlineOrder({ onlineOrderId: current.id, etaMaxMin: etaMin });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setBusy(false);
    }
  };

  const onReject = async () => {
    if (!current) return;
    if (!confirmReject) {
      setConfirmReject(true);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await rejectOnlineOrder({
        onlineOrderId: current.id,
        reason: "Rejected from POS"
      });
      setConfirmReject(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  };

  if (!placed.length || !current) return null;

  const itemCount = (current.items || []).reduce((s, it) => s + (num(it.qty) || 1), 0);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center"
      role="alertdialog"
      aria-modal="true"
      aria-label="New website order"
      onPointerDown={() => void unlockOnlineOrderSound()}
    >
      <div className="absolute inset-0 bg-[color:var(--rp-overlay)] backdrop-blur-[2px]" />
      <div className="relative z-[1] w-full max-w-lg overflow-hidden rounded-2xl border-2 border-primary bg-card-0 shadow-float">
        <div className="flex items-center justify-between gap-2 border-b border-stroke-0 bg-primary px-4 py-3 text-white">
          <div className="flex items-center gap-2 font-bold">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            New website order
            {placed.length > 1 ? (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                {index + 1}/{placed.length}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary">
                <Globe size={13} /> Website · {current.orderType === "pickup" ? "Pickup" : "Delivery"}
              </div>
              <h3 className="mt-0.5 truncate text-[18px] font-bold">{current.orderId || current.id}</h3>
              <p className="text-[12px] text-text-muted">
                {current.customer?.fullName || "Guest"}
                {current.customer?.mobile ? ` · ${current.customer.mobile}` : ""}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[22px] font-bold tabular-nums">{inr(current.pricing?.total || 0)}</div>
              <div className="text-[11px] text-text-muted">
                {itemCount} item{itemCount === 1 ? "" : "s"} · {String(current.paymentMethod || "cod").toUpperCase()}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-stroke-0 bg-bg-0 px-3 py-2.5 text-[13px]">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
              {current.orderType === "pickup" ? <Store size={12} /> : <Bike size={12} />}
              {current.orderType === "pickup" ? "Pickup" : "Deliver to"}
            </div>
            <div className="leading-snug text-text-secondary">{addressLine(current)}</div>
            {current.distanceKm != null ? (
              <div className="mt-1 text-[11px] text-text-muted">{current.distanceKm} km</div>
            ) : null}
          </div>

          <ul className="max-h-36 overflow-auto rounded-xl border border-stroke-0 text-[13px]">
            {(current.items || []).map((it, i) => (
              <li
                key={`${it.name}-${i}`}
                className="flex justify-between gap-2 border-b border-stroke-0 px-3 py-2 last:border-b-0"
              >
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{it.qty}×</span> {it.name}
                  {it.optionLabel ? <span className="text-text-muted"> · {it.optionLabel}</span> : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {inr(it.lineTotal ?? it.unitPrice * it.qty)}
                </span>
              </li>
            ))}
          </ul>

          <label className="inline-flex items-center gap-2 text-[12px] text-text-muted">
            ETA max
            <input
              type="number"
              min={20}
              max={120}
              value={etaMin}
              onChange={(e) => setEtaMin(Number(e.target.value) || 40)}
              className="kg-input !h-8 !w-[72px] !px-2 !text-[13px]"
            />
            min
          </label>

          {error ? <div className="rounded-lg bg-danger-bg px-3 py-2 text-[12px] text-danger">{error}</div> : null}

          {confirmReject ? (
            <div className="grid gap-2 rounded-xl border border-danger/35 bg-danger-bg/50 p-3">
              <p className="text-[13px] font-semibold text-danger">
                Reject this order? Customer tracking will show Rejected.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="kg-btn kg-btn-primary flex-1 !bg-danger hover:!opacity-90"
                  onClick={() => void onReject()}
                >
                  <XCircle size={16} /> Yes, reject
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="kg-btn kg-btn-secondary"
                  onClick={() => setConfirmReject(false)}
                >
                  Keep order
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className="kg-btn kg-btn-primary flex-1"
                onClick={() => void onAccept()}
              >
                <Check size={16} /> Accept → Kitchen
              </button>
              <button
                type="button"
                disabled={busy}
                className="kg-btn kg-btn-secondary"
                onClick={() => void onReject()}
              >
                <XCircle size={16} /> Reject
              </button>
              {current.customer?.mobile ? (
                <a className="kg-btn kg-btn-ghost" href={`tel:${current.customer.mobile}`}>
                  <Phone size={16} /> Call
                </a>
              ) : null}
            </div>
          )}

          {placed.length > 1 ? (
            <div className="flex justify-between gap-2">
              <button
                type="button"
                className="text-[12px] font-semibold text-primary disabled:opacity-40"
                disabled={index <= 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                ← Prev
              </button>
              <button
                type="button"
                className="text-[12px] font-semibold text-primary disabled:opacity-40"
                disabled={index >= placed.length - 1}
                onClick={() => setIndex((i) => Math.min(placed.length - 1, i + 1))}
              >
                Next →
              </button>
            </div>
          ) : null}

          <p className="text-center text-[11px] text-text-muted">
            Alert sound plays automatically until you Accept or Reject.
          </p>
        </div>
      </div>
    </div>
  );
}
