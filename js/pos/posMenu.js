/**
 * Menu index + variants (weight sizes) + add-ons + instant search.
 */
(function (root) {
  "use strict";

  const DEFAULT_ADDONS = [
    { id: "addon_pau", name: "Extra Pau", nameHi: "एक्स्ट्रा पाव", price: 10 },
    { id: "addon_butter", name: "Extra Butter", nameHi: "एक्स्ट्रा बटर", price: 15 },
    { id: "addon_cheese", name: "Extra Cheese", nameHi: "एक्स्ट्रा चीज़", price: 20 },
    { id: "addon_sev", name: "Extra Sev", nameHi: "एक्स्ट्रा सेव", price: 10 }
  ];

  let items = [];
  let byId = new Map();
  let byCategory = new Map();
  let groups = []; // [{ key, baseName, category, variants: [menuItem], addons: [] }]
  let searchTimer = null;

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\s+/g, " ")
      .trim();
  }

  function deriveBaseAndVariant(name) {
    const raw = String(name || "").trim();
    const m =
      raw.match(/\((\s*\d+(?:\.\d+)?\s*(?:kg|g|gm|gms)\s*)\)\s*$/i) ||
      raw.match(/(?:-|–|—)\s*(\d+(?:\.\d+)?\s*(?:kg|g|gm|gms))\s*$/i) ||
      raw.match(/\s(\d+(?:\.\d+)?\s*(?:kg|g|gm|gms))\s*$/i);
    if (!m) return { base: raw, variant: "" };
    const variant = String(m[1] || "").trim().replace(/\s+/g, " ");
    const base = raw.replace(m[0], "").trim().replace(/\s+/g, " ");
    return { base: base || raw, variant };
  }

  function formatVariantLabel(variant) {
    const s = String(variant || "").trim();
    if (!s) return "Default";
    return s;
  }

  function inferVeg(name) {
    const n = normalize(name);
    if (/\b(chicken|mutton|egg|non\s*-?\s*veg|fish)\b/.test(n)) return false;
    if (/\b(paneer|veg|dabeli|vada|bhaji|pulao|jain|swaminarayan)\b/.test(n)) return true;
    return undefined;
  }

  function loadFromArray(list) {
    items = Array.isArray(list) ? list.filter((m) => m && m.available !== false) : [];
    byId = new Map();
    byCategory = new Map();
    const groupMap = new Map();

    items.forEach((m) => {
      const id = String(m.id || m.menuItemId || "");
      if (m.veg == null) m.veg = inferVeg(m.name);
      byId.set(id, m);
      const cat = String(m.category || "Other");
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(m);
      const { base, variant } = deriveBaseAndVariant(m.name);
      m.__base = base;
      m.__variant = variant;
      m.__variantLabel = formatVariantLabel(variant);
      m.__search = normalize(`${m.name || ""} ${m.nameHi || ""} ${cat} ${base}`);
      const gkey = `${normalize(cat)}@@${normalize(base)}`;
      if (!groupMap.has(gkey)) {
        groupMap.set(gkey, {
          key: gkey,
          baseName: base,
          category: cat,
          variants: [],
          addons: Array.isArray(m.addons) && m.addons.length ? m.addons : DEFAULT_ADDONS,
          imageUrl: m.imageUrl || "",
          veg: m.veg
        });
      }
      const g = groupMap.get(gkey);
      g.variants.push(m);
      if (m.veg === false) g.veg = false;
      else if (g.veg == null && m.veg === true) g.veg = true;
    });

    groups = Array.from(groupMap.values()).map((g) => {
      g.variants.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
      g.minPrice = Number(g.variants[0]?.price) || 0;
      g.hasVariants = g.variants.length > 1 || !!g.variants[0]?.__variant;
      g.__search = normalize(`${g.baseName} ${g.category}`);
      return g;
    });
    groups.sort((a, b) => a.baseName.localeCompare(b.baseName));

    if (root.KG && root.KG.posState) {
      root.KG.posState.getState().menuIndex = { count: items.length, groups: groups.length };
    }
    return { count: items.length, categories: categories(), groups: groups.length };
  }

  function categories() {
    const out = [];
    byCategory.forEach((arr, name) => out.push({ name, count: arr.length }));
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  function getById(id) {
    return byId.get(String(id));
  }

  function getGroup(key) {
    return groups.find((g) => g.key === key);
  }

  function search(query, category, limit) {
    const q = normalize(query);
    const cat = category && category !== "all" ? category : "";
    let pool = groups;
    if (cat) pool = pool.filter((g) => g.category === cat);
    if (q) {
      pool = pool.filter(
        (g) =>
          g.__search.includes(q) ||
          g.variants.some((v) => v.__search && v.__search.includes(q))
      );
    }
    return pool.slice(0, limit || 500);
  }

  /** Flat item search (for Enter-to-add first result) */
  function searchItems(query, category, limit) {
    const q = normalize(query);
    const cat = category && category !== "all" ? category : "";
    let pool = cat ? byCategory.get(cat) || [] : items;
    if (q) pool = pool.filter((m) => m.__search && m.__search.includes(q));
    return pool.slice(0, limit || 500);
  }

  function debouncedSearch(query, category, cb, ms) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      cb(search(query, category));
    }, Math.min(80, ms != null ? ms : 80));
  }

  function renderGrid(container, list, opts) {
    if (!container) return;
    const o = opts || {};
    const start = o.start || 0;
    const pageSize = o.pageSize || (list.length > 200 ? 80 : list.length);
    const slice = list.slice(start, start + pageSize);
    const esc = (s) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const money = root.KG && root.KG.money;

    const html = slice
      .map((g) => {
        // Support both group objects and flat items
        const isGroup = !!g.variants;
        const id = esc(isGroup ? g.key : g.id || g.menuItemId);
        const name = esc(isGroup ? g.baseName : g.name);
        const hi = esc(isGroup ? g.variants[0]?.nameHi || "" : g.nameHi || "");
        const price = money
          ? money.formatINR(isGroup ? g.minPrice : g.price)
          : "₹" + (Number(isGroup ? g.minPrice : g.price) || 0);
        const vegVal = isGroup ? g.veg : g.veg;
        const veg =
          vegVal === true
            ? '<span class="kg-veg" title="Veg">●</span>'
            : vegVal === false
              ? '<span class="kg-nveg" title="Non-veg">●</span>'
              : "";
        const badge =
          isGroup && g.hasVariants
            ? `<span class="kg-pos-var-badge">${g.variants.length} sizes</span>`
            : "";
        const attr = isGroup ? `data-group-key="${id}"` : `data-menu-id="${id}"`;
        return `<button type="button" class="kg-pos-item" ${attr}>
          <div class="kg-pos-item-hi">${hi || name}</div>
          <div class="kg-pos-item-en">${hi ? name : ""}</div>
          <div class="kg-pos-item-meta">${veg}<span class="kg-pos-item-price">${
          isGroup && g.hasVariants ? "from " : ""
        }${price}</span>${badge}</div>
        </button>`;
      })
      .join("");

    if (o.append) container.insertAdjacentHTML("beforeend", html);
    else container.innerHTML = html || `<div class="kg-pos-empty">No items</div>`;
  }

  const api = {
    DEFAULT_ADDONS,
    deriveBaseAndVariant,
    formatVariantLabel,
    loadFromArray,
    categories,
    getById,
    getGroup,
    search,
    searchItems,
    debouncedSearch,
    renderGrid,
    getAll: () => items,
    getGroups: () => groups
  };

  root.KG = root.KG || {};
  root.KG.posMenu = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
