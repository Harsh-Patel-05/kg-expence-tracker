import { useEffect, useMemo, useState } from "react";
import { Globe } from "lucide-react";
import { clsx } from "clsx";
import { usePosAuth } from "../auth/PosAuthProvider";
import {
  resolveOnlineOrderingEnabled,
  setOnlineOrderingAuto,
  setOnlineOrderingManual,
  subscribeOnlineOrderingSettings,
  type OnlineOrderingSettings
} from "@/features/orders/services/onlineOrderingSettings";

export function PosOnlineOrderingSwitch() {
  const { user } = usePosAuth();
  const [settings, setSettings] = useState<OnlineOrderingSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = subscribeOnlineOrderingSettings(
      (s) => {
        setSettings(s);
        setError("");
      },
      (e) => setError(e.message || "Could not load online ordering")
    );
    return unsub;
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const resolved = useMemo(() => resolveOnlineOrderingEnabled(settings), [settings, tick]);

  const onToggle = async () => {
    setBusy(true);
    setError("");
    try {
      // Flip effective state via manual override
      await setOnlineOrderingManual(!resolved.enabled, user?.uid || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const onAuto = async () => {
    setBusy(true);
    setError("");
    try {
      await setOnlineOrderingAuto(user?.uid || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={clsx(
        "flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-1.5",
        resolved.enabled
          ? "border-success/40 bg-success-bg/50"
          : "border-danger/35 bg-danger-bg/40"
      )}
      title="Controls website online ordering"
    >
      <Globe size={14} className={resolved.enabled ? "text-success" : "text-danger"} aria-hidden />
      <div className="min-w-0 leading-tight">
        <div className="text-[11px] font-bold text-text-primary">Online orders</div>
        <div className="truncate text-[10px] text-text-muted">{resolved.detail}</div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={resolved.enabled}
        aria-label={resolved.enabled ? "Turn off online orders" : "Turn on online orders"}
        disabled={busy}
        onClick={() => void onToggle()}
        className={clsx(
          "relative h-7 w-12 shrink-0 rounded-full transition",
          resolved.enabled ? "bg-success" : "bg-text-muted/40"
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition",
            resolved.enabled && "translate-x-5"
          )}
        />
      </button>

      {settings?.mode === "manual" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAuto()}
          className="rounded-lg px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary-light"
        >
          Follow hours
        </button>
      ) : null}

      {error ? <span className="w-full text-[10px] text-danger">{error}</span> : null}
    </div>
  );
}
