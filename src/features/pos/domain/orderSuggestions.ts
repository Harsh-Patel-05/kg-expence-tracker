import { getProduct, SUGGESTION_CONFIG_SEEDS, SUGGESTION_SEEDS, type ConfigSeed } from "./productsCatalog";
import { formatLineLabel, type ProductSelection } from "./productPricing";

const LS_KEY = "kg_pos_order_suggest_v1";

type Stats = {
  pair: Record<string, number>;
  configPair: Record<string, number>;
};

function emptyStats(): Stats {
  return { pair: {}, configPair: {} };
}

function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw) as Stats;
    return {
      pair: parsed.pair || {},
      configPair: parsed.configPair || {}
    };
  } catch {
    return emptyStats();
  }
}

function saveStats(stats: Stats) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(stats));
  } catch {
    /* ignore quota */
  }
}

function seedBoost(seeds: Record<string, string[]>, fromId: string, candidateId: string) {
  const list = seeds[fromId] || [];
  const idx = list.indexOf(candidateId);
  return idx >= 0 ? Math.max(1, 8 - idx) : 0;
}

export function suggestConfigs(cartProductIds: string[], cartConfigKeys: string[], limit = 4) {
  const stats = loadStats();
  const inCart = new Set(cartProductIds);
  const inCfg = new Set(cartConfigKeys);
  const scores = new Map<string, { score: number; seed?: ConfigSeed; key: string }>();

  for (const fromId of cartProductIds) {
    const seeds = SUGGESTION_CONFIG_SEEDS[fromId] || [];
    seeds.forEach((seed, i) => {
      const key = [seed.productId, seed.size, Object.keys(seed.options || {})
        .sort()
        .map((k) => `${k}:${seed.options[k]}`)
        .join(","), ""].join("|");
      if (inCart.has(seed.productId) && inCfg.has(key)) return;
      const prev = scores.get(key);
      const bump = Math.max(1, 6 - i) + (stats.configPair[`${fromId}>${key}`] || 0);
      if (!prev || bump > prev.score) scores.set(key, { score: bump, seed, key });
    });

    for (const toId of SUGGESTION_SEEDS[fromId] || []) {
      if (inCart.has(toId)) continue;
      const product = getProduct(toId);
      if (!product) continue;
      const size = product.defaultSize;
      const options: Record<string, string> = {};
      (product.groups || []).forEach((g) => {
        if (g.options?.[0]) options[g.id] = g.options[0].id;
      });
      const key = [toId, size, Object.keys(options)
        .sort()
        .map((k) => `${k}:${options[k]}`)
        .join(","), ""].join("|");
      const bump = seedBoost(SUGGESTION_SEEDS, fromId, toId) + (stats.pair[`${fromId}>${toId}`] || 0);
      const prev = scores.get(key);
      if (!prev || bump > prev.score) {
        scores.set(key, {
          score: bump,
          key,
          seed: { productId: toId, size, options, label: product.name }
        });
      }
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => {
      const seed = row.seed!;
      const product = getProduct(seed.productId);
      const selection: ProductSelection = {
        productId: seed.productId,
        size: seed.size,
        options: seed.options || {},
        addons: [],
        qty: 1
      };
      return {
        key: row.key,
        label: seed.label || (product ? formatLineLabel(product, selection) : seed.productId),
        selection,
        product
      };
    })
    .filter((x) => x.product);
}

export function recordFromConfiguredLines(
  lines: Array<{ productId?: string; configKey?: string; menuItemId?: string }>
) {
  const productIds = [
    ...new Set(
      lines
        .map((l) => l.productId || (String(l.menuItemId || "").startsWith("product:") ? String(l.menuItemId).slice(8) : ""))
        .filter(Boolean)
    )
  ];
  if (productIds.length < 2 && !lines.some((l) => l.configKey)) return;
  const stats = loadStats();
  for (let i = 0; i < productIds.length; i++) {
    for (let j = 0; j < productIds.length; j++) {
      if (i === j) continue;
      const k = `${productIds[i]}>${productIds[j]}`;
      stats.pair[k] = (stats.pair[k] || 0) + 1;
    }
  }
  const configs = lines.map((l) => l.configKey).filter(Boolean) as string[];
  for (const fromId of productIds) {
    for (const cfg of configs) {
      const k = `${fromId}>${cfg}`;
      stats.configPair[k] = (stats.configPair[k] || 0) + 1;
    }
  }
  saveStats(stats);
}
