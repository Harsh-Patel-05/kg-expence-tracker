import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auditUpdate } from "@/features/pos/services/posFirestore";

export const ONLINE_ORDERING_DOC = "settings/onlineOrdering";

/** IST schedule — same as website (11:00–14:50 & 18:00–23:00). */
export const ONLINE_ORDER_SLOTS = [
  { open: 11 * 60, close: 14 * 60 + 50, openLabel: "11 AM", closeLabel: "2:50 PM" },
  { open: 18 * 60, close: 23 * 60, openLabel: "6 PM", closeLabel: "11 PM" }
] as const;

export type OnlineOrderingMode = "auto" | "manual";

export type OnlineOrderingSettings = {
  mode: OnlineOrderingMode;
  /** Used only when mode === "manual" */
  manualEnabled: boolean;
  updatedAtIso?: string;
  updatedBy?: string | null;
  note?: string;
};

const DEFAULTS: OnlineOrderingSettings = {
  mode: "auto",
  manualEnabled: false
};

function minutesNowIST(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export function isWithinOnlineOrderSchedule(now = new Date()) {
  const m = minutesNowIST(now);
  return ONLINE_ORDER_SLOTS.some((s) => m >= s.open && m < s.close);
}

export function scheduleDetail(now = new Date()) {
  const m = minutesNowIST(now);
  const current = ONLINE_ORDER_SLOTS.find((s) => m >= s.open && m < s.close);
  if (current) return `Open until ${current.closeLabel}`;
  const next = ONLINE_ORDER_SLOTS.find((s) => m < s.open);
  if (next) return `Opens at ${next.openLabel}`;
  return `Opens tomorrow at ${ONLINE_ORDER_SLOTS[0].openLabel}`;
}

export function resolveOnlineOrderingEnabled(
  settings: OnlineOrderingSettings | null | undefined,
  now = new Date()
) {
  const s = settings || DEFAULTS;
  if (s.mode === "manual") {
    return {
      enabled: Boolean(s.manualEnabled),
      mode: "manual" as const,
      scheduleOpen: isWithinOnlineOrderSchedule(now),
      detail: s.manualEnabled ? "Manual · accepting orders" : "Manual · paused"
    };
  }
  const scheduleOpen = isWithinOnlineOrderSchedule(now);
  return {
    enabled: scheduleOpen,
    mode: "auto" as const,
    scheduleOpen,
    detail: scheduleOpen ? `Auto · ${scheduleDetail(now)}` : `Auto · closed (${scheduleDetail(now)})`
  };
}

export function normalizeOnlineOrderingSettings(raw: Partial<OnlineOrderingSettings> | null | undefined): OnlineOrderingSettings {
  if (!raw) return { ...DEFAULTS };
  return {
    mode: raw.mode === "manual" ? "manual" : "auto",
    manualEnabled: Boolean(raw.manualEnabled),
    updatedAtIso: raw.updatedAtIso,
    updatedBy: raw.updatedBy ?? null,
    note: raw.note
  };
}

export async function getOnlineOrderingSettings(): Promise<OnlineOrderingSettings> {
  const snap = await getDoc(doc(db, "settings", "onlineOrdering"));
  if (!snap.exists()) return { ...DEFAULTS };
  return normalizeOnlineOrderingSettings(snap.data() as Partial<OnlineOrderingSettings>);
}

export function subscribeOnlineOrderingSettings(
  onData: (s: OnlineOrderingSettings) => void,
  onError?: (e: Error) => void
) {
  return onSnapshot(
    doc(db, "settings", "onlineOrdering"),
    (snap) => {
      if (!snap.exists()) {
        onData({ ...DEFAULTS });
        return;
      }
      onData(normalizeOnlineOrderingSettings(snap.data() as Partial<OnlineOrderingSettings>));
    },
    (err) => onError?.(err)
  );
}

export async function setOnlineOrderingManual(enabled: boolean, updatedBy?: string | null) {
  const payload: OnlineOrderingSettings = {
    mode: "manual",
    manualEnabled: enabled,
    updatedAtIso: new Date().toISOString(),
    updatedBy: updatedBy || null,
    note: enabled ? "Manually opened from POS" : "Manually closed from POS"
  };
  await setDoc(doc(db, "settings", "onlineOrdering"), { ...payload, ...auditUpdate() }, { merge: true });
  return payload;
}

export async function setOnlineOrderingAuto(updatedBy?: string | null) {
  const payload: OnlineOrderingSettings = {
    mode: "auto",
    manualEnabled: false,
    updatedAtIso: new Date().toISOString(),
    updatedBy: updatedBy || null,
    note: "Following restaurant hours"
  };
  await setDoc(doc(db, "settings", "onlineOrdering"), { ...payload, ...auditUpdate() }, { merge: true });
  return payload;
}
