export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function inr(v: unknown): string {
  const n = num(v);
  return `₹${n.toLocaleString("en-IN")}`;
}

/** Local calendar YYYY-MM-DD (not UTC — IST evenings must not shift the day). */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add calendar days to a YYYY-MM-DD string using local time. */
export function addDaysISO(iso: string, delta: number): string {
  const base = String(iso || "").slice(0, 10);
  const d = new Date(`${base}T12:00:00`);
  if (Number.isNaN(d.getTime())) return base;
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

export function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

