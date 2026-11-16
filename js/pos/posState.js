/**
 * In-memory POS state — fast cart ops, held bills, tables, settings.
 */
(function (root) {
  "use strict";

  const HOLD_KEY = "kg_pos_hold_v2";
  const SETTINGS_KEY = "kg_pos_settings_v1";
  const QUEUE_KEY = "kg_pos_offline_queue_v1";

  const defaultSettings = () => ({
    gstEnabled: true,
    gstPercent: 5,
    gstInclusive: false,
    roundOff: true,
    businessDayCutOff: 4,
    maxDiscountPercentEmployee: 5,
    paperWidthMm: 80,
    outletCode: "KG",
    address: "",
    gstin: "",
    phone: "",
    upiId: "",
    swiggyCommissionPct: 20,
    zomatoCommissionPct: 20,
    gatewayChargePct: 0
  });

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {}
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createState() {
    return {
      orderType: "takeaway", // dinein | takeaway | delivery | swiggy | zomato
      tableId: "",
      customerName: "",
      customerPhone: "",
      cart: [], // { lineId, menuItemId, name, nameHi, price, qty, note, veg }
      discountPaise: 0,
      discountPercent: 0,
      chargesPaise: 0,
      note: "",
      held: loadJSON(HOLD_KEY, []),
      tables: {}, // id -> { id, label, status: free|running|billed, billId? }
      settings: Object.assign(defaultSettings(), loadJSON(SETTINGS_KEY, {})),
      syncPending: 0,
      lastBillId: "",
      lastKotPayload: null,
      lastBillPayload: null,
      settling: false,
      idempotencyKey: "",
      listeners: new Set(),
      menuIndex: null,
      activeCategory: "all",
      searchQuery: "",
      cashierName: "",
      billNoPreview: ""
    };
  }

  let state = createState();

  function emit(evt, detail) {
    state.listeners.forEach((fn) => {
      try {
        fn(evt, detail);
      } catch (e) {
        console.warn(e);
      }
    });
  }

  function subscribe(fn) {
    state.listeners.add(fn);
    return () => state.listeners.delete(fn);
  }

  function getState() {
    return state;
  }

  function setSettings(patch) {
    state.settings = Object.assign({}, state.settings, patch || {});
    saveJSON(SETTINGS_KEY, state.settings);
    emit("settings", state.settings);
  }

  function persistHolds() {
    saveJSON(HOLD_KEY, state.held.slice(0, 80));
  }

  function setOrderType(t) {
    state.orderType = t;
    emit("orderType", t);
  }

  function setTable(id) {
    state.tableId = id || "";
    emit("table", state.tableId);
  }

  function addLine(item) {
    const t0 = performance.now();
    const menuItemId = String(item.menuItemId || item.id || "");
    const existing = state.cart.find(
      (l) => l.menuItemId === menuItemId && !l.note && (l.prep || "regular") === (item.prep || "regular")
    );
    if (existing) {
      existing.qty += Math.max(1, Number(item.qty) || 1);
      emit("cart", { type: "inc", line: existing });
    } else {
      const line = {
        lineId: uid("ln"),
        menuItemId,
        name: String(item.name || ""),
        nameHi: String(item.nameHi || ""),
        price: Number(item.price) || 0,
        qty: Math.max(1, Math.floor(Number(item.qty) || 1)),
        note: String(item.note || ""),
        prep: item.prep || "regular",
        veg: item.veg
      };
      state.cart.push(line);
      emit("cart", { type: "add", line });
    }
    const ms = performance.now() - t0;
    if (root.KG?.pos?.devPerf) console.log("[POS perf] addLine", ms.toFixed(2), "ms");
    return ms;
  }

  function updateQty(lineId, qty) {
    const line = state.cart.find((l) => l.lineId === lineId);
    if (!line) return;
    const q = Math.floor(Number(qty) || 0);
    if (q <= 0) {
      state.cart = state.cart.filter((l) => l.lineId !== lineId);
      emit("cart", { type: "remove", lineId });
      return;
    }
    line.qty = q;
    emit("cart", { type: "qty", line });
  }

  function setLineNote(lineId, note) {
    const line = state.cart.find((l) => l.lineId === lineId);
    if (!line) return;
    line.note = String(note || "");
    emit("cart", { type: "note", line });
  }

  function removeLine(lineId) {
    state.cart = state.cart.filter((l) => l.lineId !== lineId);
    emit("cart", { type: "remove", lineId });
  }

  function clearCart() {
    state.cart = [];
    state.discountPaise = 0;
    state.discountPercent = 0;
    state.chargesPaise = 0;
    state.note = "";
    state.idempotencyKey = "";
    emit("cart", { type: "clear" });
  }

  function cartSubtotalPaise() {
    const money = root.KG && root.KG.money;
    if (!money) {
      return Math.round(
        state.cart.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0) * 100
      );
    }
    return state.cart.reduce(
      (s, l) => s + money.toPaise(l.price) * Math.max(1, Math.floor(Number(l.qty) || 1)),
      0
    );
  }

  function computeTotals() {
    const money = root.KG.money;
    return money.computeBill({
      subtotalPaise: cartSubtotalPaise(),
      discountPaise: state.discountPaise,
      discountPercent: state.discountPercent,
      chargesPaise: state.chargesPaise,
      gstPercent: state.settings.gstPercent,
      gstEnabled: state.settings.gstEnabled,
      gstInclusive: state.settings.gstInclusive,
      roundOff: state.settings.roundOff
    });
  }

  function holdCurrent() {
    if (!state.cart.length) return null;
    const snap = {
      id: uid("hold"),
      createdAt: Date.now(),
      orderType: state.orderType,
      tableId: state.tableId,
      customerName: state.customerName,
      customerPhone: state.customerPhone,
      cart: state.cart.map((x) => Object.assign({}, x)),
      discountPaise: state.discountPaise,
      discountPercent: state.discountPercent,
      chargesPaise: state.chargesPaise,
      note: state.note,
      totals: computeTotals()
    };
    state.held.unshift(snap);
    persistHolds();
    if (state.tableId) {
      state.tables[state.tableId] = state.tables[state.tableId] || {
        id: state.tableId,
        label: state.tableId,
        status: "running"
      };
      state.tables[state.tableId].status = "running";
      state.tables[state.tableId].holdId = snap.id;
    }
    clearCart();
    emit("hold", snap);
    return snap;
  }

  function reopenHold(id) {
    const idx = state.held.findIndex((h) => h.id === id);
    if (idx < 0) return false;
    const h = state.held[idx];
    state.held.splice(idx, 1);
    persistHolds();
    state.cart = (h.cart || []).map((x) => Object.assign({}, x));
    state.orderType = h.orderType || "takeaway";
    state.tableId = h.tableId || "";
    state.customerName = h.customerName || "";
    state.customerPhone = h.customerPhone || "";
    state.discountPaise = h.discountPaise || 0;
    state.discountPercent = h.discountPercent || 0;
    state.chargesPaise = h.chargesPaise || 0;
    state.note = h.note || "";
    emit("reopen", h);
    emit("cart", { type: "reopen" });
    return true;
  }

  function enqueueOffline(job) {
    const q = loadJSON(QUEUE_KEY, []);
    q.push(Object.assign({ queuedAt: Date.now() }, job));
    saveJSON(QUEUE_KEY, q);
    state.syncPending = q.length;
    emit("sync", state.syncPending);
  }

  function peekQueue() {
    return loadJSON(QUEUE_KEY, []);
  }

  function setQueue(q) {
    saveJSON(QUEUE_KEY, q);
    state.syncPending = q.length;
    emit("sync", state.syncPending);
  }

  function ensureTables(n) {
    const count = Math.max(1, Number(n) || 12);
    for (let i = 1; i <= count; i++) {
      const id = `T${i}`;
      if (!state.tables[id]) state.tables[id] = { id, label: `Table ${i}`, status: "free" };
    }
  }

  ensureTables(12);

  const api = {
    HOLD_KEY,
    SETTINGS_KEY,
    QUEUE_KEY,
    getState,
    subscribe,
    setSettings,
    setOrderType,
    setTable,
    addLine,
    updateQty,
    setLineNote,
    removeLine,
    clearCart,
    cartSubtotalPaise,
    computeTotals,
    holdCurrent,
    reopenHold,
    enqueueOffline,
    peekQueue,
    setQueue,
    ensureTables,
    uid,
    resetForTests() {
      state = createState();
      ensureTables(12);
    },
    get devPerf() {
      return !!(root.KG && root.KG.pos && root.KG.pos.devPerf);
    }
  };

  root.KG = root.KG || {};
  root.KG.posState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
