/**
 * PetPooja-style POS UI — event delegation, modals, variants, void, keyboard.
 */
(function (root) {
  "use strict";

  const money = () => root.KG.money;
  let mounted = false;
  let unsub = null;
  let menuListCache = [];
  let inputResolver = null;
  let pendingVariantGroup = null;
  let selectedVariantId = "";
  let selectedAddons = new Set();

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

  function toast(msg, type) {
    if (typeof root.toast === "function") root.toast(msg, type || "info");
    else console.log("[POS]", msg);
  }

  function openInputModal({ title, hint, value, type }) {
    return new Promise((resolve) => {
      inputResolver = resolve;
      $("kgPosInputTitle").textContent = title || "Input";
      $("kgPosInputHint").textContent = hint || "";
      const inp = $("kgPosInputValue");
      inp.type = type || "text";
      inp.value = value != null ? String(value) : "";
      $("kgPosInputOverlay").style.display = "flex";
      setTimeout(() => inp.focus(), 30);
    });
  }

  function closeInputModal(result) {
    $("kgPosInputOverlay").style.display = "none";
    const r = inputResolver;
    inputResolver = null;
    if (r) r(result);
  }

  function syncIndicator() {
    const el = $("kgPosSync");
    if (!el) return;
    const n = root.KG.posState.getState().syncPending;
    el.className = "kg-pos-sync " + (n ? "pending" : "ok");
    el.textContent = n ? `Sync pending (${n})` : "Synced";
  }

  function syncCustomerFromInputs() {
    root.KG.posState.setCustomer($("kgPosCustomerName")?.value || "", $("kgPosCustomerPhone")?.value || "");
  }

  function renderCategories() {
    const el = $("kgPosCats");
    if (!el) return;
    const cats = root.KG.posMenu.categories();
    const active = root.KG.posState.getState().activeCategory;
    const allCount = root.KG.posMenu.getGroups().length;
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
    root.KG.posMenu.renderGrid($("kgPosMenuGrid"), menuListCache, {
      pageSize: menuListCache.length > 200 ? 100 : 500
    });
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
          const variant = l.variantLabel ? ` · ${esc(l.variantLabel)}` : "";
          return `<div class="kg-pos-line" data-line="${esc(l.lineId)}">
            <div class="kg-pos-line-main">
              <div class="kg-pos-line-name">${esc(l.nameHi || l.name)}${variant}</div>
              <div class="kg-pos-line-en">${l.nameHi ? esc(l.name) : ""}${
            l.note ? ` · ${esc(l.note)}` : ""
          }</div>
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
    if (billEl) billEl.textContent = st.lastBillId || st.billNoPreview || "—";
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
              h.customerName || h.tableId || h.orderType || "Hold"
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

  function openVariantPicker(group) {
    pendingVariantGroup = group;
    selectedAddons = new Set();
    selectedVariantId = String(group.variants[0]?.id || group.variants[0]?.menuItemId || "");
    $("kgPosVariantTitle").textContent = group.baseName;
    const list = $("kgPosVariantList");
    const m = money();
    list.innerHTML = group.variants
      .map((v) => {
        const id = String(v.id || v.menuItemId);
        return `<button type="button" class="kg-pos-variant-btn${
          id === selectedVariantId ? " active" : ""
        }" data-variant-id="${esc(id)}">
          <b>${esc(v.__variantLabel || "Default")}</b>
          <span>${esc(m.formatINR(v.price))}</span>
          <div class="muted">${esc(v.nameHi || v.name)}</div>
        </button>`;
      })
      .join("");
    const addons = group.addons || root.KG.posMenu.DEFAULT_ADDONS;
    $("kgPosAddonList").innerHTML = addons
      .map(
        (a) =>
          `<label class="kg-pos-addon"><input type="checkbox" data-addon-id="${esc(
            a.id
          )}" /> ${esc(a.nameHi || a.name)} · ${esc(m.formatINR(a.price))}</label>`
      )
      .join("");
    $("kgPosVariantOverlay").style.display = "flex";
  }

  function confirmVariantAdd() {
    if (!pendingVariantGroup) return;
    const item = pendingVariantGroup.variants.find(
      (v) => String(v.id || v.menuItemId) === selectedVariantId
    );
    if (!item) return toast("Pick a size", "error");
    root.KG.posState.addLine({
      ...item,
      menuItemId: item.id || item.menuItemId,
      variantLabel: item.__variantLabel || ""
    });
    const addons = pendingVariantGroup.addons || root.KG.posMenu.DEFAULT_ADDONS;
    selectedAddons.forEach((aid) => {
      const a = addons.find((x) => x.id === aid);
      if (a) {
        root.KG.posState.addLine({
          menuItemId: a.id,
          name: a.name,
          nameHi: a.nameHi || "",
          price: a.price,
          qty: 1,
          addonOf: item.id || item.menuItemId
        });
      }
    });
    $("kgPosVariantOverlay").style.display = "none";
    pendingVariantGroup = null;
    renderCart();
  }

  function openSettleModal() {
    syncCustomerFromInputs();
    const totals = root.KG.posState.computeTotals();
    const ov = $("kgPosSettleOverlay");
    if (!ov) return;
    ov.style.display = "flex";
    $("kgPosSettleTotal").textContent = money().formatINR(totals.grandTotal);
    const st = root.KG.posState.getState();
    const mode = $("kgPosSettleMode");
    if (mode) {
      if (st.orderType === "swiggy") mode.value = "swiggy";
      else if (st.orderType === "zomato") mode.value = "zomato";
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
    if (mode === "cash" && $("kgPosReceived")) {
      $("kgPosReceived").value = String(totals.grandTotal);
      updateChange();
    }
  }

  function updateChange() {
    const totals = root.KG.posState.computeTotals();
    const received = Number($("kgPosReceived")?.value) || 0;
    const el = $("kgPosChange");
    if (el) el.textContent = money().formatINR(Math.max(0, received - totals.grandTotal));
  }

  function paymentFromModal() {
    const mode = $("kgPosSettleMode")?.value || "cash";
    const t = root.KG.posState.computeTotals().grandTotal;
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
    syncCustomerFromInputs();
    const payment = paymentFromModal();
    const ov = $("kgPosSettleOverlay");
    if (ov) ov.style.display = "none";
    await root.KG.posCheckout.settle(payment, { printBill: !!printBill, printKOT: true });
    renderCart();
    renderHeld();
    syncIndicator();
  }

  async function handleAction(a) {
    const st = root.KG.posState.getState();
    if (a === "hold") {
      syncCustomerFromInputs();
      root.KG.posState.holdCurrent();
      renderCart();
      renderHeld();
      toast("Bill held", "success");
    }
    if (a === "kot" || a === "kotprint") {
      if (!st.cart.length) return toast("Cart empty", "error");
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
    if (a === "bill") {
      if (!st.cart.length) return toast("Cart empty", "error");
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
    if (a === "settle" || a === "settleprint") openSettleModal();
    if (a === "discount") {
      const pct = await openInputModal({
        title: "Discount %",
        hint: "Employee max may apply",
        value: st.discountPercent || 0,
        type: "number"
      });
      if (pct == null) return;
      st.discountPercent = Math.max(0, Number(pct) || 0);
      st.discountPaise = 0;
      renderCart();
    }
    if (a === "charges") {
      const v = await openInputModal({
        title: "Packaging / service charge",
        hint: "Amount in ₹",
        value: money().fromPaise(st.chargesPaise),
        type: "number"
      });
      if (v == null) return;
      st.chargesPaise = money().toPaise(v);
      renderCart();
    }
    if (a === "settings") {
      const p = root.KG.print.prefs();
      if ($("kgPosKotTransport")) $("kgPosKotTransport").value = p.kotTransport || "auto";
      if ($("kgPosBillTransport")) $("kgPosBillTransport").value = p.billTransport || "auto";
      if ($("kgPosPaperWidth")) $("kgPosPaperWidth").value = String(p.paperWidthMm || 80);
      if ($("kgPosBaud")) $("kgPosBaud").value = String(p.baudRate || 9600);
      const s = st.settings;
      if ($("kgPosGstOn")) $("kgPosGstOn").checked = !!s.gstEnabled;
      if ($("kgPosGstPct")) $("kgPosGstPct").value = s.gstPercent ?? 5;
      if ($("kgPosAddress")) $("kgPosAddress").value = s.address || "";
      if ($("kgPosGstin")) $("kgPosGstin").value = s.gstin || "";
      if ($("kgPosPhone")) $("kgPosPhone").value = s.phone || "";
      if ($("kgPosUpi")) $("kgPosUpi").value = s.upiId || "";
      $("kgPosSettingsOverlay").style.display = "flex";
    }
    if (a === "clear") {
      root.KG.posState.clearCart();
      renderCart();
    }
    if (a === "reprint-kot") root.KG.print.reprintLastKOT();
    if (a === "reprint-bill") root.KG.print.reprintLastBill();
    if (a === "void") {
      const last = st.lastBillId || "";
      if ($("kgPosVoidBillId")) $("kgPosVoidBillId").value = last;
      $("kgPosVoidOverlay").style.display = "flex";
    }
  }

  function bindEvents() {
    const rootEl = $("kgPosRoot");
    if (!rootEl || rootEl.__kgBound) return;
    rootEl.__kgBound = true;

    rootEl.addEventListener("click", async (e) => {
      const t = e.target.closest(
        "[data-menu-id],[data-group-key],[data-cat],[data-order-type],[data-act],[data-hold],[data-table],[data-pos-action]"
      );
      if (!t) return;

      if (t.hasAttribute("data-group-key")) {
        const g = root.KG.posMenu.getGroup(t.getAttribute("data-group-key"));
        if (!g) return;
        if (g.hasVariants || (g.addons && g.addons.length)) openVariantPicker(g);
        else {
          const item = g.variants[0];
          if (item) {
            root.KG.posState.addLine({ ...item, menuItemId: item.id || item.menuItemId });
            renderCart();
          }
        }
        return;
      }
      if (t.hasAttribute("data-menu-id")) {
        const item = root.KG.posMenu.getById(t.getAttribute("data-menu-id"));
        if (item) {
          root.KG.posState.addLine(item);
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
        root.KG.posState.setOrderType(t.getAttribute("data-order-type"));
        setOrderTypeUi(t.getAttribute("data-order-type"));
        return;
      }
      if (t.hasAttribute("data-table")) {
        root.KG.posState.setTable(t.getAttribute("data-table"));
        renderTables();
        return;
      }
      if (t.hasAttribute("data-hold")) {
        root.KG.posState.reopenHold(t.getAttribute("data-hold"));
        const st = root.KG.posState.getState();
        if ($("kgPosCustomerName")) $("kgPosCustomerName").value = st.customerName || "";
        if ($("kgPosCustomerPhone")) $("kgPosCustomerPhone").value = st.customerPhone || "";
        renderCart();
        renderHeld();
        setOrderTypeUi(st.orderType);
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
          const note = await openInputModal({
            title: "Line note",
            hint: "e.g. less spicy",
            value: row.note || ""
          });
          if (note != null) root.KG.posState.setLineNote(lineId, note);
        }
        if (act === "setqty") {
          const v = await openInputModal({
            title: "Quantity",
            value: row.qty,
            type: "number"
          });
          if (v != null) root.KG.posState.updateQty(lineId, v);
        }
        renderCart();
        return;
      }
      if (t.hasAttribute("data-pos-action")) handleAction(t.getAttribute("data-pos-action"));
    });

    $("kgPosSearch")?.addEventListener("input", () => {
      root.KG.posState.getState().searchQuery = $("kgPosSearch").value;
      root.KG.posMenu.debouncedSearch(
        $("kgPosSearch").value,
        root.KG.posState.getState().activeCategory,
        (list) => {
          menuListCache = list;
          root.KG.posMenu.renderGrid($("kgPosMenuGrid"), list, {
            pageSize: list.length > 200 ? 100 : 500
          });
        }
      );
    });

    ["kgPosCustomerName", "kgPosCustomerPhone"].forEach((id) => {
      $(id)?.addEventListener("change", syncCustomerFromInputs);
      $(id)?.addEventListener("blur", syncCustomerFromInputs);
    });

    document.addEventListener("keydown", onKey);
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
      closeInputModal(null);
      ["kgPosSettleOverlay", "kgPosSettingsOverlay", "kgPosVariantOverlay", "kgPosVoidOverlay"].forEach(
        (id) => {
          const el = $(id);
          if (el) el.style.display = "none";
        }
      );
      if ($("kgPosSearch") && document.activeElement === $("kgPosSearch")) {
        $("kgPosSearch").value = "";
        root.KG.posState.getState().searchQuery = "";
        renderMenu();
      }
    }
    if (e.key === "Enter" && document.activeElement === $("kgPosSearch")) {
      e.preventDefault();
      const flat = root.KG.posMenu.searchItems(
        root.KG.posState.getState().searchQuery,
        root.KG.posState.getState().activeCategory,
        1
      );
      if (flat[0]) {
        root.KG.posState.addLine(flat[0]);
        renderCart();
      } else if (menuListCache[0]?.variants?.[0]) {
        openVariantPicker(menuListCache[0]);
      }
    }
    if (e.key === "Enter" && $("kgPosInputOverlay")?.style.display === "flex") {
      e.preventDefault();
      closeInputModal($("kgPosInputValue")?.value);
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
    try {
      await root.KG.posState.hydrateOfflineQueue?.();
    } catch (_) {}
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

    $("kgPosInputOk")?.addEventListener("click", () => closeInputModal($("kgPosInputValue")?.value));
    $("kgPosInputCancel")?.addEventListener("click", () => closeInputModal(null));

    $("kgPosVariantClose")?.addEventListener("click", () => {
      $("kgPosVariantOverlay").style.display = "none";
      pendingVariantGroup = null;
    });
    $("kgPosVariantList")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-variant-id]");
      if (!btn) return;
      selectedVariantId = btn.getAttribute("data-variant-id");
      $("kgPosVariantList")
        .querySelectorAll(".kg-pos-variant-btn")
        .forEach((b) => b.classList.toggle("active", b.getAttribute("data-variant-id") === selectedVariantId));
    });
    $("kgPosAddonList")?.addEventListener("change", (e) => {
      const cb = e.target.closest("[data-addon-id]");
      if (!cb) return;
      const id = cb.getAttribute("data-addon-id");
      if (cb.checked) selectedAddons.add(id);
      else selectedAddons.delete(id);
    });
    $("kgPosVariantAdd")?.addEventListener("click", confirmVariantAdd);

    $("kgPosVoidCancel")?.addEventListener("click", () => {
      $("kgPosVoidOverlay").style.display = "none";
    });
    $("kgPosVoidConfirm")?.addEventListener("click", async () => {
      const billId = ($("kgPosVoidBillId")?.value || "").trim();
      const reason = ($("kgPosVoidReason")?.value || "").trim();
      if (!billId) return toast("Enter bill id", "error");
      try {
        // Allow billNo lookup
        let id = billId;
        if (!billId.startsWith("bill_") && firebase?.firestore) {
          const snap = await firebase
            .firestore()
            .collection("posBills")
            .where("billNo", "==", billId)
            .limit(1)
            .get();
          if (!snap.empty) id = snap.docs[0].id;
        }
        await root.KG.posCheckout.voidBill(id, reason);
        $("kgPosVoidOverlay").style.display = "none";
      } catch (e) {
        toast(e.message || "Void failed", "error");
      }
    });

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
      $("kgPosSettleOverlay").style.display = "none";
    });

    $("kgPosConnectUsb")?.addEventListener("click", async () => {
      try {
        await root.KG.transports.webUsb.connect();
        toast("USB printer connected", "success");
      } catch (e) {
        toast(e.message || "USB connect failed", "error");
      }
    });
    $("kgPosConnectSerial")?.addEventListener("click", async () => {
      try {
        await root.KG.transports.webSerial.connect(root.KG.print.prefs());
        toast("Serial printer connected", "success");
      } catch (e) {
        toast(e.message || "Serial connect failed", "error");
      }
    });
    $("kgPosConnectBle")?.addEventListener("click", async () => {
      try {
        await root.KG.transports.bluetooth.connect();
        toast("Bluetooth printer connected", "success");
      } catch (e) {
        toast(e.message || "Bluetooth connect failed", "error");
      }
    });
    $("kgPosTestPrint")?.addEventListener("click", () => root.KG.print.testPrint());
    $("kgPosUseSystemPrinter")?.addEventListener("click", () => {
      root.KG.print.savePrefs({ kotTransport: "browser", billTransport: "browser" });
      if ($("kgPosKotTransport")) $("kgPosKotTransport").value = "browser";
      if ($("kgPosBillTransport")) $("kgPosBillTransport").value = "browser";
      toast("Using system printer (browser dialog)", "success");
    });
    $("kgPosSettingsClose")?.addEventListener("click", () => {
      $("kgPosSettingsOverlay").style.display = "none";
    });
    $("kgPosSaveSettings")?.addEventListener("click", () => {
      const paper = Number($("kgPosPaperWidth")?.value) || 80;
      const baud = Number($("kgPosBaud")?.value) || 9600;
      const gst = Number($("kgPosGstPct")?.value);
      root.KG.print.savePrefs({
        paperWidthMm: paper,
        baudRate: baud,
        autoCut: !!$("kgPosAutoCut")?.checked,
        cashDrawer: !!$("kgPosDrawer")?.checked,
        kotTransport: $("kgPosKotTransport")?.value || "auto",
        billTransport: $("kgPosBillTransport")?.value || "auto"
      });
      root.KG.posState.setSettings({
        gstPercent: Number.isFinite(gst) ? gst : 5,
        gstEnabled: !!$("kgPosGstOn")?.checked,
        address: $("kgPosAddress")?.value || "",
        gstin: $("kgPosGstin")?.value || "",
        phone: $("kgPosPhone")?.value || "",
        upiId: $("kgPosUpi")?.value || ""
      });
      toast("Settings saved", "success");
      $("kgPosSettingsOverlay").style.display = "none";
      renderCart();
    });
  }

  const api = {
    mount,
    onEnter,
    renderCart,
    renderMenu,
    openSettleModal,
    handleAction,
    openInputModal
  };

  root.KG = root.KG || {};
  root.KG.posUI = api;
  root.KG.pos = root.KG.pos || {};
  root.KG.pos.devPerf = true;
  root.KG.pos.mount = mount;
  root.KG.pos.onEnter = onEnter;

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
