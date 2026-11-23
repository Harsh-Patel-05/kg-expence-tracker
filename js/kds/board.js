(function (root) {
  "use strict";

  let orders = [];
  let typeFilter = "all"; // always all — type filters removed from UI
  let tabMode = "columns"; // always 3 columns — tab filters removed from UI
  let knownIds = new Set();
  let timerHandle = null;
  let onAdvance = null;
  let onUndo = null;
  let onCancel = null;
  let onSetStatus = null;
  let dragState = null; // { id, startX, startY, ghost, fromStatus, moved }

  function i18n() {
    return root.KG.kdsI18n;
  }

  function elapsedLabel(createdAt) {
    const ms = Date.now() - new Date(createdAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "0:00";
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function timerClass(createdAt) {
    const ms = Date.now() - new Date(createdAt).getTime();
    if (ms > 20 * 60000) return "late";
    if (ms > 10 * 60000) return "warn";
    return "";
  }

  function typeLabel(t) {
    const x = String(t || "").toLowerCase();
    if (x.includes("dine")) return i18n().t("dinein");
    if (x.includes("deliv")) return i18n().t("delivery");
    if (x.includes("swiggy")) return "Swiggy";
    if (x.includes("zomato")) return "Zomato";
    return i18n().t("takeaway");
  }

  function estimateWaitMin(order, all) {
    if (!order || order.status === "ready") return 0;
    const waiting = (all || [])
      .filter((o) => o.status === "waiting")
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    const preparing = (all || []).filter((o) => o.status === "preparing");
    if (order.status === "preparing") return 5;
    const idx = waiting.findIndex((o) => (o.id || o.orderId) === (order.id || order.orderId));
    return 8 + preparing.length * 3 + Math.max(0, idx) * 4;
  }

  function filtered() {
    // Always show every active order (no dine-in / takeaway / delivery filter)
    return orders.filter((o) => !["served", "cancelled"].includes(o.status));
  }

  function isHighlighted(o) {
    if (!o.highlightUntil) return false;
    return new Date(o.highlightUntil).getTime() > Date.now();
  }

  function renderCard(o) {
    const t = i18n().t;
    const hi = isHighlighted(o);
    const hasNewItem = (o.items || []).some((it) => it.isNew) || (hi && o.lastEvent === "items_added");
    const hasNewNote =
      (o.liveNotes || []).some((n) => n.isNew) || (hi && o.lastEvent === "note");
    const cleanVar = (v) => {
      const s = String(v || "").trim();
      return !s || /^default$/i.test(s) ? "" : s;
    };
    const stripSize = (n) =>
      String(n || "")
        .replace(/\s*[·\-–—]\s*Default\s*$/i, "")
        .replace(/\s*\(\s*Default\s*\)\s*$/i, "")
        .replace(/\s*\(\s*\d+(?:\.\d+)?\s*(?:kg|g|gm|gms)\s*\)\s*$/i, "")
        .trim();
    const items = (o.items || [])
      .map((it) => {
        const name = stripSize(i18n().itemName(it));
        const rawVar = cleanVar(it.variant);
        const compact = (x) =>
          String(x || "")
            .toLowerCase()
            .replace(/\s+/g, "")
            .replace(/gms?/g, "g");
        const variant =
          rawVar && !compact(name).includes(compact(rawVar)) ? ` (${rawVar})` : "";
        const note = it.itemNote
          ? `<div class="kds-item-note">${escapeHtml(it.itemNote)}</div>`
          : "";
        const badge = it.isNew ? `<span class="kds-badge">${t("newItem")}</span>` : "";
        return `<li><span class="kds-qty">${it.qty}×</span><div><div>${escapeHtml(name)}${escapeHtml(variant)}</div>${note}${badge}</div></li>`;
      })
      .join("");

    const liveNotes = (o.liveNotes || [])
      .slice(-3)
      .map(
        (n) =>
          `<div class="kds-live-note">${escapeHtml(n.text)}${n.isNew ? ` <span class="kds-badge">${t("newNote")}</span>` : ""}</div>`
      )
      .join("");

    const ch = String(o.channel || o.orderType || "").toLowerCase();
    const platNo = String(o.platformOrderNo || "").trim();
    // Platform # present OR channel is aggregator → never show our bill/daily token
    const isAggCard = ch.includes("swiggy") || ch.includes("zomato") || !!platNo;
    // Don't show "टेबल <platform#>" for Swiggy/Zomato
    const table =
      !isAggCard && o.tableNo ? `${t("table")} ${escapeHtml(o.tableNo)}` : "";
    const waiter = o.waiterName ? `${t("waiter")}: ${escapeHtml(o.waiterName)}` : "";
    const eta = estimateWaitMin(o, orders);
    const etaText = o.status === "ready" ? "✓" : `~${eta}m`;
    const brandName = ch.includes("swiggy")
      ? "Swiggy"
      : ch.includes("zomato")
        ? "Zomato"
        : typeLabel(o.orderType);
    const brand = isAggCard ? `<span class="kds-plat">${escapeHtml(brandName)}</span>` : "";

    // Strip duplicate Swiggy/Zomato # and our bill tokens from note
    let noteText = String(o.orderNote || "").trim();
    if (isAggCard) {
      noteText = noteText
        .replace(/^(swiggy|zomato)\s*#\s*[\w-]+\s*\|?\s*/i, "")
        .replace(/\b(swiggy|zomato)\s*#\s*[\w-]+/gi, "")
        .replace(/\bPAY-\d{8}-\d+\b/gi, "")
        .replace(/\b(?:TA|SW|ZO|TK)-\d{8}-\d+\b/gi, "")
        .replace(/\|\s*\|/g, "|")
        .replace(/^\||\|$/g, "")
        .trim();
    }
    const orderNote = noteText
      ? `<div class="kds-order-note">${t("note")}: ${escapeHtml(noteText)}</div>`
      : "";

    const unpaid = !!(o.payLater || o.paymentStatus === "unpaid");
    const dueAmt = Math.round(Number(o.grandTotal) || 0);
    const unpaidBadge = unpaid
      ? `<span class="kds-badge kds-badge-unpaid">UNPAID${dueAmt ? " ₹" + dueAmt : ""}</span>`
      : "";
    const oidLabel = isAggCard ? displayToken(o) : `#${displayToken(o)}`;
    return `<article class="kds-card status-${escapeHtml(o.status)}${unpaid ? " is-unpaid" : ""}${isAggCard ? " is-agg" : ""}" data-id="${escapeHtml(o.id || o.orderId)}" data-status="${escapeHtml(o.status)}" role="button" tabindex="0" title="Drag to another column">
      <div class="kds-card-top">
        <div class="kds-oid">${escapeHtml(oidLabel)}</div>
        <div class="kds-timer ${timerClass(o.createdAt)}" data-timer="${escapeHtml(o.createdAt)}" data-eta="${eta}" title="Estimated wait">${etaText}</div>
      </div>
      <div class="kds-meta">
        <span>${table}</span>
        ${isAggCard ? brand : `<span>${typeLabel(o.orderType)}</span>`}
        <span>${waiter}</span>
      </div>
      ${unpaidBadge}
      ${hasNewItem ? `<span class="kds-badge">${t("newItem")}</span>` : ""}
      ${hasNewNote ? `<span class="kds-badge">${t("newNote")}</span>` : ""}
      <ul class="kds-items">${items}</ul>
      ${orderNote}
      ${liveNotes}
      <div class="kds-card-actions">
        <button type="button" class="advance" data-act="advance">${t("advance")}</button>
        <button type="button" class="undo" data-act="undo">${t("undo")}</button>
        ${
          o.status === "waiting"
            ? `<button type="button" class="undo" data-act="cancel">${t("cancelled")}</button>`
            : ""
        }
      </div>
    </article>`;
  }

  function ensureFlashEl() {
    let el = document.getElementById("kdsFlash");
    if (el) return el;
    el = document.createElement("div");
    el.id = "kdsFlash";
    el.className = "kds-flash";
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
    return el;
  }

  let flashTimer = null;
  function showFlash(message, kind) {
    const el = ensureFlashEl();
    el.setAttribute("aria-live", "assertive");
    el.setAttribute("role", "status");
    el.className = "kds-flash";
    el.textContent = message;
    void el.offsetWidth;
    el.className = `kds-flash kds-flash--${kind || "info"} kds-flash--show`;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      el.classList.remove("kds-flash--show");
    }, 3500);
  }

  function normStatus(s) {
    return String(s || "").toLowerCase().trim();
  }

  function shortId(id) {
    const s = String(id || "");
    const parts = s.split("-");
    const last = parts[parts.length - 1] || s.slice(-6);
    if (/^\d+$/.test(last) && last.length <= 4) return String(Number(last));
    return last;
  }

  function isAggOrder(o) {
    const c = String(o?.channel || o?.orderType || "").toLowerCase();
    if (c.includes("swiggy") || c.includes("zomato")) return true;
    return !!String(o?.platformOrderNo || "").trim();
  }

  /** Takeaway: our daily #. Swiggy/Zomato: platform order # only (never our bill token). */
  function displayToken(o) {
    const p = String(o?.platformOrderNo || "").trim();
    if (p) return p; // any platform # wins — never show our bill/daily token beside it
    if (isAggOrder(o)) {
      // Agg without platform # — still avoid bill token shaped ids
      const sid = shortId(o?.orderId || o?.id);
      if (sid && !/^(TA|SW|ZO|TK|PAY)-/i.test(String(o?.orderId || o?.id || ""))) return sid;
      return sid;
    }
    const n = Number(o?.dailyNo || o?.tokenNo) || 0;
    if (n > 0) return String(n);
    return shortId(o?.orderId || o?.id);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function paint() {
    const list = filtered();
    const by = {
      waiting: list.filter((o) => o.status === "waiting"),
      preparing: list.filter((o) => o.status === "preparing"),
      ready: list.filter((o) => o.status === "ready")
    };
    const t = i18n().t;
    const board = document.getElementById("kdsBoard");
    if (!board) return;

    const cols = ["waiting", "preparing", "ready"];

    board.innerHTML = cols
      .map((st) => {
        const rows = by[st];
        const body =
          rows.length === 0
            ? `<div class="kds-empty">${t("empty")}</div>`
            : rows.map(renderCard).join("");
        return `<section class="kds-col" data-status="${st}">
          <div class="kds-col-head"><span>${t(st)}</span><span class="kds-col-count">${rows.length}</span></div>
          <div class="kds-col-body" data-drop-status="${st}">${body}</div>
        </section>`;
      })
      .join("");

    // Drop strip under board: Ready → Served
    const host = board.parentElement;
    if (host && !host.querySelector(".kds-serve-strip")) {
      const serveStrip = document.createElement("div");
      serveStrip.className = "kds-serve-strip";
      serveStrip.setAttribute("data-drop-status", "served");
      serveStrip.innerHTML = `<span>↓ Drop here to mark SERVED</span>`;
      host.insertBefore(serveStrip, board.nextSibling);
    }

    bindCardClicks(board);
    bindDragAndDrop(board);
  }

  function bindCardClicks(board) {
    board.querySelectorAll(".kds-card").forEach((el) => {
      el.addEventListener("click", (ev) => {
        if (dragState?.moved) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        const btn = ev.target.closest("[data-act]");
        const id = el.getAttribute("data-id");
        if (btn?.getAttribute("data-act") === "undo") {
          ev.stopPropagation();
          onUndo?.(id);
          return;
        }
        if (btn?.getAttribute("data-act") === "cancel") {
          ev.stopPropagation();
          onCancel?.(id);
          return;
        }
        if (btn?.getAttribute("data-act") === "advance") {
          ev.stopPropagation();
          onAdvance?.(id);
          return;
        }
        onAdvance?.(id);
      });
    });
  }

  function clearDrag() {
    if (dragState?.ghost) dragState.ghost.remove();
    document.querySelectorAll(".kds-col-body.kds-drop-hot, .kds-serve-strip.kds-drop-hot").forEach((el) => {
      el.classList.remove("kds-drop-hot");
    });
    document.querySelectorAll(".kds-card.kds-dragging").forEach((el) => el.classList.remove("kds-dragging"));
    dragState = null;
  }

  function columnUnderPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const drop = el.closest("[data-drop-status]");
    return drop ? drop.getAttribute("data-drop-status") : null;
  }

  function bindDragAndDrop(board) {
    board.querySelectorAll(".kds-card").forEach((card) => {
      card.addEventListener(
        "pointerdown",
        (ev) => {
          if (ev.button != null && ev.button !== 0) return;
          if (ev.target.closest("[data-act]")) return; // buttons keep normal click
          const id = card.getAttribute("data-id");
          const fromStatus = card.getAttribute("data-status");
          if (!id) return;

          const rect = card.getBoundingClientRect();
          const ghost = card.cloneNode(true);
          ghost.classList.add("kds-card-ghost");
          ghost.style.width = `${rect.width}px`;
          ghost.style.left = `${rect.left}px`;
          ghost.style.top = `${rect.top}px`;
          document.body.appendChild(ghost);

          dragState = {
            id,
            fromStatus,
            startX: ev.clientX,
            startY: ev.clientY,
            offsetX: ev.clientX - rect.left,
            offsetY: ev.clientY - rect.top,
            ghost,
            moved: false,
            pointerId: ev.pointerId
          };
          try {
            card.setPointerCapture(ev.pointerId);
          } catch (_) {}
          card.classList.add("kds-dragging");
        },
        { passive: true }
      );

      card.addEventListener(
        "pointermove",
        (ev) => {
          if (!dragState || dragState.id !== card.getAttribute("data-id")) return;
          const dx = ev.clientX - dragState.startX;
          const dy = ev.clientY - dragState.startY;
          if (!dragState.moved && Math.hypot(dx, dy) < 8) return;
          dragState.moved = true;
          ev.preventDefault();
          const g = dragState.ghost;
          if (g) {
            g.style.left = `${ev.clientX - dragState.offsetX}px`;
            g.style.top = `${ev.clientY - dragState.offsetY}px`;
          }
          document.querySelectorAll(".kds-drop-hot").forEach((el) => el.classList.remove("kds-drop-hot"));
          const target = columnUnderPoint(ev.clientX, ev.clientY);
          if (target) {
            const hot = document.querySelector(`[data-drop-status="${target}"]`);
            hot?.classList.add("kds-drop-hot");
          }
        },
        { passive: false }
      );

      const endDrag = (ev) => {
        if (!dragState || dragState.id !== card.getAttribute("data-id")) return;
        const moved = dragState.moved;
        const id = dragState.id;
        const from = dragState.fromStatus;
        const target = moved ? columnUnderPoint(ev.clientX, ev.clientY) : null;
        clearDrag();
        if (!moved || !target || target === from) return;
        if (!["waiting", "preparing", "ready", "served"].includes(target)) return;
        onSetStatus?.(id, target);
      };

      card.addEventListener("pointerup", endDrag);
      card.addEventListener("pointercancel", () => clearDrag());
    });
  }

  function tickTimers() {
    document.querySelectorAll(".kds-card[data-id]").forEach((card) => {
      const id = card.getAttribute("data-id");
      const o = orders.find((x) => (x.id || x.orderId) === id);
      const el = card.querySelector("[data-timer]");
      if (!el || !o) return;
      const eta = estimateWaitMin(o, orders);
      el.textContent = o.status === "ready" ? "✓" : `~${eta}m`;
      el.classList.remove("warn", "late");
      if (eta > 25) el.classList.add("late");
      else if (eta > 15) el.classList.add("warn");
    });
  }

  let primed = false; // skip alerts on first snapshot after login
  const lastStatus = new Map(); // id → status across all tickets
  let lastNonEmptyAt = 0;

  function setOrders(next, { silent } = {}) {
    let incoming = (next || []).filter((o) =>
      ["waiting", "preparing", "ready", "served", "cancelled"].includes(normStatus(o.status))
    );
    const en = root.KG.kdsI18n?.getLang?.() === "en";

    // Weak-net glitch: sudden empty wipe of many live tickets — keep last good board
    const liveIncoming = incoming.filter((o) =>
      ["waiting", "preparing", "ready"].includes(normStatus(o.status))
    );
    if (
      !silent &&
      liveIncoming.length === 0 &&
      orders.length >= 2 &&
      Date.now() - lastNonEmptyAt < 10000
    ) {
      return;
    }
    if (liveIncoming.length) lastNonEmptyAt = Date.now();

    if (!silent) {
      const prevMap = new Map(orders.map((o) => [String(o.id || o.orderId), o]));
      let sayNew = false;
      let sayUpdate = false;
      let sayReady = false;
      let sayCancel = false;
      let sayServed = false;

      const incomingIds = new Set();
      incoming.forEach((o) => {
        const id = String(o.id || o.orderId || "");
        if (!id) return;
        incomingIds.add(id);
        const st = normStatus(o.status);
        const old = prevMap.get(id);
        const prevSt = lastStatus.has(id) ? lastStatus.get(id) : old ? normStatus(old.status) : null;
        const isNew = !old && !knownIds.has(id) && !lastStatus.has(id);

        if (primed && isNew && (st === "waiting" || o.beepFlag)) sayNew = true;
        if (
          primed &&
          !isNew &&
          old &&
          (o.lastEvent === "items_added" || o.lastEvent === "note") &&
          o.beepFlag
        ) {
          sayUpdate = true;
        } else if (primed && !isNew && old && o.beepFlag && old.beepFlag !== true) {
          sayUpdate = true;
        }

        if (primed && prevSt && prevSt !== st) {
          const sid = displayToken(o);
          const hash = isAggOrder(o) ? "" : "#";
          if (st === "ready") {
            showFlash(en ? `Order ${hash}${sid} is READY` : `ऑर्डर ${hash}${sid} तैयार है`, "ready");
            sayReady = true;
          } else if (st === "served") {
            showFlash(en ? `Order ${hash}${sid} delivered` : `ऑर्डर ${hash}${sid} डिलीवर`, "served");
            sayServed = true;
          } else if (st === "cancelled") {
            showFlash(en ? `Order ${hash}${sid} cancelled` : `ऑर्डर ${hash}${sid} रद्द`, "cancel");
            sayCancel = true;
          }
        }

        lastStatus.set(id, st);
        knownIds.add(id);
      });

      // Active-only query drops closed tickets — detect serve/cancel by disappearance
      // Ignore mass wipes (weak net); only trust small removals
      if (primed) {
        const removed = [];
        prevMap.forEach((old, id) => {
          if (!incomingIds.has(id)) removed.push({ old, id });
        });
        const trustRemovals = removed.length > 0 && removed.length <= 3;
        if (trustRemovals) {
          removed.forEach(({ old, id }) => {
            const prevSt = lastStatus.get(id) || normStatus(old.status);
            const sid = displayToken(old);
            const hash = isAggOrder(old) ? "" : "#";
            if (prevSt === "ready") {
              showFlash(en ? `Order ${hash}${sid} delivered` : `ऑर्डर ${hash}${sid} डिलीवर`, "served");
              sayServed = true;
              lastStatus.set(id, "served");
            } else if (prevSt === "waiting" || prevSt === "preparing") {
              showFlash(en ? `Order ${hash}${sid} cancelled` : `ऑर्डर ${hash}${sid} रद्द`, "cancel");
              sayCancel = true;
              lastStatus.set(id, "cancelled");
            }
          });
        }
      }

      const audio = root.KG.kdsAudio;
      if (sayNew) {
        if (typeof audio?.announceNew === "function") audio.announceNew();
        else audio?.ring?.();
      }
      if (sayUpdate && typeof audio?.announceUpdate === "function") audio.announceUpdate();
      if (sayReady && typeof audio?.announceReady === "function") audio.announceReady();
      if (sayCancel && typeof audio?.announceCancel === "function") audio.announceCancel();
      if (sayServed && typeof audio?.announce === "function") audio.announce("ready");
      primed = true;
    } else {
      incoming.forEach((o) => {
        const id = String(o.id || o.orderId || "");
        if (!id) return;
        knownIds.add(id);
        lastStatus.set(id, normStatus(o.status));
      });
      primed = true;
    }

    // Board columns only show active kitchen tickets
    orders = incoming.filter((o) => ["waiting", "preparing", "ready"].includes(normStatus(o.status)));
    paint();
    root.KG.kdsOffline?.saveSnapshot(orders);
  }

  function ACTIVE_CHECK(o) {
    return ["waiting", "preparing", "ready"].includes(o.status);
  }

  function setTypeFilter() {
    typeFilter = "all";
    paint();
  }

  function setTab() {
    tabMode = "columns";
    paint();
  }

  function start(handlers) {
    onAdvance = handlers?.onAdvance;
    onUndo = handlers?.onUndo;
    onCancel = handlers?.onCancel;
    onSetStatus = handlers?.onSetStatus;
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(tickTimers, 5000);
    paint();
  }

  function refreshLabels() {
    paint();
  }

  root.KG = root.KG || {};
  root.KG.kdsBoard = {
    setOrders,
    setTypeFilter,
    setTab,
    start,
    refreshLabels,
    getOrders: () => orders.slice()
  };
})(typeof window !== "undefined" ? window : globalThis);
