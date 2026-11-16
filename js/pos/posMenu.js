/**
 * Menu index + instant search (debounced). Virtualised grid helpers.
 */
(function (root) {
  "use strict";

  let items = [];
  let byId = new Map();
  let byCategory = new Map();
  let searchTimer = null;

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\s+/g, " ")
      .trim();
  }

  function loadFromArray(list) {
    items = Array.isArray(list) ? list.filter((m) => m && m.available !== false) : [];
    byId = new Map();
    byCategory = new Map();
    items.forEach((m) => {
      const id = String(m.id || m.menuItemId || "");
      byId.set(id, m);
      const cat = String(m.category || "Other");
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(m);
      m.__search = normalize(`${m.name || ""} ${m.nameHi || ""} ${cat}`);
    });
    if (root.KG && root.KG.posState) {
      const st = root.KG.posState.getState();
      st.menuIndex = { count: items.length };
    }
    return { count: items.length, categories: categories() };
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

  function search(query, category, limit) {
    const q = normalize(query);
    const cat = category && category !== "all" ? category : "";
    let pool = cat ? byCategory.get(cat) || [] : items;
    if (q) pool = pool.filter((m) => m.__search && m.__search.includes(q));
    const max = limit || 500;
    return pool.slice(0, max);
  }

  function debouncedSearch(query, category, cb, ms) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      cb(search(query, category));
    }, Math.min(80, ms != null ? ms : 80));
  }

  /**
   * Render only a window of items into container (simple virtualisation).
   */
  function renderGrid(container, list, opts) {
    if (!container) return;
    const o = opts || {};
    const start = o.start || 0;
    const pageSize = o.pageSize || (list.length > 200 ? 80 : list.length);
    const slice = list.slice(start, start + pageSize);
    const esc =
      (root.KG && root.KG.transports && root.KG.transports.browserPrint && root.KG.transports.browserPrint.escapeHtml) ||
      ((s) =>
        String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;"));
    const money = root.KG && root.KG.money;

    const html = slice
      .map((m) => {
        const id = esc(m.id || m.menuItemId);
        const name = esc(m.name);
        const hi = esc(m.nameHi || "");
        const price = money ? money.formatINR(m.price) : "₹" + (Number(m.price) || 0);
        const veg =
          m.veg === true
            ? '<span class="kg-veg" title="Veg">●</span>'
            : m.veg === false
              ? '<span class="kg-nveg" title="Non-veg">●</span>'
              : "";
        return `<button type="button" class="kg-pos-item" data-menu-id="${id}">
          <div class="kg-pos-item-hi">${hi || name}</div>
          <div class="kg-pos-item-en">${hi ? name : ""}</div>
          <div class="kg-pos-item-meta">${veg}<span class="kg-pos-item-price">${price}</span></div>
        </button>`;
      })
      .join("");

    if (o.append) container.insertAdjacentHTML("beforeend", html);
    else container.innerHTML = html || `<div class="kg-pos-empty">No items</div>`;
  }

  const api = {
    loadFromArray,
    categories,
    getById,
    search,
    debouncedSearch,
    renderGrid,
    getAll: () => items
  };

  root.KG = root.KG || {};
  root.KG.posMenu = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
