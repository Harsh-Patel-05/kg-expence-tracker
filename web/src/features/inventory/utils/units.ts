import { num } from "@/lib/utils";

/** Base factors to grams / ml / pieces for conversion math */
const TO_BASE: Record<string, { dim: "mass" | "volume" | "count"; factor: number }> = {
  g: { dim: "mass", factor: 1 },
  kg: { dim: "mass", factor: 1000 },
  ml: { dim: "volume", factor: 1 },
  l: { dim: "volume", factor: 1000 },
  pcs: { dim: "count", factor: 1 },
  piece: { dim: "count", factor: 1 },
  packet: { dim: "count", factor: 1 },
  box: { dim: "count", factor: 12 },
  dozen: { dim: "count", factor: 12 }
};

export type CustomConversion = { fromUnit: string; toUnit: string; factor: number; itemId?: string | null };

export function normalizeUnit(u?: string): string {
  return String(u || "pcs").trim().toLowerCase();
}

/** Convert qty from `fromUnit` to `toUnit`. Returns null if incompatible. */
export function convertQty(
  qty: number,
  fromUnit: string,
  toUnit: string,
  customs: CustomConversion[] = [],
  itemId?: string | null
): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return num(qty);

  const custom = customs.find(
    (c) =>
      normalizeUnit(c.fromUnit) === from &&
      normalizeUnit(c.toUnit) === to &&
      (!c.itemId || !itemId || c.itemId === itemId)
  );
  if (custom) return num(qty) * num(custom.factor);

  const reverse = customs.find(
    (c) =>
      normalizeUnit(c.fromUnit) === to &&
      normalizeUnit(c.toUnit) === from &&
      (!c.itemId || !itemId || c.itemId === itemId) &&
      num(c.factor) !== 0
  );
  if (reverse) return num(qty) / num(reverse.factor);

  const a = TO_BASE[from];
  const b = TO_BASE[to];
  if (!a || !b || a.dim !== b.dim) return null;
  const base = num(qty) * a.factor;
  return base / b.factor;
}

export function applyLoss(qty: number, prepLossPct = 0, cookLossPct = 0): number {
  const afterPrep = num(qty) * (1 + Math.max(0, prepLossPct) / 100);
  return afterPrep * (1 + Math.max(0, cookLossPct) / 100);
}

export const COMMON_UNITS = ["g", "kg", "ml", "l", "pcs", "packet", "box", "dozen"] as const;

export const DEFAULT_CONVERSIONS: CustomConversion[] = [
  { fromUnit: "kg", toUnit: "g", factor: 1000 },
  { fromUnit: "g", toUnit: "kg", factor: 0.001 },
  { fromUnit: "l", toUnit: "ml", factor: 1000 },
  { fromUnit: "ml", toUnit: "l", factor: 0.001 },
  { fromUnit: "dozen", toUnit: "pcs", factor: 12 },
  { fromUnit: "box", toUnit: "pcs", factor: 12 }
];
