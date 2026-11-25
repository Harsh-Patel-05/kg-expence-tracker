import { expectedPrepMinutes } from "../engine/statusMachine";
import { num } from "@/lib/utils";

export type OrderTiming = {
  createdMs: number;
  etaMin: number;
  dueMs: number;
  /** Seconds left until target ready (negative = overdue) */
  remainSec: number;
  ageSec: number;
  delayed: boolean;
  /** 0 = most urgent */
  priority: number;
};

function parseMs(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && v && "toMillis" in (v as object)) {
    try {
      return (v as { toMillis: () => number }).toMillis();
    } catch {
      /* ignore */
    }
  }
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

export function orderCreatedMs(o: {
  acceptedAt?: unknown;
  heldAt?: unknown;
  preparingAt?: unknown;
  createdAt?: unknown;
  confirmedAt?: unknown;
}): number {
  return (
    parseMs(o.acceptedAt) ||
    parseMs(o.heldAt) ||
    parseMs(o.preparingAt) ||
    parseMs(o.createdAt) ||
    parseMs(o.confirmedAt) ||
    Date.now()
  );
}

export function computeOrderTiming(
  o: {
    orderType?: string;
    items?: Array<{ qty?: number }>;
    itemCount?: number;
    expectedReadyAt?: unknown;
    etaMinutes?: number;
    acceptedAt?: unknown;
    heldAt?: unknown;
    preparingAt?: unknown;
    createdAt?: unknown;
    confirmedAt?: unknown;
    delayed?: boolean;
    status?: string;
    kitchenStatus?: string;
  },
  nowMs = Date.now()
): OrderTiming {
  const itemCount =
    o.itemCount != null
      ? num(o.itemCount)
      : (o.items || []).reduce((s, l) => s + num(l.qty), 0);
  const etaMin = Math.max(1, num(o.etaMinutes) || expectedPrepMinutes(String(o.orderType || "takeaway"), itemCount));
  const createdMs = orderCreatedMs(o);
  const dueMs = parseMs(o.expectedReadyAt) || createdMs + etaMin * 60_000;
  const remainSec = Math.round((dueMs - nowMs) / 1000);
  const ageSec = Math.max(0, Math.round((nowMs - createdMs) / 1000));
  const active = !["served", "completed", "delivered", "cancelled", "rejected"].includes(
    String(o.status || "").toLowerCase()
  );
  const delayed = Boolean(o.delayed) || (active && remainSec < 0);
  // Priority: overdue first, then least time remaining
  const priority = delayed ? remainSec : 10_000 + remainSec;
  return { createdMs, etaMin, dueMs, remainSec, ageSec, delayed, priority };
}

/** Elapsed minutes counting UP from 1 (kitchen age clock). */
export function elapsedMinutesUp(ageSec: number): number {
  return Math.max(1, Math.ceil(Math.max(0, ageSec) / 60));
}

export function formatElapsedLabel(ageSec: number, lang: "hi" | "en" = "en"): string {
  const m = elapsedMinutesUp(ageSec);
  return lang === "hi" ? `${m} मि` : `${m}m`;
}

/** Tone from elapsed vs target ETA minutes. */
export function elapsedTone(ageSec: number, etaMin: number): "ok" | "warn" | "late" {
  const m = elapsedMinutesUp(ageSec);
  const eta = Math.max(1, etaMin || 25);
  if (m > eta) return "late";
  if (m >= Math.max(1, eta - 5)) return "warn";
  return "ok";
}

/** Reverse countdown mm:ss (Swiggy/Zomato 18‑min clock). */
export function formatCountdown(remainSec: number): string {
  const late = remainSec < 0;
  const abs = Math.abs(remainSec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const body = `${m}:${String(s).padStart(2, "0")}`;
  return late ? `-${body}` : body;
}

export function formatCountdownLabel(remainSec: number, lang: "hi" | "en" = "en"): string {
  if (remainSec < 0) {
    return lang === "hi" ? `${formatCountdown(remainSec)} देर` : `${formatCountdown(remainSec)} late`;
  }
  return lang === "hi" ? `${formatCountdown(remainSec)} बाकी` : `${formatCountdown(remainSec)} left`;
}

export function countdownTone(remainSec: number): "ok" | "warn" | "late" {
  if (remainSec < 0) return "late";
  if (remainSec <= 5 * 60) return "warn";
  return "ok";
}
