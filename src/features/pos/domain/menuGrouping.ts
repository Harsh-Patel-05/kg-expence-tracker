import { num } from "@/lib/utils";
import type { DietType, MenuItemDoc } from "../types";
import type { WithId } from "../hooks/useRestaurantCollection";

export type MenuVariant = WithId<MenuItemDoc> & {
  sizeLabel: string;
  weightGrams: number | null;
};

export type MenuGroup = {
  key: string;
  baseName: string;
  nameHi?: string;
  category: string;
  imageUrl?: string;
  diet?: DietType;
  favorite?: boolean;
  minPrice: number;
  variants: MenuVariant[];
};

function normalize(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s\u0900-\u097F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPunjabiCategory(cat?: string): boolean {
  return normalize(cat || "") === "punjabi";
}

/** Standalone “extra sabji” SKUs — hide from POS grid. */
export function isExtraSabjiItem(name?: string): boolean {
  const n = normalize(name || "");
  if (!n) return false;
  return (
    /^extra\s+sabj/i.test(n) ||
    /^extras?\s+sabj/i.test(n) ||
    /^extra\s+subji/i.test(n) ||
    /^add\s+on\s+sabj/i.test(n) ||
    /^sabji\s+extra\b/i.test(n)
  );
}

export function deriveBaseAndVariant(name: string): { base: string; variant: string } {
  const raw = String(name || "").trim();
  const m =
    raw.match(/\((\s*\d+(?:\.\d+)?\s*(?:kg|g|gm|gms)\s*)\)\s*$/i) ||
    raw.match(/(?:-|–|—)\s*(\d+(?:\.\d+)?\s*(?:kg|g|gm|gms))\s*$/i) ||
    raw.match(/\s(\d+(?:\.\d+)?\s*(?:kg|g|gm|gms))\s*$/i) ||
    raw.match(/\((Option\s*\d+)\)\s*$/i) ||
    raw.match(/\(([^)]{1,24})\)\s*$/i);
  let variant = "";
  let base = raw;
  if (m) {
    variant = String(m[1] || "").trim().replace(/\s+/g, " ");
    base = raw.replace(m[0], "").trim().replace(/\s+/g, " ");
  }
  return { base: base || raw, variant };
}

export function weightGramsFromLabel(label: string): number | null {
  const s = String(label || "").trim();
  if (!s || /^default$/i.test(s)) return null;
  if (/^1$/i.test(s)) return 500;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(kg|gms|gm|g|किलो|kg\.|ग्राम|gm\.)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = String(m[2] || "g").toLowerCase();
  if (u === "kg" || u === "kg." || u === "किलो") return Math.round(n * 1000);
  return Math.round(n);
}

export function shortSizeLabel(label: string): string {
  const raw = String(label || "").trim();
  if (!raw) return "Regular";
  const g = weightGramsFromLabel(raw);
  if (g != null && g > 0) {
    if (g % 1000 === 0) return `${g / 1000} kg`;
    if (g >= 1000) return `${Math.round((g / 1000) * 100) / 100} kg`;
    return `${g} g`;
  }
  return raw;
}

function stripSizeFromHi(nameHi?: string): string {
  if (!nameHi) return "";
  const { base } = deriveBaseAndVariant(nameHi);
  return base || nameHi;
}

export function groupMenuItems(items: WithId<MenuItemDoc>[]): MenuGroup[] {
  const map = new Map<string, MenuGroup>();

  for (const item of items) {
    if (item.available === false) continue;
    if (isExtraSabjiItem(item.name)) continue;
    const category = String(item.category || "General");
    const { base, variant } = deriveBaseAndVariant(item.name);
    const sizeLabel = shortSizeLabel(variant) || (variant ? variant : "Regular");
    const key = `${normalize(category)}@@${normalize(base)}`;
    const variantRow: MenuVariant = {
      ...item,
      sizeLabel,
      weightGrams: weightGramsFromLabel(variant || sizeLabel)
    };

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        baseName: base,
        nameHi: stripSizeFromHi(item.nameHi),
        category,
        imageUrl: item.imageUrl,
        diet: item.diet,
        favorite: Boolean(item.favorite),
        minPrice: num(item.price),
        variants: [variantRow]
      });
      continue;
    }

    const dup = existing.variants.some(
      (v) =>
        normalize(v.sizeLabel) === normalize(sizeLabel) && num(v.price) === num(item.price)
    );
    if (dup) continue;
    existing.variants.push(variantRow);
    existing.minPrice = Math.min(existing.minPrice, num(item.price));
    if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl;
    if (!existing.nameHi && item.nameHi) existing.nameHi = stripSizeFromHi(item.nameHi);
    if (item.favorite) existing.favorite = true;
  }

  for (const g of map.values()) {
    g.variants.sort((a, b) => {
      const wa = a.weightGrams ?? Number.POSITIVE_INFINITY;
      const wb = b.weightGrams ?? Number.POSITIVE_INFINITY;
      if (wa !== wb) return wa - wb;
      return num(a.price) - num(b.price);
    });
    g.minPrice = g.variants.reduce((m, v) => Math.min(m, num(v.price)), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(g.minPrice)) g.minPrice = 0;
  }

  return [...map.values()].sort((a, b) => a.baseName.localeCompare(b.baseName));
}

export function findGroupForMenuItem(
  groups: MenuGroup[],
  item: WithId<MenuItemDoc>
): MenuGroup | null {
  const category = String(item.category || "General");
  const { base } = deriveBaseAndVariant(item.name);
  const key = `${normalize(category)}@@${normalize(base)}`;
  return groups.find((g) => g.key === key) || null;
}
