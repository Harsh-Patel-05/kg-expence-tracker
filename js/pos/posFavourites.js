/**
 * Auto Favourites + Hotshots from billed items.
 * Favourites = all-time top sellers; Hotshots = recent (last 14 days) top sellers.
 */
(function (root) {
  "use strict";

  const STORE_KEY = "kg_pos_fav_counts_v1";
  const RECENT_KEY = "kg_pos_fav_recent_v1";
  const HIDDEN_KEY = "kg_pos_fav_hidden_v1";
  const DAY_MS = 86400000;
  const HOT_WINDOW_DAYS = 14;

  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v && typeof v === "object" ? v : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {}
  }

  function itemKey(it) {
    const id = String(it.menuItemId || it.id || "").trim();
    if (id) return `id:${id}`;
    const name = String(it.name || "")
      .trim()
      .toLowerCase();
    return `n:${name}`;
  }

  function groupKeyFromItem(it) {
    const menu = root.KG && root.KG.posMenu;
    if (menu) {
      const id = String(it.menuItemId || it.id || "").trim();
      const m = id ? menu.getById(id) : null;
      if (m && m.__base) {
        const cat = String(m.category || "Other");
        return `${String(cat).toLowerCase()}@@${String(m.__base).toLowerCase()}`;
      }
      if (menu.deriveBaseAndVariant) {
        const { base } = menu.deriveBaseAndVariant(it.name || "");
        const cat = String(m?.category || it.category || "Other").toLowerCase();
        return `${cat}@@${String(base || it.name || "").toLowerCase()}`;
      }
    }
    return `n:${String(it.name || "")
      .trim()
      .toLowerCase()}`;
  }

  function bumpMap(map, key, qty) {
    if (!key) return;
    map[key] = (Number(map[key]) || 0) + Math.max(1, Math.floor(Number(qty) || 1));
  }

  /** Record settled bill lines into all-time + recent counters */
  function recordBillItems(items, atMs) {
    if (!Array.isArray(items) || !items.length) return;
    const all = loadJSON(STORE_KEY, {});
    const recent = loadJSON(RECENT_KEY, []);
    const ts = Number(atMs) || Date.now();
    const batch = [];
    items.forEach((it) => {
      const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
      bumpMap(all, itemKey(it), qty);
      bumpMap(all, groupKeyFromItem(it), qty);
      batch.push({
        k: itemKey(it),
        g: groupKeyFromItem(it),
        qty,
        at: ts
      });
    });
    recent.push(...batch);
    // Keep ~90 days of recent events
    const cut = Date.now() - 90 * DAY_MS;
    const trimmed = recent.filter((r) => Number(r.at) >= cut).slice(-4000);
    saveJSON(STORE_KEY, all);
    saveJSON(RECENT_KEY, trimmed);
  }

  function topKeys(mapObj, limit) {
    return Object.entries(mapObj || {})
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit || 24)
      .map(([k, c]) => ({ key: k, count: c }));
  }

  function recentCounts(windowDays) {
    const recent = loadJSON(RECENT_KEY, []);
    const cut = Date.now() - (windowDays || HOT_WINDOW_DAYS) * DAY_MS;
    const map = {};
    recent.forEach((r) => {
      if (Number(r.at) < cut) return;
      bumpMap(map, r.g || r.k, r.qty);
    });
    return map;
  }

  function resolveGroups(ranked, limit) {
    const menu = root.KG && root.KG.posMenu;
    if (!menu) return [];
    const groups = menu.getGroups() || [];
    const byGroupKey = new Map(groups.map((g) => [g.key, g]));
    const byId = new Map();
    groups.forEach((g) => {
      (g.variants || []).forEach((v) => {
        byId.set(`id:${v.id || v.menuItemId}`, g);
      });
    });
    const out = [];
    const seen = new Set();
    for (const row of ranked) {
      let g = byGroupKey.get(row.key) || byId.get(row.key);
      if (!g && String(row.key).startsWith("n:")) {
        const name = row.key.slice(2);
        g = groups.find(
          (x) =>
            String(x.baseName || "")
              .toLowerCase() === name ||
            (x.variants || []).some(
              (v) =>
                String(v.name || "")
                  .toLowerCase() === name
            )
        );
      }
      if (!g || seen.has(g.key)) continue;
      // Snacks already filtered from menu index
      seen.add(g.key);
      out.push(Object.assign({}, g, { __favCount: row.count }));
      if (out.length >= (limit || 24)) break;
    }
    return out;
  }

  function hiddenMap() {
    return loadJSON(HIDDEN_KEY, {});
  }

  function isHidden(groupKey) {
    return !!hiddenMap()[String(groupKey || "")];
  }

  function filterHidden(list) {
    const hid = hiddenMap();
    return (list || []).filter((g) => g && !hid[g.key]);
  }

  /** Hide a favourite/hotshot so it stays off the strip until unhidden. */
  function removeFavourite(groupKey) {
    const key = String(groupKey || "").trim();
    if (!key) return false;
    const hid = hiddenMap();
    hid[key] = Date.now();
    saveJSON(HIDDEN_KEY, hid);
    // Also clear counters so it doesn't dominate rankings if re-enabled later
    const all = loadJSON(STORE_KEY, {});
    delete all[key];
    saveJSON(STORE_KEY, all);
    const recent = loadJSON(RECENT_KEY, []).filter((r) => r.g !== key && r.k !== key);
    saveJSON(RECENT_KEY, recent);
    return true;
  }

  function getFavourites(limit) {
    return filterHidden(resolveGroups(topKeys(loadJSON(STORE_KEY, {}), 80), limit || 24));
  }

  function getHotshots(limit) {
    const hot = recentCounts(HOT_WINDOW_DAYS);
    const ranked = topKeys(hot, 80);
    // Fallback: if no recent sales, use all-time top as hotshots seed
    if (!ranked.length) return getFavourites(limit || 16);
    return filterHidden(resolveGroups(ranked, limit || 16));
  }

  function refreshFromLocalBills() {
    try {
      const arr = JSON.parse(localStorage.getItem("kg_pos_bills_local_v1") || "[]");
      if (!Array.isArray(arr)) return 0;
      arr.forEach((b) => {
        if (!b || b.status === "void") return;
        recordBillItems(b.items || [], Number(b.at) || Date.now());
      });
      return arr.length;
    } catch (_) {
      return 0;
    }
  }

  function ingestBillLike(b, all, recent) {
    if (!b || b.status === "void") return;
    const items = Array.isArray(b.items) ? b.items : [];
    const ts =
      (b.createdAt && b.createdAt.toMillis && b.createdAt.toMillis()) ||
      Number(b.at) ||
      Date.now();
    items.forEach((it) => {
      const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
      bumpMap(all, itemKey(it), qty);
      bumpMap(all, groupKeyFromItem(it), qty);
      recent.push({
        k: itemKey(it),
        g: groupKeyFromItem(it),
        qty,
        at: ts
      });
    });
  }

  async function refreshFromFirestore() {
    refreshFromLocalBills();
    try {
      const db =
        typeof firebase !== "undefined" && firebase.firestore && firebase.firestore();
      if (!db) return { ok: false, localOnly: true };
      const all = loadJSON(STORE_KEY, {});
      const recent = loadJSON(RECENT_KEY, []);
      let n = 0;
      try {
        const snap = await db.collection("posBills").orderBy("createdAt", "desc").limit(120).get();
        snap.forEach((doc) => {
          ingestBillLike(doc.data(), all, recent);
          n += 1;
        });
      } catch (_) {
        // index may be missing — fall through to orders
      }
      try {
        const orders = await db.collection("orders").orderBy("createdAt", "desc").limit(150).get();
        orders.forEach((doc) => {
          ingestBillLike(doc.data(), all, recent);
          n += 1;
        });
      } catch (_) {
        try {
          const orders = await db.collection("orders").limit(150).get();
          orders.forEach((doc) => {
            ingestBillLike(doc.data(), all, recent);
            n += 1;
          });
        } catch (e2) {
          console.warn("posFavourites orders", e2);
        }
      }
      const cut = Date.now() - 90 * DAY_MS;
      saveJSON(STORE_KEY, all);
      saveJSON(RECENT_KEY, recent.filter((r) => Number(r.at) >= cut).slice(-4000));
      return { ok: true, bills: n };
    } catch (e) {
      console.warn("posFavourites refresh", e);
      return { ok: false, error: String(e && e.message) };
    }
  }

  const api = {
    recordBillItems,
    getFavourites,
    getHotshots,
    removeFavourite,
    isHidden,
    refreshFromLocalBills,
    refreshFromFirestore,
    STORE_KEY,
    RECENT_KEY,
    HIDDEN_KEY
  };

  root.KG = root.KG || {};
  root.KG.posFavourites = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
