export type SizeExtra = number | Record<string, number>;

export type ProductOption = { id: string; label: string; extra?: SizeExtra };
export type ProductGroup = { id: string; label: string; options: ProductOption[] };
export type ProductAddon = { id: string; label: string; extra?: SizeExtra };
export type ProductSize = { id: string; label: string };

export type CatalogProduct = {
  id: string;
  name: string;
  /** Hindi kitchen / KDS name (same as POS menu nameHi) */
  nameHi?: string;
  categories: string[];
  favourite?: boolean;
  gradient?: [string, string];
  image?: string;
  sizes: ProductSize[];
  defaultSize: string;
  basePrice: Record<string, number>;
  groups?: ProductGroup[];
  addons?: ProductAddon[];
  aliases?: string[];
};

export type ProductSelection = {
  productId: string;
  size: string;
  options: Record<string, string>;
  addons: string[];
  qty: number;
  note?: string;
};

export function resolveExtra(extra: SizeExtra | undefined, sizeId: string): number {
  if (extra == null) return 0;
  if (typeof extra === "number") return Number(extra) || 0;
  const v = extra[sizeId];
  return v == null ? 0 : Number(v) || 0;
}

function findOption(group: ProductGroup, optionId: string) {
  return group?.options?.find((o) => o.id === optionId) || null;
}

export function unitPrice(product: CatalogProduct, selection: ProductSelection): number {
  if (!product || !selection) return 0;
  const size = String(selection.size || product.defaultSize || "");
  let total = Number((product.basePrice && product.basePrice[size]) || 0) || 0;
  const opts = selection.options || {};
  (product.groups || []).forEach((g) => {
    const oid = opts[g.id];
    const opt = findOption(g, oid) || (g.options && g.options[0]) || null;
    if (opt) total += resolveExtra(opt.extra, size);
  });
  const addons = Array.isArray(selection.addons) ? selection.addons : [];
  (product.addons || []).forEach((a) => {
    if (addons.indexOf(a.id) >= 0) total += resolveExtra(a.extra, size);
  });
  return total;
}

export function lineTotal(product: CatalogProduct, selection: ProductSelection): number {
  const qty = Math.max(1, Math.floor(Number(selection?.qty) || 1));
  return unitPrice(product, selection) * qty;
}

function sortedJoin(arr: string[]) {
  return (arr || []).map(String).filter(Boolean).sort().join(",");
}

export function cartLineKey(selection: Partial<ProductSelection> & { productId?: string }): string {
  const s = selection || {};
  const optPairs = Object.keys(s.options || {})
    .sort()
    .map((k) => `${k}:${(s.options as Record<string, string>)[k]}`);
  return [String(s.productId || ""), String(s.size || ""), optPairs.join(","), sortedJoin(s.addons || [])].join("|");
}

export function sizeLabel(product: CatalogProduct, sizeId: string): string {
  const s = (product.sizes || []).find((x) => x.id === sizeId);
  return (s && s.label) || sizeId || "";
}

const ALWAYS_PRINT_OPTION = new Set([
  "dry",
  "gravy",
  "noodles",
  "fried_rice",
  "jain",
  "swaminarayan",
  "dry_fruit",
  "kashmiri",
  "special",
  "paneer"
]);

function isDefaultOption(group: ProductGroup, optionId: string) {
  const first = group?.options?.[0];
  return Boolean(first && first.id === optionId);
}

export function formatLineParts(product: CatalogProduct, selection: ProductSelection) {
  if (!product || !selection) return { head: "", sub: "", billOpts: [] as string[], addonLabels: [] as string[] };
  const sz = sizeLabel(product, selection.size);
  const head = sz ? `${product.name} ${sz}` : product.name;
  const opts = selection.options || {};
  const addonLabels: string[] = [];
  const addons = Array.isArray(selection.addons) ? selection.addons : [];
  (product.addons || []).forEach((a) => {
    if (addons.indexOf(a.id) >= 0) addonLabels.push(a.label);
  });
  const billOpts: string[] = [];
  (product.groups || []).forEach((g) => {
    const oid = opts[g.id];
    const opt = findOption(g, oid);
    if (!opt) return;
    if (g.id === "dish" || ALWAYS_PRINT_OPTION.has(opt.id) || !isDefaultOption(g, opt.id)) {
      billOpts.push(opt.label);
    }
  });
  const cartSubParts: string[] = [];
  (product.groups || []).forEach((g) => {
    const oid = opts[g.id];
    const opt = findOption(g, oid);
    if (!opt) return;
    cartSubParts.push(opt.label);
  });
  let sub = cartSubParts.join(" · ");
  if (addonLabels.length) {
    sub = sub ? `${sub} + ${addonLabels.join(" + ")}` : addonLabels.join(" + ");
  }
  return { head, sub, billOpts, addonLabels };
}

export function formatLineLabel(product: CatalogProduct, selection: ProductSelection): string {
  const parts = formatLineParts(product, selection);
  if (!parts.head) return "";
  if (!parts.billOpts.length && !parts.addonLabels.length) return parts.head;
  const optionBit = parts.billOpts.join(" · ");
  const addonBit = parts.addonLabels.length ? "+ " + parts.addonLabels.join(" + ") : "";
  return `${parts.head} · ${[optionBit, addonBit].filter(Boolean).join(" ")}`.replace(/\s+/g, " ").trim();
}

export function buildCartLinePayload(product: CatalogProduct, selection: ProductSelection) {
  const sel: ProductSelection = {
    ...selection,
    productId: product.id,
    qty: Math.max(1, Math.floor(Number(selection.qty) || 1))
  };
  const price = unitPrice(product, sel);
  const parts = formatLineParts(product, sel);
  const label = formatLineLabel(product, sel);
  const key = cartLineKey(sel);
  return {
    menuItemId: `product:${product.id}`,
    productId: product.id,
    name: label,
    nameHi: String(product.nameHi || "").trim() || undefined,
    nameHead: parts.head,
    nameSub: parts.sub,
    price,
    qty: sel.qty,
    note: sel.note || "",
    selection: sel,
    configKey: key,
    category: product.categories?.[0] || "General",
    diet: "veg" as const
  };
}
