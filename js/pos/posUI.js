/**
 * PetPooja-style POS UI — event delegation, partial DOM updates, keyboard shortcuts.
 */
(function (root) {
  "use strict";

  const money = () => root.KG.money;
  let mounted = false;
  let unsub = null;
  let menuListCache = [];

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function syncIndicator() {
    const el = $("kgPosSync");
    if (!el) return;
    const n = root.KG.posState.getState().syncPending;
    el.className = "kg-pos-sync " + (n ? "pending" : "ok");
    el.textContent = n ? `Sync pending (${n})` : "Synced";
    el.title = n ? "Offline queue waiting to sync" : "All bills synced";
  }

  function renderCategories() {
    const el = $("kgPosCats");
    if (!el) return;
    const cats = root.KG.posMenu.categories();
    const active = root.KG.posState.getState().activeCategory;
    const allCount = root.KG.posMenu.getAll().length;
    el.innerHTML =
      `<button type="button" class="kg-pos-cat${active === "all" ? " active" : ""}" data-cat="all">All <span>${allCount}</span></button>` +
      cats
        .map(
          (c) =>
            `<button type="button" class="kg-pos-cat${active === c.name ? " active" : ""}" data-cat="${esc(
              c.name
            )}">${esc(c.name)} <span>${c.count}</span></button>`
        )
        .join("");
  }

  function renderMenu() {
    const st = root.KG.posState.getState();
    menuListCache = root.KG.posMenu.search(st.searchQuery, st.activeCategory);
    root.KG.posMenu.renderGrid($("kgPosMenuGrid"), menuListCache, { pageSize: menuListCache.length > 200 ? 100 : 500 });
  }

  function renderCart() {
    const list = $("kgPosCartList");
    const st = root.KG.posState.getState();
    if (!list) return;
    const m = money();
    if (!st.cart.length) {
      list.innerHTML = `<div class="kg-pos-empty">Tap items to add</div>`;
    } else {
      list.innerHTML = st.cart
        .map((l) => {
          const lineTotal = (Number(l.price) || 0) * (Number(l.qty) || 0);
          return `<div class="kg-pos-line" data-line="${esc(l.lineId)}">
            <div class="kg-pos-line-main">
              <div class="kg-pos-line-name">${esc(l.nameHi || l.name)}</div>
              <div class="kg-pos-line-en">${l.nameHi ? esc(l.name) : ""}</div>
              <button type="button" class="kg-pos-line-note-btn" data-act="note">Note</button>
            </div>
            <div class="kg-pos-line-qty">
              <button type="button" data-act="dec" aria-label="Decrease">−</button>
              <span data-act="setqty">${l.qty}</span>
              <button type="button" data-act="inc" aria-label="Increase">+</button>
            </div>
            <div class="kg-pos-line-amt">${esc(m.formatINR(lineTotal))}
              <button type="button" class="kg-pos-line-x" data-act="rm" aria-label="Remove">×</button>
            </div>
          </div>`;
        })
        .join("");
    }
    const totals = root.KG.posState.computeTotals();
    const set = (id, v) => {
      const el = $(id);
      if (el) el.textContent = v;
    };
    set("kgPosSubtotal", m.formatINR(totals.subtotal));
    set("kgPosDiscount", m.formatINR(totals.discount));
    set("kgPosCharges", m.formatINR(totals.charges));
    set("kgPosGst", m.formatINR(totals.gst));
    set("kgPosGrand", m.formatINR(totals.grandTotal));
    set("kgPosCartCount", `${st.cart.reduce((s, l) => s + l.qty, 0)} items`);
    const billEl = $("kgPosBillPreview");
    if (billEl) billEl.textContent = st.billNoPreview || "—";
  }

  function renderHeld() {
    const el = $("kgPosHeld");
    if (!el) return;
    const held = root.KG.posState.getState().held;
    if (!held.length) {
      el.innerHTML = "";
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.innerHTML =
      `<div class="kg-pos-held-title">Held bills (${held.length})</div>` +
      held
        .map(
          (h) =>
            `<button type="button" class="kg-pos-held-chip" data-hold="${esc(h.id)}">${esc(
              h.tableId || h.orderType || "Hold"
            )} · ${esc(money().formatINR(h.totals?.grandTotal || 0))}</button>`
        )
        .join("");
  }

  function renderTables() {
    const el = $("kgPosTables");
    if (!el) return;
    const st = root.KG.posState.getState();
    const show = st.orderType === "dinein";
    el.style.display = show ? "flex" : "none";
    if (!show) return;
    el.innerHTML = Object.values(st.tables)
      .map(
        (t) =>
          `<button type="button" class="kg-pos-table ${esc(t.status)}${
            st.tableId === t.id ? " selected" : ""
          }" data-table="${esc(t.id)}">${esc(t.label)}</button>`
      )
      .join("");
  }

  function setOrderTypeUi(type) {
    document.querySelectorAll("[data-order-type]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-order-type") === type);
    });
    renderTables();
  }

  function openSettleModal() {
    const totals = root.KG.posState.computeTotals();
    const m = money();
    const ov = $("kgPosSettleOverlay");
    if (!ov) return;
    ov.style.display = "flex";
    $("kgPosSettleTotal").textContent = m.formatINR(totals.grandTotal);
    const st = root.KG.posState.getState();
    const ot = st.orderType;
    const mode = $("kgPosSettleMode");
    if (mode) {
      if (ot === "swiggy") mode.value = "swiggy";
      else if (ot === "zomato") mode.value = "zomato";
      else mode.value = "cash";
    }
    applySettleMode();
  }

  function applySettleMode() {
    const mode = $("kgPosSettleMode")?.value || "cash";
    const totals = root.KG.posState.computeTotals();
    const split = $("kgPosSettleSplit");
    const cashBox = $("kgPosSettleCashBox");
    if (split) split.style.display = mode === "split" ? "grid" : "none";
    if (cashBox) cashBox.style.display = mode === "cash" ? "block" : "none";
    if (mode === "cash") {
      if ($("kgPosReceived")) $("kgPosReceived").value = String(totals.grandTotal);
      updateChange();
    }
    if (mode === "split") {
      if ($("kgPosPayCash")) $("kgPosPayCash").value = "";
      if ($("kgPosPayOnline")) $("kgPosPayOnline").value = "";
      if ($("kgPosPaySwiggy")) $("kgPosPaySwiggy").value = "";
      if ($("kgPosPayZomato")) $("kgPosPayZomato").value = "";
    }
  }

  function updateChange() {
    const totals = root.KG.posState.computeTotals();
    const received = Number($("kgPosReceived")?.value) || 0;
    const change = Math.max(0, received - totals.grandTotal);
    const el = $("kgPosChange");
    if (el) el.textContent = money().formatINR(change);
  }

  function paymentFromModal() {
    const mode = $("kgPosSettleMode")?.value || "cash";
    const totals = root.KG.posState.computeTotals();
    const t = totals.grandTotal;
    if (mode === "cash") return { cash: t, online: 0, swiggy: 0, zomato: 0 };
    if (mode === "online") return { cash: 0, online: t, swiggy: 0, zomato: 0 };
    if (mode === "swiggy") return { cash: 0, online: 0, swiggy: t, zomato: 0 };
    if (mode === "zomato") return { cash: 0, online: 0, swiggy: 0, zomato: t };
    return {
      cash: Number($("kgPosPayCash")?.value) || 0,
      online: Number($("kgPosPayOnline")?.value) || 0,
      swiggy: Number($("kgPosPaySwiggy")?.value) || 0,
      zomato: Number($("kgPosPayZomato")?.value) || 0
    };
  }

  async function doSettle(printBill) {
    const payment = paymentFromModal();
    const ov = $("kgPosSettleOverlay");
    if (ov) ov.style.display = "none";
    await root.KG.posCheckout.settle(payment, { printBill: !!printBill, printKOT: true });
    renderCart();
    renderHeld();
    syncIndicator();
  }

  function bindEvents() {
    const rootEl = $("kgPosRoot");
    if (!rootEl || rootEl.__kgBound) return;
    rootEl.__kgBound = true;

    rootEl.addEventListener("click", (e) => {
      const t = e.target.closest("[data-menu-id],[data-cat],[data-order-type],[data-act],[data-hold],[data-table],[data-pos-action]");
      if (!t) return;

      if (t.hasAttribute("data-menu-id")) {
        const id = t.getAttribute("data-menu-id");
        const item = root.KG.posMenu.getById(id);
        if (item) {
          root.KG.posState.addLine(item);
          // Partial cart update only
          renderCart();
        }
        return;
      }
      if (t.hasAttribute("data-cat")) {
        root.KG.posState.getState().activeCategory = t.getAttribute("data-cat");
        renderCategories();
        renderMenu();
        return;
      }
      if (t.hasAttribute("data-order-type")) {
        const ot = t.getAttribute("data-order-type");
        root.KG.posState.setOrderType(ot);
        setOrderTypeUi(ot);
        return;
      }
      if (t.hasAttribute("data-table")) {
        root.KG.posState.setTable(t.getAttribute("data-table"));
        renderTables();
        return;
      }
      if (t.hasAttribute("data-hold")) {
        root.KG.posState.reopenHold(t.getAttribute("data-hold"));
        renderCart();
        renderHeld();
        setOrderTypeUi(root.KG.posState.getState().orderType);
        return;
      }
      if (t.hasAttribute("data-act")) {
        const line = t.closest("[data-line]");
        const lineId = line?.getAttribute("data-line");
        const act = t.getAttribute("data-act");
        const st = root.KG.posState.getState();
        const row = st.cart.find((l) => l.lineId === lineId);
        if (!row) return;
        if (act === "inc") root.KG.posState.updateQty(lineId, row.qty + 1);
        if (act === "dec") root.KG.posState.updateQty(lineId, row.qty - 1);
        if (act === "rm") root.KG.posState.removeLine(lineId);
        if (act === "note") {
          const note = prompt("Line note", row.note || "");
          if (note != null) root.KG.posState.setLineNote(lineId, note);
        }
        if (act === "setqty") {
          const v = prompt("Quantity", String(row.qty));
          if (v != null) root.KG.posState.updateQty(lineId, v);
        }
        renderCart();
        return;
      }
      if (t.hasAttribute("data-pos-action")) {
        const a = t.getAttribute("data-pos-action");
        handleAction(a);
      }
    });

    const search = $("kgPosSearch");
    if (search) {
      search.addEventListener("input", () => {
        root.KG.posState.getState().searchQuery = search.value;
        root.KG.posMenu.debouncedSearch(search.value, root.KG.posState.getState().activeCategory, (list) => {
          menuListCache = list;
          root.KG.posMenu.renderGrid($("kgPosMenuGrid"), list, {
            pageSize: list.length > 200 ? 100 : 500
          });
        });
      });
    }

    document.addEventListener("keydown", onKey);
  }

  function handleAction(a) {
    const st = root.KG.posState.getState();
    if (a === "hold") {
      root.KG.posState.holdCurrent();
      renderCart();
      renderHeld();
      if (typeof root.toast === "function") root.toast("Bill held", "success");
    }
    if (a === "kot") {
      if (!st.cart.length) return root.toast?.("Cart empty", "error");
      root.KG.print.printKOT({
        items: st.cart,
        cart: st.cart,
        orderType: st.orderType,
        tableId: st.tableId,
        helpers: {
          prepLabel: root.prepLabel || ((p) => p),
          translateEnToHi: root.translateEnToHi || (async (x) => x),
          escapeHtml: esc
        }
      });
    }
    if (a === "kotprint") {
      handleAction("kot");
    }
    if (a === "bill") {
      if (!st.cart.length) return root.toast?.("Cart empty", "error");
      const totals = root.KG.posState.computeTotals();
      root.KG.print.printBill({
        billNo: "PREVIEW",
        items: st.cart,
        subtotal: totals.subtotal,
        discount: totals.discount,
        gst: totals.gst,
        grandTotal: totals.grandTotal,
        paymentLabel: "UNPAID"
      });
    }
    if (a === "settle" || a === "settleprint") {
      openSettleModal();
    }
    if (a === "discount") {
      const pct = prompt("Discount %", String(st.discountPercent || 0));
      if (pct == null) return;
      st.discountPercent = Math.max(0, Number(pct) || 0);
      st.discountPaise = 0;
      renderCart();
    }
    if (a === "charges") {
      const v = prompt("Packaging / service charge ₹", String(money().fromPaise(st.chargesPaise)));
      if (v == null) return;
      st.chargesPaise = money().toPaise(v);
      renderCart();
    }
    if (a === "settings") {
      const ov = $("kgPosSettingsOverlay");
      if (ov) ov.style.display = "flex";
    }
    if (a === "clear") {
      root.KG.posState.clearCart();
      renderCart();
    }
    if (a === "reprint-kot") root.KG.print.reprintLastKOT();
    if (a === "reprint-bill") root.KG.print.reprintLastBill();
  }

  function onKey(e) {
    const section = $("pos-section");
    if (!section || !section.classList.contains("active")) return;
    if (e.key === "F2") {
      e.preventDefault();
      $("kgPosSearch")?.focus();
    }
    if (e.key === "F4") {
      e.preventDefault();
      handleAction("kot");
    }
    if (e.key === "F6") {
      e.preventDefault();
      handleAction("bill");
    }
    if (e.key === "F8") {
      e.preventDefault();
      handleAction("settle");
    }
    if (e.key === "Escape") {
      const search = $("kgPosSearch");
      if (search) {
        search.value = "";
        root.KG.posState.getState().searchQuery = "";
        renderMenu();
      }
      const ov = $("kgPosSettleOverlay");
      if (ov) ov.style.display = "none";
    }
    if (e.key === "Enter" && document.activeElement === $("kgPosSearch")) {
      e.preventDefault();
      if (menuListCache[0]) {
        root.KG.posState.addLine(menuListCache[0]);
        renderCart();
      }
    }
  }

  async function loadMenuIntoIndex() {
    let list = [];
    try {
      if (root.state?.menuItems?.length) list = root.state.menuItems;
      else if (root.api?.menuItems?.list) list = await root.api.menuItems.list();
    } catch (e) {
      console.warn(e);
    }
    if (!list.length && root.KILOGRAM_MENU_SEED) {
      list = (root.KILOGRAM_MENU_SEED || []).map((m, i) =>
        Object.assign({ id: m.id || `seed_${i}`, available: true }, m)
      );
    }
    root.KG.posMenu.loadFromArray(list);
    renderCategories();
    renderMenu();
  }

  async function onEnter() {
    root.KG.pos = root.KG.pos || {};
    root.KG.pos.devPerf = true;
    await loadMenuIntoIndex();
    renderCart();
    renderHeld();
    setOrderTypeUi(root.KG.posState.getState().orderType);
    syncIndicator();
    try {
      await root.KG.print.autoReconnect();
    } catch (_) {}
    root.KG.posCheckout.syncQueue().catch(() => {});
    const clock = $("kgPosClock");
    if (clock && !clock.__timer) {
      clock.__timer = setInterval(() => {
        clock.textContent = new Date().toLocaleString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          day: "2-digit",
          month: "short"
        });
      }, 1000);
    }
    const nameEl = $("kgPosCashier");
    if (nameEl) {
      try {
        nameEl.textContent =
          root.KgAuth?.getProfile?.()?.name || root.KgAuth?.currentUser?.email || "Cashier";
      } catch (_) {
        nameEl.textContent = "Cashier";
      }
    }
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    bindEvents();
    unsub = root.KG.posState.subscribe((evt) => {
      if (evt === "sync") syncIndicator();
      if (evt === "hold" || evt === "reopen") {
        renderHeld();
        renderCart();
      }
    });

    // Settle modal buttons
    $("kgPosSettleMode")?.addEventListener("change", applySettleMode);
    $("kgPosReceived")?.addEventListener("input", updateChange);
    document.querySelectorAll("[data-quick-cash]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const totals = root.KG.posState.computeTotals();
        const v = btn.getAttribute("data-quick-cash");
        const received = v === "exact" ? totals.grandTotal : Number(v);
        if ($("kgPosReceived")) $("kgPosReceived").value = String(received);
        updateChange();
      });
    });
    $("kgPosSettleConfirm")?.addEventListener("click", () => doSettle(false));
    $("kgPosSettlePrint")?.addEventListener("click", () => doSettle(true));
    $("kgPosSettleCancel")?.addEventListener("click", () => {
      const ov = $("kgPosSettleOverlay");
      if (ov) ov.style.display = "none";
    });

    // Printer settings
    $("kgPosConnectUsb")?.addEventListener("click", async () => {
      try {
        await root.KG.transports.webUsb.connect();
        root.toast?.("USB printer connected", "success");
      } catch (e) {
        root.toast?.(e.message || "USB connect failed", "error");
      }
    });
    $("kgPosConnectSerial")?.addEventListener("click", async () => {
      try {
        await root.KG.transports.webSerial.connect(root.KG.print.prefs());
        root.toast?.("Serial printer connected", "success");
      } catch (e) {
        root.toast?.(e.message || "Serial connect failed", "error");
      }
    });
    $("kgPosConnectBle")?.addEventListener("click", async () => {
      try {
        await root.KG.transports.bluetooth.connect();
        root.toast?.("Bluetooth printer connected", "success");
      } catch (e) {
        root.toast?.(e.message || "Bluetooth connect failed", "error");
      }
    });
    $("kgPosTestPrint")?.addEventListener("click", () => root.KG.print.testPrint());
    $("kgPosUseSystemPrinter")?.addEventListener("click", () => {
      root.KG.print.savePrefs({ kotTransport: "browser", billTransport: "browser" });
      root.toast?.("Using system printer (browser dialog)", "success");
    });
    $("kgPosSettingsClose")?.addEventListener("click", () => {
      const ov = $("kgPosSettingsOverlay");
      if (ov) ov.style.display = "none";
    });
    $("kgPosSaveSettings")?.addEventListener("click", () => {
      const paper = Number($("kgPosPaperWidth")?.value) || 80;
      const baud = Number($("kgPosBaud")?.value) || 9600;
      const gst = Number($("kgPosGstPct")?.value);
      root.KG.print.savePrefs({
        paperWidthMm: paper,
        baudRate: baud,
        autoCut: !!$("kgPosAutoCut")?.checked,
        cashDrawer: !!$("kgPosDrawer")?.checked
      });
      root.KG.posState.setSettings({
        gstPercent: Number.isFinite(gst) ? gst : 5,
        gstEnabled: !!$("kgPosGstOn")?.checked,
        address: $("kgPosAddress")?.value || "",
        gstin: $("kgPosGstin")?.value || "",
        phone: $("kgPosPhone")?.value || "",
        upiId: $("kgPosUpi")?.value || ""
      });
      root.toast?.("Settings saved", "success");
      const ov = $("kgPosSettingsOverlay");
      if (ov) ov.style.display = "none";
      renderCart();
    });
  }

  const api = {
    mount,
    onEnter,
    renderCart,
    renderMenu,
    openSettleModal,
    handleAction
  };

  root.KG = root.KG || {};
  root.KG.posUI = api;
  root.KG.pos = root.KG.pos || {};
  root.KG.pos.devPerf = true;
  root.KG.pos.mount = mount;
  root.KG.pos.onEnter = onEnter;

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
