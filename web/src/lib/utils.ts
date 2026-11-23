export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function inr(v: unknown): string {
  const n = num(v);
  return `₹${n.toLocaleString("en-IN")}`;
}

export function isoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

