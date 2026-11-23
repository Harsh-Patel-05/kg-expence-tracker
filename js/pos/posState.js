/**
 * In-memory POS state — fast cart ops, held bills, tables, settings.
 */
(function (root) {
  "use strict";

  const HOLD_KEY = "kg_pos_hold_v2";
  const SETTINGS_KEY = "kg_pos_settings_v1";
  const QUEUE_KEY = "kg_pos_offline_queue_v1"; // kept for offlineQueue LS mirror

  const defaultSettings = () => ({
    gstEnabled: false,
    gstPercent: 0,
    gstInclusive: false,
    roundOff: true,
    businessDayCutOff: 4,
    maxDiscountPercentEmployee: 5,
    paperWidthMm: 80,
    outletCode: "KG",
    shopName: "The Kilogram",
    address: "",
    gstin: "",
    phone: "",
    upiId: "",
    ratingsUrl: "",
    whatsappShareDefault: true,
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
      orderType: "takeaway", // takeaway | swiggy | zomato
      platformOrderNo: "",
      tableId: "",
      customerName: "",
      customerPhone: "",
      // When set, next settle only bills cart as delta + appends to this KDS order
      amend: null, // { kdsId, orderId, label }
      cart: [], // { lineId, menuItemId, name, nameHi, price, qty, note, veg }
      discountPaise: 0,
      discountPercent: 0,
      chargesPaise: 0,
      note: "",
      held: loadJSON(HOLD_KEY, []),
      tables: {}, // id -> { id, label, status: free|running|billed, billId? }
      settings: Object.assign(defaultSettings(), loadJSON(SETTINGS_KEY, {}), {
        // Shop does not charge GST on POS bills
        gstEnabled: false,
        gstPercent: 0
      }),
      syncPending: 0,
      lastBillId: "",
      lastKotPayload: null,
      lastBillPayload: null,
      settling: false,
      idempotencyKey: "",
      listeners: new Set(),
      menuIndex: null,
      activeCategory: "__favs",
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

  function setOrderType(type) {
    const t = String(type || "takeaway").toLowerCase().trim();
    state.orderType = t === "swiggy" || t === "zomato" ? t : "takeaway";
    if (state.orderType === "takeaway") state.platformOrderNo = "";
    emit("orderType", state.orderType);
  }

  function setPlatformOrderNo(no) {
    state.platformOrderNo = String(no || "").trim();
    emit("platformOrderNo", state.platformOrderNo);
  }

  function isAggregator() {
    return state.orderType === "swiggy" || state.orderType === "zomato";
  }

  function setTable(id) {
    state.tableId = id || "";
    emit("table", state.tableId);
  }

  function setCustomer(name, phone) {
    state.customerName = String(name || "").trim();
    state.customerPhone = String(phone || "").trim();
    emit("customer", { name: state.customerName, phone: state.customerPhone });
  }

  function cleanHi(s) {
    const menu = root.KG?.posMenu;
    let t = String(s || "");
    if (menu?.stripOnKiloSuffix) t = menu.stripOnKiloSuffix(t);
    if (menu?.stripTrailingSize) t = menu.stripTrailingSize(t);
    return t
      .replace(/\s*\(\s*Default\s*\)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function mergeKeyFor(item, name, variantLabel) {
    const base = String(item.__base || name || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const grams = root.KG?.posMenu?.weightGramsFromLabel?.(variantLabel);
    if (grams == null && !item.__onKilo && !item.onKilo) return null;
    return `${base}@@${item.prep || "regular"}@@${item.addonOf || ""}`;
  }

  function addLine(item) {
    const t0 = performance.now();
    const menuItemId = String(item.menuItemId || item.id || "");
    const addonKey = String(item.addonOf || "");
    const menu = root.KG?.posMenu;
    const rawName = String(item.name || "");
    const name = menu?.cleanDisplayName?.(rawName) || rawName;
    const variantLabel = (() => {
      const v = String(item.variantLabel || item.__variantLabel || "").trim();
      return !v || /^default$/i.test(v) ? "" : v;
    })();
    const qtyAdd = Math.max(1, Math.floor(Number(item.qty) || 1));
    const unitPrice = Number(item.price) || 0;
    const gramsEach = menu?.weightGramsFromLabel?.(variantLabel);
    const mkey = mergeKeyFor(item, name, variantLabel);

    // Same exact SKU → bump qty
    const existingSku = state.cart.find(
      (l) =>
        !l.isWeightMerge &&
        l.menuItemId === menuItemId &&
        !l.note &&
        (l.prep || "regular") === (item.prep || "regular") &&
        String(l.addonOf || "") === addonKey &&
        String(l.variantLabel || "") === variantLabel
    );
    if (existingSku) {
      existingSku.qty += qtyAdd;
      emit("cart", { type: "inc", line: existingSku });
      return performance.now() - t0;
    }

    // Weight sizes of same dish (500 g + 1 kg) → one line, total kg + ₹
    if (mkey && gramsEach != null) {
      const existingW = state.cart.find(
        (l) => l.mergeKey === mkey && !l.note && (l.isWeightMerge || l.weightGrams)
      );
      const addGrams = gramsEach * qtyAdd;
      const addAmt = unitPrice * qtyAdd;
      if (existingW) {
        existingW.weightGrams = (Number(existingW.weightGrams) || 0) + addGrams;
        existingW.price = Math.round((Number(existingW.price) || 0) + addAmt);
        existingW.qty = 1;
        existingW.variantLabel = menu.formatWeightLabel(existingW.weightGrams);
        existingW.isWeightMerge = true;
        existingW.parts = Array.isArray(existingW.parts) ? existingW.parts : [];
        existingW.parts.push({
          menuItemId,
          grams: addGrams,
          unitPrice,
          qty: qtyAdd
        });
        emit("cart", { type: "merge", line: existingW });
        return performance.now() - t0;
      }
      const line = {
        lineId: uid("ln"),
        menuItemId,
        mergeKey: mkey,
        name,
        nameHi: cleanHi(item.nameHi || ""),
        price: Math.round(addAmt),
        qty: 1,
        note: String(item.note || ""),
        prep: item.prep || "regular",
        veg: item.veg,
        variantLabel: menu.formatWeightLabel(addGrams),
        weightGrams: addGrams,
        isWeightMerge: true,
        parts: [{ menuItemId, grams: addGrams, unitPrice, qty: qtyAdd }],
        addonOf: addonKey || undefined
      };
      state.cart.push(line);
      emit("cart", { type: "add", line });
      return performance.now() - t0;
    }

    const line = {
      lineId: uid("ln"),
      menuItemId,
      name,
      nameHi: cleanHi(item.nameHi || ""),
      price: unitPrice,
      qty: qtyAdd,
      note: String(item.note || ""),
      prep: item.prep || "regular",
      veg: item.veg,
      variantLabel,
      addonOf: addonKey || undefined
    };
    state.cart.push(line);
    emit("cart", { type: "add", line });
    const ms = performance.now() - t0;
    if (root.KG?.pos?.devPerf) console.log("[POS perf] addLine", ms.toFixed(2), "ms");
    return ms;
  }

  function updateQty(lineId, qty) {
    const line = state.cart.find((l) => l.lineId === lineId);
    if (!line) return;
    if (line.isWeightMerge) {
      // Map qty to 500 g steps from current weight
      const curUnits = Math.max(1, Math.round((Number(line.weightGrams) || 500) / 500));
      const q = Math.floor(Number(qty) || 0);
      if (q <= 0) {
        state.cart = state.cart.filter((l) => l.lineId !== lineId);
        emit("cart", { type: "remove", lineId });
        return;
      }
      adjustWeightGrams(lineId, (q - curUnits) * 500);
      return;
    }
    const q = Math.floor(Number(qty) || 0);
    if (q <= 0) {
      state.cart = state.cart.filter((l) => l.lineId !== lineId);
      emit("cart", { type: "remove", lineId });
      return;
    }
    line.qty = q;
    emit("cart", { type: "qty", line });
  }

  function adjustWeightGrams(lineId, deltaGrams) {
    const line = state.cart.find((l) => l.lineId === lineId);
    if (!line) return;
    const cur = Math.round(Number(line.weightGrams) || 0);
    const next = cur + Math.round(Number(deltaGrams) || 0);
    if (next <= 0) {
      state.cart = state.cart.filter((l) => l.lineId !== lineId);
      emit("cart", { type: "remove", lineId });
      return;
    }
    const last = (line.parts || [])[line.parts.length - 1];
    const per500 = last
      ? Number(last.unitPrice) / Math.max(0.5, Number(last.grams) / 500)
      : Number(line.price) / Math.max(0.5, cur / 500);
    const steps = Math.round(Number(deltaGrams) || 0) / 500;
    line.weightGrams = next;
    line.price = Math.max(0, Math.round(Number(line.price) + per500 * steps));
    line.qty = 1;
    line.isWeightMerge = true;
    line.variantLabel = root.KG?.posMenu?.formatWeightLabel?.(next) || line.variantLabel;
    emit("cart", { type: "weight", line });
  }

  function setAmend(info) {
    state.amend = info
      ? {
          kdsId: String(info.kdsId || info.id || ""),
          orderId: String(info.orderId || ""),
          label: String(info.label || info.orderId || "")
        }
      : null;
    emit("amend", state.amend);
  }

  function clearAmend() {
    state.amend = null;
    emit("amend", null);
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
    // keep amend until settle finishes — caller clears
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
      platformOrderNo: state.platformOrderNo || "",
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
    state.orderType = h.orderType === "swiggy" || h.orderType === "zomato" ? h.orderType : "takeaway";
    state.platformOrderNo = h.platformOrderNo || "";
    state.tableId = "";
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
    const oq = root.KG && root.KG.offlineQueue;
    if (oq) {
      return oq.enqueue(job).then((n) => {
        state.syncPending = n;
        emit("sync", state.syncPending);
        return n;
      });
    }
    const q = loadJSON(QUEUE_KEY, []);
    q.push(Object.assign({ queuedAt: Date.now() }, job));
    saveJSON(QUEUE_KEY, q);
    state.syncPending = q.length;
    emit("sync", state.syncPending);
    return Promise.resolve(state.syncPending);
  }

  function peekQueue() {
    const oq = root.KG && root.KG.offlineQueue;
    if (oq) return oq.peekSync();
    return loadJSON(QUEUE_KEY, []);
  }

  async function peekQueueAsync() {
    const oq = root.KG && root.KG.offlineQueue;
    if (oq) return oq.peek();
    return loadJSON(QUEUE_KEY, []);
  }

  function setQueue(q) {
    const oq = root.KG && root.KG.offlineQueue;
    if (oq) {
      return oq.setAll(q).then((n) => {
        state.syncPending = n;
        emit("sync", state.syncPending);
      });
    }
    saveJSON(QUEUE_KEY, q);
    state.syncPending = q.length;
    emit("sync", state.syncPending);
    return Promise.resolve();
  }

  async function hydrateOfflineQueue() {
    const oq = root.KG && root.KG.offlineQueue;
    if (!oq) return;
    const q = await oq.hydrate();
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
    setPlatformOrderNo,
    isAggregator,
    setTable,
    setCustomer,
    addLine,
    updateQty,
    adjustWeightGrams,
    setLineNote,
    removeLine,
    clearCart,
    setAmend,
    clearAmend,
    cartSubtotalPaise,
    computeTotals,
    holdCurrent,
    reopenHold,
    enqueueOffline,
    peekQueue,
    peekQueueAsync,
    setQueue,
    hydrateOfflineQueue,
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
