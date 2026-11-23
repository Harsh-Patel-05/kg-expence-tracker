/**
 * Live kitchen strip on POS — colorful horizontal order cards (no tables).
 */
(function (root) {
  "use strict";

  let unsub = null;
  let orders = [];
  let tickTimer = null;
  let started = false;
  let bound = false;
  /** id → last known status (includes served/cancelled) for reliable popups */
  const lastStatus = new Map();
  let statusPrimed = false;
  /** Swiggy/Zomato pickup highlights — stay until staff clears */
  const pickupHighlight = new Map(); // id -> { channel, platformNo, sid, grandTotal }
  const PICKUP_KEY = "kg_pos_pickup_highlight_v1";
  /** Cancelled/served ids — never resurrect as local unpaid / LIVE ghosts */
  const BLOCK_KEY = "kg_pos_blocked_orders_v1";
  const blockedOrders = new Set();

  function loadPickupHighlights() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(PICKUP_KEY) || "{}");
      Object.entries(raw || {}).forEach(([id, meta]) => pickupHighlight.set(id, meta));
    } catch (_) {}
  }
  function savePickupHighlights() {
    try {
      const obj = {};
      pickupHighlight.forEach((v, k) => { obj[k] = v; });
      sessionStorage.setItem(PICKUP_KEY, JSON.stringify(obj));
    } catch (_) {}
  }
  function loadBlockedOrders() {
    try {
      const arr = JSON.parse(sessionStorage.getItem(BLOCK_KEY) || "[]");
      (arr || []).forEach((id) => blockedOrders.add(String(id)));
    } catch (_) {}
  }
  function saveBlockedOrders() {
    try {
      sessionStorage.setItem(BLOCK_KEY, JSON.stringify([...blockedOrders].slice(-200)));
    } catch (_) {}
  }
  function blockOrderIds(ids) {
    let changed = false;
    (Array.isArray(ids) ? ids : [ids]).forEach((id) => {
      const k = String(id || "").trim();
      if (!k || blockedOrders.has(k)) return;
      blockedOrders.add(k);
      changed = true;
    });
    if (changed) saveBlockedOrders();
  }
  function isBlockedBill(b) {
    if (!b) return true;
    const keys = [b.billId, b.id, b.billNo, b.orderId].map((x) => String(x || "").trim()).filter(Boolean);
    return keys.some((k) => blockedOrders.has(k));
  }
  loadPickupHighlights();
  loadBlockedOrders();

  function isAggChannel(o) {
    const c = String(o.channel || o.orderType || "").toLowerCase();
    return c.includes("swiggy") || c.includes("zomato");
  }
  function aggBrand(o) {
    const c = String(o.channel || o.orderType || "").toLowerCase();
    return c.includes("swiggy") ? "Swiggy" : "Zomato";
  }


  const LANE_COLORS = {
    waiting: "#ef4444",
    preparing: "#f97316",
    ready: "#dc2626"
  };

  function $(id) {
    return document.getElementById(id);
  }

  function estimateWaitMin(order, all) {
    if (!order) return 0;
    if (order.status === "ready") return 0;
    const waiting = all
      .filter((o) => o.status === "waiting")
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    const preparing = all.filter((o) => o.status === "preparing");
    if (order.status === "preparing") return 5;
    const idx = waiting.findIndex((o) => (o.id || o.orderId) === (order.id || order.orderId));
    return 8 + preparing.length * 3 + Math.max(0, idx) * 4;
  }

  function shortId(id) {
    const s = String(id || "");
    const parts = s.split("-");
    const last = parts[parts.length - 1] || s.slice(-6);
    // Prefer daily token like 0007 → 7
    if (/^\d+$/.test(last) && last.length <= 4) return String(Number(last));
    return last;
  }

  /** Takeaway: our daily #. Swiggy/Zomato: platform order # only. */
  function displayToken(o) {
    const p = String(o?.platformOrderNo || "").trim();
    if (p) return p;
    const c = String(o?.channel || o?.orderType || "").toLowerCase();
    if (c.includes("swiggy") || c.includes("zomato")) {
      return shortId(o?.orderId || o?.id);
    }
    const n = Number(o?.dailyNo || o?.tokenNo) || 0;
    if (n > 0) return String(n);
    return shortId(o?.orderId || o?.id);
  }

  let scheduledDue = [];

  function channelTag(o) {
    const c = String(o.channel || o.orderType || "").toLowerCase();
    if (c.includes("scheduled") || c.includes("catering") || c.includes("bulk")) return "Scheduled";
    if (c.includes("swiggy")) return "Swiggy";
    if (c.includes("zomato")) return "Zomato";
    return "Takeaway";
  }

  function itemCount(o) {
    return (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
  }

  function itemSummary(o) {
    const items = o.items || [];
    const parts = items.slice(0, 3).map((it) => {
      const name = it.nameHi || it.nameEn || it.name || it.variantLabel || "?";
      return `${it.qty || 1}× ${name}`;
    });
    if (items.length > 3) parts.push(`+${items.length - 3}`);
    return parts.join(" · ");
  }

  function byStatus() {
    const waiting = [];
    const preparing = [];
    const ready = [];
    orders.forEach((o) => {
      if (o.status === "waiting") waiting.push(o);
      else if (o.status === "preparing") preparing.push(o);
      else if (o.status === "ready") ready.push(o);
    });
    return { waiting, preparing, ready };
  }

  function renderCounts() {
    // scheduled due count folded into unpaid chip when present
    const schedDueN = (scheduledDue || []).filter((o) => Number(o.remainingBalance) > 0).length;
    const { waiting, preparing, ready } = byStatus();
    const set = (id, n) => {
      const el = $(id);
      if (!el) return;
      const prev = el.getAttribute("data-n");
      el.textContent = String(n);
      el.setAttribute("data-n", String(n));
      if (prev != null && prev !== String(n)) {
        el.classList.remove("kg-kds-bump");
        void el.offsetWidth;
        el.classList.add("kg-kds-bump");
      }
    };
    const liveKeys = new Set(orders.map((o) => String(o.billId || o.orderId || o.id)));
    orders.forEach((o) => liveKeys.add(String(o.orderId || "")));
    let localOnlyN = 0;
    listLocalUnpaid().forEach((b) => {
      const id = String(b.billId || b.id || "");
      const no = String(b.billNo || "");
      if (!liveKeys.has(id) && !liveKeys.has(no)) localOnlyN += 1;
    });
    const waitN = waiting.length + localOnlyN;
    set("kgPosKdsWaitN", waitN);
    set("kgPosKdsPrepN", preparing.length);
    set("kgPosKdsReadyN", ready.length);
    const liveUnpaidIds = new Set(
      orders
        .filter((o) => o.payLater || o.paymentStatus === "unpaid")
        .map((o) => String(o.billId || o.orderId || o.id))
    );
    let unpaidN = liveUnpaidIds.size + localOnlyN + schedDueN;
    set("kgPosKdsUnpaidN", unpaidN);
    const run = $("kgPosKdsRunningN");
    if (run) run.textContent = String(waitN + preparing.length + ready.length);
  }

  function renderInsight() {
    // Red Est. wait / Kitchen idle bar removed — LIVE + counts + order # cards only
    const live = $("kgPosKdsLive");
    const localN = listLocalUnpaid().length;
    if (live) live.classList.toggle("has-orders", orders.length > 0 || localN > 0);
  }

  function renderList() {
    const el = $("kgPosKdsList");
    if (!el) return;
    const { waiting, preparing, ready } = byStatus();
    const rows = [
      ...waiting.map((o) => ({ o, lane: "waiting", label: "Waiting" })),
      ...preparing.map((o) => ({ o, lane: "preparing", label: "Preparing" })),
      ...ready.map((o) => ({ o, lane: "ready", label: "Ready" }))
    ];
    // Unpaid / pay-later first so pending amount is always visible
    rows.sort((a, b) => {
      const au = a.o.payLater || a.o.paymentStatus === "unpaid" ? 0 : 1;
      const bu = b.o.payLater || b.o.paymentStatus === "unpaid" ? 0 : 1;
      return au - bu;
    });
    const liveForDue = rows.map((r) => r.o);
    // Local pay-later bills not yet on KDS — show as Waiting cards so staff see them
    const liveKeys = new Set(orders.map((o) => String(o.billId || o.orderId || o.id)));
    orders.forEach((o) => liveKeys.add(String(o.orderId || "")));
    listLocalUnpaid().forEach((b) => {
      const id = String(b.billId || b.id || "");
      const no = String(b.billNo || "");
      if (liveKeys.has(id) || liveKeys.has(no)) return;
      const synth = {
        id: no || id,
        orderId: no || id,
        billId: id,
        status: "waiting",
        channel: b.channel || "takeaway",
        orderType: b.orderType || "Takeaway",
        platformOrderNo: b.platformOrderNo || "",
        items: b.items || [],
        payLater: true,
        paymentStatus: "unpaid",
        grandTotal: b.grandTotal || 0,
        dailyNo: b.dailyNo || b.tokenNo || 0,
        tokenNo: b.tokenNo || b.dailyNo || 0,
        createdAt: b.at ? new Date(b.at).toISOString() : new Date().toISOString(),
        __localOnly: true
      };
      rows.unshift({ o: synth, lane: "waiting", label: "Waiting" });
    });
    renderPendingDue(liveForDue.concat(rows.filter((r) => r.o.__localOnly).map((r) => r.o)));
    if (!rows.length) {
      el.innerHTML = `<div class="kg-kds-empty">No live kitchen orders</div>`;
      return;
    }
    el.innerHTML = rows
      .map(({ o, lane, label }, i) => {
        const eta = estimateWaitMin(o, orders);
        const etaText = lane === "ready" ? "Ready" : `~${eta} min`;
        const tag = channelTag(o);
        const isAgg = tag === "Swiggy" || tag === "Zomato";
        const color = LANE_COLORS[lane] || "#ef4444";
        const sid = displayToken(o);
        const idShow = isAgg ? sid : `#${sid}`;
        const title = `Order ${idShow} · ${tag} · ${itemCount(o)} items · ${label}`;
        const delay = Math.min(i * 40, 240);
        const canCancel = lane === "waiting";
        const unpaid = !!(o.payLater || o.paymentStatus === "unpaid");
        const isScheduled = String(o.channel || o.orderType || "").toLowerCase().includes("scheduled") || tag === "Scheduled";
        const oid = String(o.id || o.orderId);
        const pickup = pickupHighlight.has(oid);
        const brand = aggBrand(o);
        const itemsLine = itemSummary(o);
        const payBadge = unpaid
          ? `<div class="kg-kds-card-pay">UNPAID${o.grandTotal ? " · ₹" + Math.round(Number(o.grandTotal) || 0) : ""}</div>`
          : isScheduled
            ? `<div class="kg-kds-card-pay" style="background:#0d9488;color:#fff">SCHEDULED${unpaid ? "" : " · PAID"}</div>`
            : "";
        const pickupBadge = pickup
          ? `<div class="kg-kds-card-pickup ${brand.toLowerCase()}">${brand} PICKUP${o.platformOrderNo ? " #" + o.platformOrderNo : ""}</div>`
          : "";
        return `<div class="kg-kds-card lane-${lane} kg-kds-card-anim${unpaid ? " is-unpaid" : ""}${isScheduled ? " is-scheduled" : ""}${pickup ? " is-pickup is-pickup-" + brand.toLowerCase() : ""}" style="--lane:${isScheduled ? "#0d9488" : color};--i:${delay}ms" data-id="${o.id || o.orderId}" data-channel="${isScheduled ? "scheduled" : ""}" title="${title}${unpaid ? " · Pay later" : ""}${pickup ? " · Driver pickup" : ""}">
          ${
            canCancel
              ? `<button type="button" class="kg-kds-x" data-kds-cancel="${o.id || o.orderId}" aria-label="Cancel order">×</button>`
              : ""
          }
          <div class="kg-kds-card-id">${idShow}</div>
          <div class="kg-kds-card-sub">${tag}</div>
          ${payBadge}
          ${pickupBadge}
          ${itemsLine ? `<div class="kg-kds-card-items">${itemsLine}</div>` : ""}
          <div class="kg-kds-card-foot">
            <span class="kg-kds-card-meta">${itemCount(o)} · ${label}</span>
            <span class="kg-kds-card-eta">${etaText}</span>
          </div>
        </div>`;
      })
      .join("");
  }



  function listLocalUnpaid() {
    try {
      const arr = JSON.parse(localStorage.getItem("kg_pos_bills_local_v1") || "[]");
      return (arr || []).filter((b) => {
        if (!b) return false;
        if (b.status === "cancelled" || b.status === "void" || b.paymentStatus === "cancelled") return false;
        if (isBlockedBill(b)) return false;
        // Drop stale unpaid ghosts (>36h)
        const age = Date.now() - (Number(b.at) || new Date(b.at || 0).getTime() || 0);
        if (Number.isFinite(age) && age > 36 * 3600 * 1000) return false;
        return !!(b.payLater || b.paymentStatus === "unpaid" || b.status === "pending_payment");
      });
    } catch (_) {
      return [];
    }
  }

  async function cancelKitchenOrder(orderOrId) {
    const order =
      typeof orderOrId === "object" && orderOrId
        ? orderOrId
        : orders.find((o) => String(o.id || o.orderId) === String(orderOrId)) || { id: orderOrId };
    const ids = [
      order.id,
      order.orderId,
      order.billId,
      order.billNo,
      order.__localOnly ? order.billId || order.id : null
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    const uniq = [...new Set(ids)];
    let lastErr = null;
    let ok = false;
    if (!order.__localOnly) {
      for (const id of uniq) {
        try {
          await root.KG.kdsStore.cancelOrder(id, "pos", "pos");
          ok = true;
          break;
        } catch (e) {
          lastErr = e;
          const msg = String(e?.message || "");
          if (/not found/i.test(msg)) continue;
          if (/only waiting/i.test(msg)) throw e;
        }
      }
    } else {
      ok = true;
    }
    root.KG.posCheckout?.markLocalBillCancelled?.(uniq, "pos_cancel");
    blockOrderIds(uniq);
    // Drop from in-memory list immediately
    orders = orders.filter((o) => {
      const oid = String(o.id || o.orderId || "");
      const bid = String(o.billId || "");
      return !uniq.includes(oid) && !uniq.includes(bid);
    });
    renderCounts();
    renderList();
    if (!ok && lastErr && !order.__localOnly) throw lastErr;
    return true;
  }

  function formatSchedTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch (_) {
      return "";
    }
  }

  function renderPendingDue(liveOrders) {
    const box = $("kgPosKdsPending");
    if (!box) return;
    const liveIds = new Set((liveOrders || []).map((o) => String(o.billId || o.orderId || o.id)));
    const liveUnpaid = (liveOrders || []).filter((o) => o.payLater || o.paymentStatus === "unpaid");
    const localOnly = listLocalUnpaid().filter((b) => {
      const id = String(b.billId || b.id || "");
      const no = String(b.billNo || "");
      return !liveIds.has(id) && !liveIds.has(no);
    });
    const chips = [];
    // Scheduled / party orders in the 45-min lead window (highlighted)
    (scheduledDue || []).forEach((o) => {
      const due = Math.round(Number(o.remainingBalance) || 0);
      const paid = Math.round(Number(o.amountReceived) || 0);
      const when = formatSchedTime(o.scheduledAt);
      const label =
        due > 0
          ? `${o.orderNo || "SO"} · ${when} · due ₹${due}`
          : `${o.orderNo || "SO"} · ${when} · PAID ₹${paid}`;
      chips.push(
        `<button type="button" class="kg-kds-due-chip is-scheduled${due > 0 ? "" : " is-sched-paid"}" data-scheduled-id="${o.id}" title="${o.customerName || ""} · ${o.fulfillmentType || "pickup"}">${label}</button>`
      );
    });
    liveUnpaid.forEach((o) => {
      const ch = String(o.channel || "").toLowerCase();
      if (ch.includes("scheduled")) return; // already in scheduled chips
      const amt = Math.round(Number(o.grandTotal) || 0);
      const sid = displayToken(o);
      chips.push(
        `<button type="button" class="kg-kds-due-chip" data-due-id="${o.id || o.orderId}" data-bill="${o.billId || o.orderId || o.id}" data-amt="${amt}">#${sid} · due ₹${amt}</button>`
      );
    });
    localOnly.forEach((b) => {
      const amt = Math.round(Number(b.grandTotal) || 0);
      const sid = b.dailyNo || b.tokenNo || String(b.billNo || "").split("-").pop() || "?";
      const synced = b.kdsSynced === true;
      chips.push(
        `<button type="button" class="kg-kds-due-chip is-local" data-bill="${b.billId || b.id}" data-amt="${amt}" data-resync="${synced ? "0" : "1"}" title="${synced ? "Collect payment" : "Not on kitchen yet — tap to send"}">#${sid} · due ₹${amt}${synced ? "" : " · send"}</button>`
      );
    });
    if (!chips.length) {
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }
    box.style.display = "flex";
    const schedN = (scheduledDue || []).length;
    const label =
      schedN > 0
        ? `<span class="kg-kds-due-label">Scheduled / pending</span>`
        : `<span class="kg-kds-due-label">Pending amount</span>`;
    box.innerHTML = `${label}${chips.join("")}`;
  }

  function openScheduledPopup(order) {
    const ov = $("kgPosLiveOrderOverlay");
    const body = $("kgPosLiveOrderBody");
    const title = $("kgPosLiveOrderTitle");
    if (!ov || !body || !order) return;
    const due = Math.round(Number(order.remainingBalance) || 0);
    const total = Math.round(Number(order.grandTotal) || 0);
    const received = Math.round(Number(order.amountReceived) || 0);
    if (title) title.textContent = `Scheduled ${order.orderNo || ""}`;
    const items = (order.items || [])
      .map((it) => {
        const nm = it.nameHi || it.name || "?";
        const v = it.variantLabel ? ` (${it.variantLabel})` : "";
        return `<div class="kg-live-pop-line"><b>${it.qty || 1}×</b> ${nm}${v}</div>`;
      })
      .join("");
    const when = root.KG?.scheduledStore?.formatWhen?.(order.scheduledAt) || order.scheduledAt;
    const payBlock =
      due > 0
        ? `<div class="kg-live-pop-pay">
            <div class="kg-live-pop-pay-title">Balance due ₹${due} · collect &amp; complete</div>
            <div class="kg-live-pop-actions">
              <button type="button" class="btn" data-live-act="sched-cash" data-so-id="${order.id}" data-amt="${due}">Cash ₹${due}</button>
              <button type="button" class="btn" data-live-act="sched-online" data-so-id="${order.id}" data-amt="${due}">Online ₹${due}</button>
              <button type="button" class="btn btn-secondary" data-live-act="sched-split" data-so-id="${order.id}" data-amt="${due}">Split cash+online</button>
            </div>
          </div>`
        : `<div class="kg-live-pop-pay">
            <div class="kg-live-pop-pay-title">Fully paid (advance ₹${received}) · hand over</div>
            <div class="kg-live-pop-actions">
              <button type="button" class="btn" data-live-act="sched-complete" data-so-id="${order.id}">Mark delivered</button>
            </div>
          </div>`;
    body.innerHTML = `
      <div class="muted"><b>${order.customerName || ""}</b> · ${order.customerPhone || ""} · ${when}</div>
      <div class="muted">${order.fulfillmentType === "delivery" ? "Delivery" : "Pickup"} · Total ₹${total} · Advance ₹${received} · Due ₹${due}</div>
      <div class="kg-live-pop-items">${items || "<div class='muted'>No items</div>"}</div>
      ${payBlock}
      <div class="kg-live-pop-actions">
        <button type="button" class="btn btn-secondary" data-live-act="close">Close</button>
      </div>`;
    ov.style.display = "flex";
    ov.dataset.orderId = order.id || "";
    ov.dataset.scheduledId = order.id || "";
  }

  async function handleScheduledCollect(act, soId, amt) {
    const bridge = root.KG?.scheduledPosBridge;
    if (!bridge?.collectAndComplete) throw new Error("Scheduled bridge not ready");
    if (act === "sched-cash") {
      await bridge.collectAndComplete(soId, { mode: "cash" });
      if (typeof root.toast === "function") root.toast(`Collected ₹${amt} cash · order completed`, "success");
    } else if (act === "sched-online") {
      await bridge.collectAndComplete(soId, { mode: "online" });
      if (typeof root.toast === "function") root.toast(`Collected ₹${amt} online · order completed`, "success");
    } else if (act === "sched-split") {
      const cashStr = prompt(`Cash amount (due ₹${amt})`, String(Math.floor(amt / 2)));
      if (cashStr == null) return;
      const cash = Math.max(0, Number(cashStr) || 0);
      const online = Math.max(0, amt - cash);
      await bridge.collectAndComplete(soId, { cash, online });
      if (typeof root.toast === "function") {
        root.toast(`Cash ₹${cash} + Online ₹${online} · completed`, "success");
      }
    } else if (act === "sched-complete") {
      await bridge.collectAndComplete(soId, { cash: 0, online: 0 });
      if (typeof root.toast === "function") root.toast("Scheduled order marked delivered", "success");
    }
    closeOrderPopup();
    renderCounts();
    renderList();
  }

  function refreshScheduledDue(list) {
    scheduledDue = Array.isArray(list) ? list : root.KG?.scheduledPosBridge?.getDueOrders?.() || [];
    renderCounts();
    renderList();
  }

  function showPickupPopup(order, { force } = {}) {
    const o = order || {};
    if (!isAggChannel(o) && !force) return;
    const id = String(o.id || o.orderId || "");
    if (!id) return;
    const brand = aggBrand(o);
    const pno = String(o.platformOrderNo || "").trim();
    const sid = displayToken(o);
    pickupHighlight.set(id, {
      channel: brand.toLowerCase(),
      platformNo: pno,
      sid,
      grandTotal: Number(o.grandTotal) || 0
    });
    savePickupHighlights();
    const ov = $("kgPosPickupOverlay");
    if (!ov) return;
    const brandEl = $("kgPosPickupBrand");
    const noEl = $("kgPosPickupNo");
    const subEl = $("kgPosPickupSub");
    if (brandEl) {
      brandEl.textContent = brand;
      brandEl.className = "kg-pos-pickup-brand " + brand.toLowerCase();
    }
    if (noEl) noEl.textContent = pno ? `#${pno}` : `Order #${sid}`;
    if (subEl) {
      subEl.textContent = pno
        ? `${brand} #${pno} ready — highlight stays until you clear it`
        : `${brand} order #${sid} ready — highlight stays until you clear it`;
    }
    ov.dataset.orderId = id;
    ov.style.display = "flex";
    renderList();
  }

  function clearPickupHighlight(orderId) {
    const id = String(orderId || "");
    if (!id) return;
    pickupHighlight.delete(id);
    savePickupHighlights();
    const ov = $("kgPosPickupOverlay");
    if (ov && ov.dataset.orderId === id) ov.style.display = "none";
    renderList();
  }

  let flashTimer = null;

  function showPosFlash(message, kind) {
    let el = $("kgPosKdsFlash");
    if (!el) {
      el = document.createElement("div");
      el.id = "kgPosKdsFlash";
      el.setAttribute("aria-live", "assertive");
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    // Force reflow so CSS transition always applies (Safari)
    el.className = "kg-pos-kds-flash";
    el.textContent = message;
    void el.offsetWidth;
    el.className = `kg-pos-kds-flash kg-pos-kds-flash--${kind || "info"} kg-pos-kds-flash--show`;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove("kg-pos-kds-flash--show"), 3500);
    if (typeof root.toast === "function") {
      try {
        root.toast(message, kind === "cancel" ? "error" : "success");
      } catch (_) {}
    }
  }

  function tick() {
    renderInsight();
    renderList();
  }

  function normStatus(s) {
    return String(s || "").toLowerCase().trim();
  }

  function onOrders(list) {
    const all = list || [];
    if (statusPrimed) {
      all.forEach((o) => {
        const id = String(o.id || o.orderId || "");
        if (!id) return;
        const st = normStatus(o.status);
        const prev = lastStatus.get(id);
        if (prev && prev !== st) {
          const sid = displayToken(o);
          if (st === "ready") {
            const unpaid = !!(o.payLater || o.paymentStatus === "unpaid");
            if (isAggChannel(o)) {
              showPickupPopup(o);
            } else {
              showPosFlash(
                unpaid
                  ? `Order #${sid} READY — collect payment`
                  : `Order #${sid} is READY`,
                unpaid ? "info" : "ready"
              );
            }
          } else if (st === "served") {
            clearPickupHighlight(id);
            blockOrderIds([id, o.billId, o.orderId]);
            root.KG.posCheckout?.markLocalBillCancelled?.(
              [id, o.billId, o.orderId].filter(Boolean),
              "served"
            );
            showPosFlash(`Order #${displayToken(o)} delivered`, "served");
          } else if (st === "cancelled") {
            clearPickupHighlight(id);
            blockOrderIds([id, o.billId, o.orderId]);
            root.KG.posCheckout?.markLocalBillCancelled?.(
              [id, o.billId, o.orderId].filter(Boolean),
              "cancelled"
            );
            showPosFlash(`Order #${displayToken(o)} cancelled`, "cancel");
          }
        }
        lastStatus.set(id, st);
      });
    } else {
      all.forEach((o) => {
        const id = String(o.id || o.orderId || "");
        if (id) lastStatus.set(id, normStatus(o.status));
        const st = normStatus(o.status);
        if (st === "cancelled" || st === "served") {
          blockOrderIds([id, o.billId, o.orderId]);
        }
      });
      statusPrimed = true;
    }

    orders = all.filter((o) => {
      const st = normStatus(o.status);
      if (!["waiting", "preparing", "ready"].includes(st)) return false;
      const id = String(o.id || o.orderId || "");
      if (blockedOrders.has(id)) return false;
      return true;
    });
    renderCounts();
    renderInsight();
    renderList();
  }

  function openOrderPopup(order) {
    const ov = $("kgPosLiveOrderOverlay");
    const body = $("kgPosLiveOrderBody");
    const title = $("kgPosLiveOrderTitle");
    if (!ov || !body) return;
    const o = order || {};
    const sid = displayToken(o);
    if (title) title.textContent = `Order #${sid}`;
    const items = (o.items || [])
      .map((it) => {
        const nm = it.nameHi || it.nameEn || "?";
        const v = it.variant && !/^default$/i.test(it.variant) ? ` (${it.variant})` : "";
        const note = it.itemNote ? `<div class="muted">नोट: ${it.itemNote}</div>` : "";
        return `<div class="kg-live-pop-line"><b>${it.qty || 1}×</b> ${nm}${v}${note}</div>`;
      })
      .join("");
    const canCancel = String(o.status || "") === "waiting";
    const unpaid = !!(o.payLater || o.paymentStatus === "unpaid");
    const amt = Math.round(Number(o.grandTotal) || 0);
    const billKey = o.billId || o.orderId || o.id;
    const localOnly = !!o.__localOnly;
    const payBlock = unpaid
      ? `<div class="kg-live-pop-pay">
          <div class="kg-live-pop-pay-title">Pay later · collect ₹${amt || "?"}</div>
          <div class="kg-live-pop-actions">
            <button type="button" class="btn" data-live-act="paycash" data-id="${o.id || o.orderId}" data-bill="${billKey}" data-amt="${amt}">Cash</button>
            <button type="button" class="btn" data-live-act="payonline" data-id="${o.id || o.orderId}" data-bill="${billKey}" data-amt="${amt}">Online</button>
          </div>
        </div>`
      : "";
    const sendBlock = localOnly
      ? `<div class="kg-live-pop-actions" style="margin-bottom:8px;">
          <button type="button" class="btn" data-live-act="sendkitchen" data-bill="${billKey}">Send to kitchen</button>
        </div>`
      : "";
    body.innerHTML = `
      <div class="muted">${channelTag(o)}${o.platformOrderNo ? " #" + o.platformOrderNo : ""} · ${o.status || ""}${unpaid ? " · <b>UNPAID</b>" : ""}${localOnly ? " · not on KDS yet" : ""}</div>
      <div class="kg-live-pop-items">${items || "<div class='muted'>No items</div>"}</div>
      ${payBlock}
      ${sendBlock}
      ${
        isAggChannel(o)
          ? `<div class="kg-live-pop-actions" style="margin-bottom:8px;">
              <button type="button" class="btn kg-btn-pickup" data-live-act="driver" data-id="${o.id || o.orderId}">${aggBrand(o)} driver arriving</button>
              ${
                pickupHighlight.has(String(o.id || o.orderId))
                  ? `<button type="button" class="btn btn-secondary" data-live-act="clearpickup" data-id="${o.id || o.orderId}">Clear pickup highlight</button>`
                  : ""
              }
            </div>`
          : ""
      }
      <div class="kg-live-pop-actions">
        ${
          localOnly
            ? ""
            : `<button type="button" class="btn" data-live-act="addmore" data-id="${o.id || o.orderId}">Add more (bill delta only)</button>`
        }
        ${
          canCancel
            ? `<button type="button" class="btn btn-secondary" data-live-act="cancel" data-id="${o.id || o.orderId}">Cancel order</button>`
            : localOnly
              ? ""
              : `<span class="muted" style="align-self:center;">Cancel only while Waiting</span>`
        }
        <button type="button" class="btn btn-secondary" data-live-act="close">Close</button>
      </div>`;
    ov.style.display = "flex";
    ov.dataset.orderId = o.id || o.orderId || "";
  }

  function closeOrderPopup() {
    const ov = $("kgPosLiveOrderOverlay");
    if (ov) ov.style.display = "none";
  }

  function bindUi() {
    if (bound) return;
    bound = true;
    $("kgPosKdsList")?.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-kds-cancel]");
      if (btn) {
        ev.preventDefault();
        ev.stopPropagation();
        const id = btn.getAttribute("data-kds-cancel");
        const order =
          orders.find((o) => String(o.id || o.orderId) === String(id)) ||
          // Synthetic local unpaid card
          (() => {
            const b = listLocalUnpaid().find(
              (x) => String(x.billId || x.id) === String(id) || String(x.billNo || "") === String(id)
            );
            return b
              ? {
                  id: String(b.billNo || b.billId || id),
                  orderId: String(b.billNo || b.billId || id),
                  billId: b.billId || b.id,
                  billNo: b.billNo,
                  status: "waiting",
                  __localOnly: true
                }
              : null;
          })();
        if (!order || (order.status && order.status !== "waiting" && !order.__localOnly)) {
          if (typeof root.toast === "function") root.toast("Only waiting orders can be cancelled", "error");
          return;
        }
        if (!id || !confirm("Cancel this kitchen order?")) return;
        try {
          await cancelKitchenOrder(order);
          if (typeof root.toast === "function") root.toast("Order cancelled", "success");
        } catch (e) {
          if (typeof root.toast === "function") root.toast(e.message || "Cancel failed", "error");
        }
        return;
      }
      const card = ev.target.closest(".kg-kds-card[data-id]");
      if (!card) return;
      const id = card.getAttribute("data-id");
      const order = orders.find((o) => String(o.id || o.orderId) === String(id));
      if (order) openOrderPopup(order);
    });
    $("kgPosLiveOrderOverlay")?.addEventListener("click", async (ev) => {
      const actBtn = ev.target.closest("[data-live-act]");
      if (!actBtn) {
        if (ev.target.id === "kgPosLiveOrderOverlay") closeOrderPopup();
        return;
      }
      const act = actBtn.getAttribute("data-live-act");
      const id = actBtn.getAttribute("data-id");
      if (act === "close") {
        closeOrderPopup();
        return;
      }
      if (act === "driver") {
        const order = orders.find((o) => String(o.id || o.orderId) === String(id));
        if (order) {
          showPickupPopup(order, { force: true });
          closeOrderPopup();
        }
        return;
      }
      if (act === "clearpickup") {
        clearPickupHighlight(id);
        closeOrderPopup();
        return;
      }
      if (act === "cancel") {
        const order = orders.find((o) => String(o.id || o.orderId) === String(id));
        if (!order || order.status !== "waiting") {
          if (typeof root.toast === "function") root.toast("Only waiting orders can be cancelled", "error");
          return;
        }
        if (!id || !confirm("Cancel this kitchen order?")) return;
        try {
          await cancelKitchenOrder(order);
          if (typeof root.toast === "function") root.toast("Order cancelled", "success");
          closeOrderPopup();
        } catch (e) {
          if (typeof root.toast === "function") root.toast(e.message || "Cancel failed", "error");
        }
        return;
      }
      if (act === "sendkitchen") {
        try {
          const r = await root.KG.posCheckout.pushUnpaidBillsToKitchen({ force: true });
          if (typeof root.toast === "function") {
            root.toast(
              r.pushed ? `Sent ${r.pushed} order(s) to kitchen` : "Kitchen send failed",
              r.pushed ? "success" : "error"
            );
          }
          closeOrderPopup();
          renderList();
          renderCounts();
        } catch (e) {
          if (typeof root.toast === "function") root.toast(e.message || "Send failed", "error");
        }
        return;
      }
      if (act === "sched-cash" || act === "sched-online" || act === "sched-split" || act === "sched-complete") {
        const soId = actBtn.getAttribute("data-so-id") || id;
        const amt = Number(actBtn.getAttribute("data-amt")) || 0;
        try {
          await handleScheduledCollect(act, soId, amt);
        } catch (e) {
          if (typeof root.toast === "function") root.toast(e.message || "Scheduled payment failed", "error");
        }
        return;
      }
      if (act === "paycash" || act === "payonline") {
        const amt = Number(actBtn.getAttribute("data-amt")) || 0;
        const billId = actBtn.getAttribute("data-bill") || id;
        const payment =
          act === "paycash"
            ? { cash: amt, online: 0 }
            : { cash: 0, online: amt };
        try {
          const bill = await root.KG.posCheckout.collectPayment(billId, payment, { kdsId: id });
          if (bill) {
            closeOrderPopup();
            // Reflect paid on local list immediately
            const ord = orders.find((o) => String(o.id || o.orderId) === String(id));
            if (ord) {
              ord.payLater = false;
              ord.paymentStatus = "paid";
            }
            renderList();
          }
        } catch (e) {
          if (typeof root.toast === "function") root.toast(e.message || "Payment failed", "error");
        }
        return;
      }
      if (act === "addmore") {
        const order = orders.find((o) => String(o.id || o.orderId) === String(id));
        if (!order) return;
        root.KG.posState.setAmend({
          kdsId: order.id || order.orderId,
          orderId: order.orderId || order.id,
          label: displayToken(order)
        });
        closeOrderPopup();
        if (typeof root.toast === "function") {
          root.toast("Add items, then Place order — only new items are billed", "info");
        }
        root.KG.posUI?.renderCart?.();
      }
    });
    $("kgPosKdsPending")?.addEventListener("click", async (ev) => {
      const chip = ev.target.closest(".kg-kds-due-chip");
      if (!chip) return;
      const scheduledId = chip.getAttribute("data-scheduled-id");
      if (scheduledId) {
        let so =
          (scheduledDue || []).find((o) => String(o.id) === String(scheduledId)) ||
          null;
        try {
          if (!so && root.KG?.scheduledStore?.getOrder) {
            so = await root.KG.scheduledStore.getOrder(scheduledId);
          }
        } catch (_) {}
        if (so) openScheduledPopup(so);
        else if (typeof root.toast === "function") root.toast("Scheduled order not found", "error");
        return;
      }
      const billId = chip.getAttribute("data-bill");
      const amt = Number(chip.getAttribute("data-amt")) || 0;
      const id = chip.getAttribute("data-due-id");
      let order = id ? orders.find((o) => String(o.id || o.orderId) === String(id)) : null;
      if (!order && billId) {
        order = orders.find(
          (o) =>
            String(o.billId || "") === String(billId) ||
            String(o.id || o.orderId) === String(billId)
        );
      }
      // Local unpaid bill → build the same Cash/Online popup (never browser confirm)
      if (!order) {
        const local = listLocalUnpaid().find(
          (b) =>
            String(b.billId || b.id) === String(billId) ||
            String(b.billNo || "") === String(billId)
        );
        if (local) {
          order = {
            id: String(local.billNo || local.billId || billId),
            orderId: String(local.billNo || local.billId || billId),
            billId: local.billId || local.id || billId,
            billNo: local.billNo || "",
            status: "waiting",
            channel: local.channel || "takeaway",
            orderType: local.orderType || "Takeaway",
            platformOrderNo: local.platformOrderNo || "",
            items: local.items || [],
            payLater: true,
            paymentStatus: "unpaid",
            grandTotal: local.grandTotal || amt,
            dailyNo: local.dailyNo || local.tokenNo || 0,
            tokenNo: local.tokenNo || local.dailyNo || 0,
            __localOnly: local.kdsSynced !== true
          };
        }
      }
      if (order) {
        openOrderPopup(order);
        return;
      }
      if (typeof root.toast === "function") {
        root.toast("Bill not found — refresh POS", "error");
      }
    });

    // Pickup overlay actions
    $("kgPosPickupClear")?.addEventListener("click", () => {
      const ov = $("kgPosPickupOverlay");
      clearPickupHighlight(ov?.dataset?.orderId);
      if (ov) ov.style.display = "none";
    });
    $("kgPosPickupKeep")?.addEventListener("click", () => {
      const ov = $("kgPosPickupOverlay");
      if (ov) ov.style.display = "none";
    });

    $("kgPosKdsToggle")?.addEventListener("click", () => {
      const live = $("kgPosKdsLive");
      if (!live) return;
      const collapsed = live.classList.toggle("is-collapsed");
      const btn = $("kgPosKdsToggle");
      if (btn) btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      try {
        localStorage.setItem("kg_pos_kds_collapsed", collapsed ? "1" : "0");
      } catch (_) {}
    });
  }

  function start() {
    const rootEl = $("kgPosKdsLive");
    if (!rootEl) return;
    rootEl.style.display = "";
    try {
      if (localStorage.getItem("kg_pos_kds_collapsed") === "1") {
        rootEl.classList.add("is-collapsed");
        $("kgPosKdsToggle")?.setAttribute("aria-expanded", "false");
      }
    } catch (_) {}
    bindUi();
    if (started && unsub) return;
    started = true;
    if (unsub) unsub();
    if (!root.KG?.kdsStore?.subscribeActive) {
      $("kgPosKdsList").innerHTML = `<div class="kg-kds-empty">KDS not loaded</div>`;
      return;
    }
    unsub = root.KG.kdsStore.subscribeActive(onOrders, (err) => {
      console.warn("POS KDS live", err);
    });
    // Recover unsynced kitchen bills (time-capped; no force-flood on weak net)
    setTimeout(() => {
      let afterReload = false;
      try {
        afterReload =
          sessionStorage.getItem("kg_pos_retry_kds_after_reload") === "1" ||
          sessionStorage.getItem("kg_pos_fs_soft_recover") === "1";
        sessionStorage.removeItem("kg_pos_retry_kds_after_reload");
        sessionStorage.removeItem("kg_pos_fs_soft_recover");
      } catch (_) {}
      const push = root.KG.posCheckout?.pushUnpaidBillsToKitchen;
      if (typeof push !== "function") return;
      const run = push.call(root.KG.posCheckout, { force: !!afterReload });
      const timed =
        typeof root.KG.posCheckout.withTimeout === "function"
          ? root.KG.posCheckout.withTimeout(run, 8000, "kds recover timeout")
          : run;
      timed
        .then((r) => {
          renderCounts();
          renderList();
        })
        .catch(() => {
          renderCounts();
          renderList();
        });
    }, 500);
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(tick, 15000);
    try {
      root.KG?.scheduledPosBridge?.start?.();
      scheduledDue = root.KG?.scheduledPosBridge?.getDueOrders?.() || [];
      root.KG?.scheduledPosBridge?.onChange?.((list) => refreshScheduledDue(list));
      root.KG?.scheduledPosBridge?.tick?.();
    } catch (_) {}
  }

  function stop() {
    if (unsub) {
      unsub();
      unsub = null;
    }
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    started = false;
  }

  root.KG = root.KG || {};
  root.KG.posKdsLive = {
    start,
    stop,
    refresh: () => renderList(),
    refreshScheduledDue
  };
})(typeof window !== "undefined" ? window : globalThis);
