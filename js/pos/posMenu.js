/**
 * Menu index + variants (weight sizes) + add-ons + instant search.
 */
(function (root) {
  "use strict";

  // Only for Bhaji / Pulao / combo-style Mains — never Chinese / Punjabi / beverages
  const DEFAULT_ADDONS = [
    { id: "addon_pau", name: "Extra Pau", nameHi: "एक्स्ट्रा पाव", price: 10 },
    { id: "addon_butter", name: "Extra Butter", nameHi: "एक्स्ट्रा बटर", price: 15 },
    { id: "addon_cheese", name: "Extra Cheese", nameHi: "एक्स्ट्रा चीज़", price: 20 },
    { id: "addon_sev", name: "Extra Sev", nameHi: "एक्स्ट्रा सेव", price: 10 }
  ];

  function addonsForItem(cat, baseName) {
    const c = normalize(cat);
    const n = normalize(baseName);
    if (c === "chinese" || c === "punjabi" || c === "beverages" || c === "snacks") return [];
    if (/\b(bhaji|pulao|pau|pav|combo)\b/.test(n) || c === "mains" || c === "bhaji") {
      return DEFAULT_ADDONS.slice();
    }
    return [];
  }

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

  function stripOnKiloSuffix(base) {
    return String(base || "")
      .replace(/\s*[—–-]\s*Chinese on Kilo\s*$/i, "")
      .replace(/\s+Chinese on Kilo\s*$/i, "")
      .replace(/\s*[—–-]\s*किलो पर चाइनीज\s*$/u, "")
      .replace(/\s*किलो पर चाइनीज\s*$/u, "")
      .replace(/\s*[—–-]\s*Chinese\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function deriveBaseAndVariant(name) {
    const raw = String(name || "").trim();
    const onKilo = /chinese on kilo|किलो पर चाइनीज/i.test(raw);
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
    base = stripOnKiloSuffix(base || raw);
    // Shop shorthand: Chinese-on-Kilo half / full kilo → clean weight labels
    if (onKilo && variant) {
      const w = variant.match(/^(\d+(?:\.\d+)?)\s*(kg|gms|gm|g)$/i);
      if (w) {
        const u = w[2].toLowerCase();
        if (u === "kg") variant = "1 kg";
        else if (Number(w[1]) === 500 || Number(w[1]) === 0.5) variant = "500 g";
      } else if (/^1$/i.test(variant)) {
        variant = "500 g";
      }
    }
    return { base: base || raw, variant, onKilo };
  }

  function formatVariantLabel(variant, onKilo) {
    const s = String(variant || "").trim();
    if (!s || /^default$/i.test(s)) return "";
    // Legacy Chinese plate code "1" = 500 ग्राम
    if (/^1$/i.test(s)) return onKilo ? "500 ग्राम" : "1";
    if (/^1\s*kg$/i.test(s) || /^1\s*किलो$/u.test(s)) return "1 किलो";
    const weight = s.match(/^(\d+(?:\.\d+)?)\s*(kg|gms|gm|g|किलो|ग्राम)$/i);
    if (weight) {
      const n = weight[1];
      const u = weight[2].toLowerCase();
      if (onKilo) {
        if (u === "kg" || u === "किलो") return "1 किलो";
        if (Number(n) === 500 || Number(n) === 0.5) return "500 ग्राम";
      }
      if (u === "kg" || u === "किलो") return `${n} किलो`;
      return `${n} ग्राम`;
    }
    const opt = s.match(/^option\s*(\d+)$/i);
    if (opt) return `Opt ${opt[1]}`;
    if (/^\d+$/.test(s)) return `${s} pcs`;
    return s;
  }

  /** Grams from a size label (500 g, 1 kg, 1.5 किलो, legacy "1"). */
  function weightGramsFromLabel(label) {
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

  /** Kitchen/POS weight text in Hindi (e.g. 1.5 किलो). */
  function formatWeightLabel(grams) {
    const g = Math.round(Number(grams) || 0);
    if (g <= 0) return "";
    if (g % 1000 === 0) return `${g / 1000} किलो`;
    if (g > 1000) {
      const kg = g / 1000;
      const t = Math.round(kg * 100) / 100;
      return `${t} किलो`;
    }
    return `${g} ग्राम`;
  }

  /** Compact English size for POS chips — short so 3 chips fit */
  function shortSizeLabel(label) {
    const raw = cleanVariantLabel(label);
    if (!raw) return "";
    const g = weightGramsFromLabel(raw);
    if (g != null && g > 0) {
      if (g % 1000 === 0) return `${g / 1000}kg`;
      if (g > 1000) {
        const t = Math.round((g / 1000) * 100) / 100;
        return `${t}kg`;
      }
      return `${g}g`;
    }
    const pcs = raw.match(/^(\d+)\s*(pcs?|pc|pieces?)\b/i);
    if (pcs) return `${pcs[1]}pcs`;
    return raw
      .replace(/किलो/gi, "kg")
      .replace(/ग्राम/gi, "g")
      .replace(/\s+/g, "")
      .trim();
  }

  function cleanDisplayName(name) {
    return stripOnKiloSuffix(stripTrailingSize(name));
  }

  /** Never show "Default" in cart / KDS / print. */
  function cleanVariantLabel(label) {
    const s = String(label || "").trim();
    if (!s || /^default$/i.test(s)) return "";
    return s;
  }

  /** Strip trailing "(500 g)" / "(Default)" so size is not printed twice. */
  function stripTrailingSize(name) {
    return String(name || "")
      .replace(/\s*[·\-–—]\s*Default\s*$/i, "")
      .replace(/\s*\(\s*Default\s*\)\s*$/i, "")
      .replace(/\s*\(\s*\d+(?:\.\d+)?\s*(?:kg|g|gm|gms)\s*\)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Append size only when it is not already inside the title. */
  function sizeSuffix(name, variantLabel) {
    const v = cleanVariantLabel(variantLabel);
    if (!v) return "";
    const n = String(name || "");
    const compact = (x) =>
      String(x || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/gms?/g, "g");
    if (compact(n).includes(compact(v))) return "";
    return v;
  }

  function inferVeg(name) {
    const n = normalize(name);
    if (/\b(chicken|mutton|egg|non\s*-?\s*veg|fish)\b/.test(n)) return false;
    if (/\b(paneer|veg|dabeli|vada|bhaji|pulao|jain|swaminarayan)\b/.test(n)) return true;
    return undefined;
  }

  function isExcludedCategory(cat) {
    const n = normalize(cat);
    return n === "snacks" || n === "general";
  }

  function categoryTone(cat) {
    const n = normalize(cat);
    if (n === "mains" || n === "main") return "mains";
    if (n === "chinese") return "chinese";
    if (n === "punjabi") return "punjabi";
    if (n === "beverages" || n === "beverage") return "beverages";
    return "other";
  }

  function loadFromArray(list) {
    items = Array.isArray(list)
      ? list.filter((m) => m && m.available !== false && !isExcludedCategory(m.category))
      : [];
    byId = new Map();
    byCategory = new Map();
    const groupMap = new Map();

    items.forEach((m) => {
      const id = String(m.id || m.menuItemId || "");
      if (m.veg == null) m.veg = inferVeg(m.name);
      byId.set(id, m);
      const cat = String(m.category || "Other");
      if (isExcludedCategory(cat)) return;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(m);
      const { base, variant, onKilo } = deriveBaseAndVariant(m.name);
      m.__base = base;
      m.__variant = variant;
      m.__onKilo = !!onKilo;
      m.__variantLabel = formatVariantLabel(variant, onKilo);
      m.imageUrl = String(m.imageUrl || m.image || "").trim();
      m.__search = normalize(`${m.name || ""} ${m.nameHi || ""} ${cat} ${base}`);
      const gkey = `${normalize(cat)}@@${normalize(base)}`;
      if (!groupMap.has(gkey)) {
        groupMap.set(gkey, {
          key: gkey,
          baseName: base,
          category: cat,
          variants: [],
          addons:
            Array.isArray(m.addons) && m.addons.length ? m.addons : addonsForItem(cat, base),
          imageUrl: m.imageUrl || "",
          veg: m.veg,
          onKilo: !!onKilo
        });
      }
      const g = groupMap.get(gkey);
      if (onKilo) g.onKilo = true;
      if (!g.imageUrl && m.imageUrl) g.imageUrl = m.imageUrl;
      g.variants.push(m);
      if (m.veg === false) g.veg = false;
      else if (g.veg == null && m.veg === true) g.veg = true;
    });

    groups = Array.from(groupMap.values())
      .filter((g) => !isExcludedCategory(g.category))
      .map((g) => {
        // Dedupe: plain plate + 500 g / "1" at same price → keep one as size "1"
        const seen = new Map();
        const deduped = [];
        g.variants.forEach((v) => {
          let label = cleanVariantLabel(v.__variantLabel);
          if ((!v.__variant || !label) && g.onKilo) {
            v.__variant = "500 ग्राम";
            v.__variantLabel = "500 ग्राम";
            label = "500 ग्राम";
          }
          if (g.onKilo) {
            v.__variantLabel = formatVariantLabel(v.__variant || v.__variantLabel, true);
            label = cleanVariantLabel(v.__variantLabel);
          }
          v.__variantLabel = cleanVariantLabel(v.__variantLabel);
          v.__base = stripOnKiloSuffix(v.__base || g.baseName);
          v.nameHi = stripOnKiloSuffix(stripTrailingSize(v.nameHi || ""));
          v.__weightGrams = weightGramsFromLabel(v.__variantLabel);
          const price = Number(v.price) || 0;
          const key = `${normalize(label)}@@${price}`;
          if (seen.has(key)) return;
          seen.set(key, true);
          deduped.push(v);
        });
        g.variants = deduped;
        g.variants.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
        g.minPrice = Number(g.variants[0]?.price) || 0;
        g.hasVariants = g.variants.length > 1 || !!g.variants[0]?.__variant;
        g.__search = normalize(`${g.baseName} ${g.category}`);
        if (!g.imageUrl) {
          g.imageUrl = String(g.variants.find((v) => v.imageUrl)?.imageUrl || "").trim();
        }
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
    byCategory.forEach((arr, name) => {
      if (isExcludedCategory(name)) return;
      // group count (unique bases) for cleaner sidebar numbers
      const uniq = new Set(arr.map((m) => m.__base || m.name));
      out.push({ name, count: uniq.size || arr.length });
    });
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
    let pool = groups.filter((g) => !isExcludedCategory(g.category));

    if (cat === "__favs") {
      const fav = root.KG && root.KG.posFavourites;
      pool = fav ? fav.getFavourites(limit || 24) : [];
    } else if (cat === "__hot") {
      const fav = root.KG && root.KG.posFavourites;
      pool = fav ? fav.getHotshots(limit || 16) : [];
    } else if (cat) {
      pool = pool.filter((g) => g.category === cat);
    }

    if (q) {
      pool = pool.filter(
        (g) =>
          g.__search.includes(q) ||
          (g.variants || []).some((v) => v.__search && v.__search.includes(q))
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
        // Support both group objects and flat items — POS UI is English-only
        const isGroup = !!g.variants;
        const id = esc(isGroup ? g.key : g.id || g.menuItemId);
        const rawName = isGroup ? g.baseName || g.name || "" : g.name || g.baseName || "";
        const name = esc(rawName) || "Item";
        const priceNum = Number(isGroup ? g.minPrice : g.price) || 0;
        const price = money ? money.formatINR(priceNum) : "₹" + priceNum;
        const vegVal = isGroup ? g.veg : g.veg;
        const veg =
          vegVal === true
            ? '<span class="kg-veg" title="Veg">●</span>'
            : vegVal === false
              ? '<span class="kg-nveg" title="Non-veg">●</span>'
              : "";

        const showUnfav = !!o.showUnfav && isGroup;
        const unfavBtn = showUnfav
          ? `<button type="button" class="kg-tile-unfav" data-unfav="${id}" title="Remove from favourites" aria-label="Remove from favourites">★</button>`
          : "";
        const tone = categoryTone(isGroup ? g.category : g.category);
        const toneClass = `kg-tile--cat-${tone}`;

        // Compact quick-bill tiles
        const sizeVars = isGroup && g.variants.length >= 2 ? g.variants.slice() : [];
        if (sizeVars.length >= 2) {
          const n = Math.min(6, sizeVars.length);
          const sizeBtns = sizeVars
            .slice(0, 6)
            .map((v) => {
              const vid = esc(v.id || v.menuItemId);
              let label = shortSizeLabel(v.__variantLabel);
              if (!label) label = shortSizeLabel(formatWeightLabel(weightGramsFromLabel(v.__variant)) || v.__variant || "Size");
              const vp = money ? money.formatINR(v.price) : "₹" + (Number(v.price) || 0);
              return `<button type="button" class="kg-tile-size" data-size-id="${vid}" title="Add ${esc(label)} · ${vp}">
                <span class="kg-tile-size-l">${esc(label)}</span>
                <span class="kg-tile-size-p">${vp}</span>
              </button>`;
            })
            .join("");
          return `<div class="kg-tile kg-tile--sized ${toneClass}" data-cat-tone="${tone}" data-group-key="${id}" data-size-n="${n}">
            ${unfavBtn}
            <div class="kg-tile-head">${veg}<div class="kg-tile-name">${name}</div></div>
            <div class="kg-tile-sizes kg-tile-sizes--n${n}">${sizeBtns}</div>
          </div>`;
        }

        // Single: dense tap strip — name + price, whole card adds
        const attr = isGroup ? `data-group-key="${id}"` : `data-menu-id="${id}"`;
        return `<div class="kg-tile kg-tile--tap ${toneClass}" data-cat-tone="${tone}" ${attr} role="button" tabindex="0">
          ${unfavBtn}
          <div class="kg-tile-head">${veg}<div class="kg-tile-name">${name}</div></div>
          <div class="kg-tile-price-row"><span class="kg-tile-price">${price}</span><span class="kg-tile-plus" aria-hidden="true">+</span></div>
        </div>`;
      })
      .join("");

    const next = html || `<div class="kg-pos-empty">No items</div>`;
    if (o.append) {
      container.insertAdjacentHTML("beforeend", html);
      return;
    }
    const fp =
      (o.showUnfav ? "U" : "") +
      "tile8:" +
      slice.length +
      ":" +
      slice.map((g) => (g.key || g.id || "") + ":" + (g.minPrice || g.price || 0)).join(",");
    // DOM elements expose dataset; tests/stubs may not — guard before fingerprint skip
    const ds = container.dataset;
    const tileCount =
      typeof container.querySelectorAll === "function" ? container.querySelectorAll(".kg-tile").length : -1;
    if (ds && ds.kgMenuFp === fp && tileCount === slice.length) {
      return;
    }
    if (ds) ds.kgMenuFp = fp;
    if (container.classList && typeof container.classList.add === "function") {
      container.classList.add("kg-tile-grid");
    }
    container.innerHTML = next;
  }

  const api = {
    DEFAULT_ADDONS,
    deriveBaseAndVariant,
    formatVariantLabel,
    cleanVariantLabel,
    stripTrailingSize,
    stripOnKiloSuffix,
    cleanDisplayName,
    weightGramsFromLabel,
    formatWeightLabel,
    shortSizeLabel,
    categoryTone,
    sizeSuffix,
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
