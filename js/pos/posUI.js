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

  function cleanVar(label) {
    return root.KG.posMenu?.cleanVariantLabel?.(label) || "";
  }

  function stripSize(name) {
    return root.KG.posMenu?.stripTrailingSize?.(name) || String(name || "").trim();
  }

  function sizeFor(name, variant) {
    return root.KG.posMenu?.sizeSuffix?.(name, variant) || "";
  }

  /** Build cart line payload without Default / double size. */
  function lineFromItem(item, overrides) {
    const base = item.__base || item.name;
    const variantLabel = cleanVar(item.__variantLabel || overrides?.variantLabel || "");
    return {
      ...item,
      name: base,
      nameHi: stripSize(item.nameHi || ""),
      menuItemId: item.id || item.menuItemId,
      variantLabel,
      ...(overrides || {})
    };
  }

  /** Hinglish / English kitchen notes → Hindi for KDS. */
  async function toKitchenNoteHi(raw) {
    const q0 = String(raw || "").trim();
    if (!q0) return "";
    if (/[\u0900-\u097F]/.test(q0) && !/[A-Za-z]/.test(q0)) return q0;

    const phrases = [
      [/bilkul\s*hi\s*light\s*bhaji\s*krni\s*hai/gi, "बिल्कुल लाइट भाजी करनी है"],
      [/bilkul\s*hi\s*light\s*bhaji/gi, "बिल्कुल लाइट भाजी"],
      [/bilkul\s*(hi\s*)?light/gi, "बिल्कुल लाइट"],
      [/kam\s*teekh[ai]|kam\s*tikh[ai]|less\s*spicy/gi, "कम तीखा"],
      [/zyada\s*teekh[ai]|extra\s*spicy|more\s*spicy/gi, "ज़्यादा तीखा"],
      [/no\s*onion|bina\s*pyaz|without\s*onion/gi, "बिना प्याज"],
      [/no\s*garlic|bina\s*lehsun/gi, "बिना लहसुन"],
      [/extra\s*butter|zyada\s*butter/gi, "एक्स्ट्रा बटर"],
      [/extra\s*cheese/gi, "एक्स्ट्रा चीज़"],
      [/extra\s*pau|extra\s*pav/gi, "एक्स्ट्रा पाव"],
      [/jain\s*please|jain/gi, "जैन"],
      [/swaminarayan/gi, "स्वामिनारायण"],
      [/light\s*bhaji/gi, "लाइट भाजी"],
      [/dry\s*bhaji/gi, "ड्राई भाजी"],
      [/with\s*butter/gi, "बटर के साथ"],
      [/urgent|jaldi/gi, "जल्दी"]
    ];
    let out = q0;
    phrases.forEach(([re, hi]) => {
      out = out.replace(re, hi);
    });
    // If still mostly Latin, try online translate
    if (/[A-Za-z]{3,}/.test(out) && typeof root.translateEnToHi === "function") {
      try {
        const t = await root.translateEnToHi(out);
        if (t && String(t).trim()) out = String(t).trim();
      } catch (_) {}
    }
    return out || q0;
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

  function openCustomItemModal() {
    const ov = $("kgPosCustomOverlay");
    if (!ov) return;
    if ($("kgPosCustomName")) $("kgPosCustomName").value = "";
    if ($("kgPosCustomPrice")) $("kgPosCustomPrice").value = "";
    ov.style.display = "flex";
    setTimeout(() => $("kgPosCustomName")?.focus(), 30);
  }

  function addCustomItemFromModal() {
    const name = String($("kgPosCustomName")?.value || "").trim();
    const price = Number($("kgPosCustomPrice")?.value);
    if (!name) return toast("Enter item / variety name", "error");
    if (!Number.isFinite(price) || price < 0) return toast("Enter a valid price", "error");
    root.KG.posState.addLine({
      menuItemId: "custom_" + Date.now().toString(36),
      name,
      nameHi: name,
      price,
      qty: 1,
      variantLabel: "",
      prep: "regular"
    });
    const ov = $("kgPosCustomOverlay");
    if (ov) ov.style.display = "none";
    renderCart();
    toast(`Added ${name}`, "success");
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
    let pendingKds = 0;
    let queueN = 0;
    try {
      const bills = JSON.parse(localStorage.getItem("kg_pos_bills_local_v1") || "[]");
      pendingKds = (bills || []).filter(
        (b) =>
          b &&
          b.kdsSynced !== true &&
          b.status !== "cancelled" &&
          b.status !== "void" &&
          (b.items || []).length
      ).length;
    } catch (_) {}
    try {
      queueN = root.KG.posState?.peekQueue?.()?.length || 0;
    } catch (_) {}
    const online = navigator.onLine !== false;
    const need = !online || pendingKds > 0 || queueN > 0;
    if (!need) {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
      return;
    }
    el.style.display = "";
    el.removeAttribute("hidden");
    el.setAttribute("aria-hidden", "false");
    el.className = "kg-pos-sync " + (online ? "warn" : "bad");
    el.textContent = !online
      ? "Weak/Offline · working locally"
      : pendingKds
        ? `Kitchen pending ${pendingKds}`
        : `Sync queue ${queueN}`;
  }

  function syncCustomerFromInputs() {
    root.KG.posState.setCustomer($("kgPosCustomerName")?.value || "", $("kgPosCustomerPhone")?.value || "");
  }

  function renderCategories() {
    const el = $("kgPosCats");
    if (!el) return;
    const cats = root.KG.posMenu.categories();
    const stCat = root.KG.posState.getState();
    if (String(stCat.activeCategory || "").toLowerCase() === "general") {
      stCat.activeCategory = "__favs";
    }
    const active = stCat.activeCategory;
    const allCount = root.KG.posMenu.getGroups().filter((g) => {
      const n = String(g.category || "").toLowerCase();
      return n !== "snacks" && n !== "general";
    }).length;
    const favN = root.KG.posFavourites?.getFavourites?.(24)?.length || 0;
    const hotN = root.KG.posFavourites?.getHotshots?.(16)?.length || 0;
    el.innerHTML =
      `<button type="button" class="kg-pos-cat kg-pos-cat-special${
        active === "__favs" ? " active" : ""
      }" data-cat="__favs">Favourites <span>${favN}</span></button>` +
      `<button type="button" class="kg-pos-cat kg-pos-cat-special${
        active === "__hot" ? " active" : ""
      }" data-cat="__hot">Hotshots <span>${hotN}</span></button>` +
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

  let menuRenderTimer = null;
  let lastMenuSig = "";

  function menuSignature(list, st) {
    const ids = (list || [])
      .slice(0, 40)
      .map((g) => g.key || g.id || g.baseName || "")
      .join("|");
    return `${st.activeCategory}|${st.searchQuery || ""}|${(list || []).length}|${ids}`;
  }

  function renderMenu(force) {
    const st = root.KG.posState.getState();
    menuListCache = root.KG.posMenu.search(st.searchQuery, st.activeCategory);
    const grid = $("kgPosMenuGrid");
    if (!grid) return;
    if (
      (st.activeCategory === "__favs" || st.activeCategory === "__hot") &&
      !menuListCache.length &&
      !(st.searchQuery || "").trim()
    ) {
      const empty = `<div class="kg-pos-empty">No ${
        st.activeCategory === "__hot" ? "hotshots" : "favourites"
      } yet — they fill as you bill.</div>`;
      if (grid.innerHTML !== empty) grid.innerHTML = empty;
      lastMenuSig = "empty:" + st.activeCategory;
      return;
    }
    const sig = menuSignature(menuListCache, st);
    if (!force && sig === lastMenuSig) return;
    lastMenuSig = sig;
    root.KG.posMenu.renderGrid(grid, menuListCache, {
      pageSize: menuListCache.length > 200 ? 100 : 500,
      showUnfav: st.activeCategory === "__favs" || st.activeCategory === "__hot"
    });
  }

  function scheduleRenderMenu() {
    if (menuRenderTimer) clearTimeout(menuRenderTimer);
    menuRenderTimer = setTimeout(() => renderMenu(false), 80);
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
          const isW = !!l.isWeightMerge;
          const lineTotal = isW
            ? Number(l.price) || 0
            : (Number(l.price) || 0) * (Number(l.qty) || 0);
          const size = sizeFor(l.name, l.variantLabel);
          const variant = size ? ` · ${esc(size)}` : "";
          const qtyLabel = isW ? esc(l.variantLabel || size || "—") : String(l.qty);
          return `<div class="kg-pos-line" data-line="${esc(l.lineId)}" data-weight="${isW ? "1" : "0"}">
            <div class="kg-pos-line-main">
              <div class="kg-pos-line-name">${esc(stripSize(l.name))}${isW ? "" : variant}</div>
              <div class="kg-pos-line-en">${l.note ? esc(l.note) : ""}</div>
              <button type="button" class="kg-pos-line-note-btn" data-act="note">Note</button>
            </div>
            <div class="kg-pos-line-side">
              <div class="kg-pos-line-amt">${esc(m.formatINR(lineTotal))}</div>
              <div class="kg-pos-line-qty">
                <button type="button" data-act="dec" aria-label="Decrease">−</button>
                <span data-act="${isW ? "weight" : "setqty"}">${qtyLabel}</span>
                <button type="button" data-act="inc" aria-label="Increase">+</button>
                <button type="button" class="kg-pos-line-x" data-act="rm" aria-label="Remove">×</button>
              </div>
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
    const discHint = $("kgPosDiscHint");
    if (discHint) {
      const d = Number(totals.discount) || 0;
      if (d > 0) {
        const stNow = root.KG.posState.getState();
        const how =
          stNow.discountPercent > 0
            ? `${stNow.discountPercent}% (−${m.formatINR(d)})`
            : `−${m.formatINR(d)}`;
        discHint.textContent = `Discount ${how}`;
        discHint.hidden = false;
      } else {
        discHint.textContent = "";
        discHint.hidden = true;
      }
    }
    set("kgPosGrand", m.formatINR(totals.grandTotal));
    const itemN = st.cart.reduce(
      (s, l) => s + (l.isWeightMerge ? 1 : Number(l.qty) || 0),
      0
    );
    set("kgPosCartCount", `${itemN} items`);
    const chLabel = $("kgPosCartChannelLabel");
    if (chLabel && st.amend?.label) {
      chLabel.textContent = `Add to #${st.amend.label} (delta only)`;
    }
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
    el.style.display = "flex";
    el.innerHTML =
      `<span class="kg-pos-held-title">Held (${held.length})</span>` +
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
    // Takeaway-only POS — no dine-in table picker
    el.style.display = "none";
    el.innerHTML = "";
  }

  function setOrderTypeUi() {
    const wrap = document.querySelector(".kg-pos-ordertypes");
    if (!wrap) return;
    const st = root.KG.posState.getState();
    const cur = st.orderType || "takeaway";
    wrap.innerHTML = ["takeaway", "swiggy", "zomato"]
      .map((t) => {
        const label = t === "takeaway" ? "Takeaway" : t === "swiggy" ? "Swiggy" : "Zomato";
        return `<button type="button" class="kg-pos-channel${cur === t ? " active" : ""}" data-channel="${t}">${label}</button>`;
      })
      .join("");
    const plat = $("kgPosPlatformNo");
    if (plat) {
      plat.style.display = cur === "swiggy" || cur === "zomato" ? "" : "none";
      plat.placeholder = cur === "swiggy" ? "Swiggy order #" : cur === "zomato" ? "Zomato order #" : "";
      plat.value = st.platformOrderNo || "";
    }
    const grandHint = $("kgPosAggHint");
    if (grandHint) {
      grandHint.style.display = cur === "swiggy" || cur === "zomato" ? "" : "none";
    }
    const chLabel = $("kgPosCartChannelLabel");
    if (chLabel) {
      const amend = root.KG.posState.getState().amend;
      if (amend?.label) {
        chLabel.textContent = `Add to #${amend.label} (delta only)`;
      } else {
        chLabel.textContent =
          cur === "swiggy" ? "Swiggy · ₹0 POS" : cur === "zomato" ? "Zomato · ₹0 POS" : "Takeaway";
      }
    }
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
        const sizeLabel = cleanVar(v.__variantLabel) || v.__base || v.name;
        return `<button type="button" class="kg-pos-variant-btn${
          id === selectedVariantId ? " active" : ""
        }" data-variant-id="${esc(id)}">
          <span><b>${esc(sizeLabel)}</b></span>
          <span>${esc(m.formatINR(v.price))}</span>
        </button>`;
      })
      .join("");
    const addons = Array.isArray(group.addons) ? group.addons : [];
    const addonEl = $("kgPosAddonList");
    if (addonEl) {
      addonEl.innerHTML = addons.length
        ? addons
            .map(
              (a) =>
                `<label class="kg-pos-addon"><input type="checkbox" data-addon-id="${esc(
                  a.id
                )}" /> <span>${esc(a.name)} · ${esc(m.formatINR(a.price))}</span></label>`
            )
            .join("")
        : "";
      addonEl.style.display = addons.length ? "" : "none";
    }
    $("kgPosVariantOverlay").style.display = "flex";
  }

  function confirmVariantAdd() {
    if (!pendingVariantGroup) return;
    const item = pendingVariantGroup.variants.find(
      (v) => String(v.id || v.menuItemId) === selectedVariantId
    );
    if (!item) return toast("Pick a size", "error");
    root.KG.posState.addLine(
      lineFromItem(item, {
        name: item.__base || pendingVariantGroup.baseName || item.name
      })
    );
    const addons = Array.isArray(pendingVariantGroup.addons) ? pendingVariantGroup.addons : [];
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
    const st = root.KG.posState.getState();
    const isAgg = st.orderType === "swiggy" || st.orderType === "zomato";
    if (isAgg && !String(st.platformOrderNo || "").trim()) {
      return toast("Enter " + (st.orderType === "swiggy" ? "Swiggy" : "Zomato") + " order number first", "error");
    }
    ov.style.display = "flex";
    if (isAgg) {
      $("kgPosSettleTotal").textContent = "₹0 (aggregator — kitchen only)";
    } else {
      $("kgPosSettleTotal").textContent = money().formatINR(totals.grandTotal);
    }
    const mode = $("kgPosSettleMode");
    if (mode) mode.value = "cash";
    // Hide payment UI for aggregator
    ["kgPosSettleMode", "kgPosSettleCashBox", "kgPosSettleSplit"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const box = id === "kgPosSettleMode" ? el.closest("label") || el : el;
      box.style.display = isAgg ? "none" : "";
    });
    const conf = $("kgPosSettleConfirm");
    if (conf) conf.textContent = isAgg ? "Send to kitchen (₹0)" : "Settle → Kitchen";
    // WhatsApp share option for takeaway when mobile is filled
    const waRow = $("kgPosWaShareRow");
    const waChk = $("kgPosWaShare");
    const phoneOk = !!root.KG.whatsappBill?.normalizePhone?.(st.customerPhone);
    const wantWa = st.settings.whatsappShareDefault !== false;
    if (waRow) waRow.style.display = !isAgg && phoneOk ? "" : "none";
    if (waChk) waChk.checked = !isAgg && phoneOk && wantWa;
    applySettleMode();
  }

  function shareBillOnWhatsApp(bill, opts) {
    const wa = root.KG.whatsappBill;
    if (!wa) {
      toast("WhatsApp helper missing — hard-refresh POS", "error");
      return false;
    }
    const st = root.KG.posState.getState();
    const payload = bill || st.lastBillPayload;
    if (!payload) {
      toast("No bill to share yet — settle first", "error");
      return false;
    }
    const phone = opts?.phone || payload.customerPhone || st.customerPhone || $("kgPosCustomerPhone")?.value;
    const result = wa.shareBill(
      { ...payload, customerPhone: phone || payload.customerPhone },
      { phone, settings: st.settings }
    );
    if (!result.ok) {
      toast(result.error || "Cannot open WhatsApp", "error");
      return false;
    }
    if (result.blocked) toast("Allow pop-ups, then try WhatsApp bill again", "info");
    else toast("WhatsApp opened — tap Send", "success");
    return true;
  }

  function applySettleMode() {
    const mode = $("kgPosSettleMode")?.value || "cash";
    const totals = root.KG.posState.computeTotals();
    const split = $("kgPosSettleSplit");
    const cashBox = $("kgPosSettleCashBox");
    const laterHint = $("kgPosPayLaterHint");
    const conf = $("kgPosSettleConfirm");
    if (split) split.style.display = mode === "split" ? "grid" : "none";
    if (cashBox) cashBox.style.display = mode === "cash" ? "block" : "none";
    if (laterHint) laterHint.style.display = mode === "paylater" ? "" : "none";
    const waRow = $("kgPosWaShareRow");
    if (waRow && mode === "paylater") waRow.style.display = "none";
    if (conf && mode === "paylater") conf.textContent = "Send to kitchen · Pay later";
    else if (conf) {
      const st = root.KG.posState.getState();
      const isAgg = st.orderType === "swiggy" || st.orderType === "zomato";
      conf.textContent = isAgg ? "Send to kitchen (₹0)" : "Settle → Kitchen";
    }
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
    if (mode === "paylater") return { cash: 0, online: 0, swiggy: 0, zomato: 0, payLater: true };
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

  function setBusy(on, label) {
    let el = $("kgPosBusy");
    if (!el) {
      el = document.createElement("div");
      el.id = "kgPosBusy";
      el.className = "kg-pos-busy";
      el.innerHTML = `<div class="kg-pos-busy-card"><div class="kg-pos-busy-spin"></div><div class="kg-pos-busy-txt" id="kgPosBusyTxt">Working…</div></div>`;
      document.body.appendChild(el);
    }
    const txt = $("kgPosBusyTxt");
    if (txt) txt.textContent = label || "Working…";
    el.style.display = on ? "flex" : "none";
    el.setAttribute("aria-hidden", on ? "false" : "true");
  }

  async function doSettle(wantPrint) {
    syncCustomerFromInputs();
    const payment = paymentFromModal();
    const isPayLater = !!payment.payLater;
    const wantWa =
      !isPayLater &&
      !!$("kgPosWaShare")?.checked &&
      $("kgPosWaShareRow")?.style.display !== "none";
    const ov = $("kgPosSettleOverlay");
    if (ov) ov.style.display = "none";
    const canPrint = !!root.KG.print?.hasHardwarePrinter?.();
    const doPrint = !!wantPrint && canPrint && !isPayLater;
    setBusy(true, isPayLater ? "Pay later…" : "Sending to kitchen…");
    let bill = null;
    try {
      bill = await root.KG.posCheckout.settle(payment, {
        printBill: doPrint,
        printKOT: doPrint
      });
    } finally {
      setBusy(false);
    }
    renderCart();
    renderHeld();
    renderCategories();
    if (["__favs", "__hot"].includes(root.KG.posState.getState().activeCategory)) renderMenu();
    syncIndicator();
    if (bill && wantWa) {
      setTimeout(() => shareBillOnWhatsApp(bill), 250);
    }
  }

  async function handleAction(a) {
    const st = root.KG.posState.getState();
    if (a === "hold") {
      syncCustomerFromInputs();
      if (!st.cart.length) return toast("Cart empty", "error");
      root.KG.posState.holdCurrent();
      renderCart();
      renderHeld();
      toast("Held", "success");
    }
    if (a === "kot" || a === "kotprint") {
      if (!st.cart.length) return toast("Cart empty", "error");
      if (!root.KG.print?.hasHardwarePrinter?.()) {
        return toast("Printer not connected — order will go to kitchen on Settle", "info");
      }
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
    if (a === "settle" || a === "settleprint") openSettleModal();
    if (a === "reprint" || a === "reprint-bill") {
      root.KG.print.reprintLastBill();
      return;
    }
    if (a === "discount") {
      const mny = money();
      const current =
        st.discountPercent > 0
          ? String(st.discountPercent) + "%"
          : st.discountPaise > 0
            ? String(mny.fromPaise(st.discountPaise))
            : "";
      const raw = await openInputModal({
        title: "Discount",
        hint: "₹ amount (e.g. 50) or percent (e.g. 10%)",
        value: current,
        type: "text"
      });
      if (raw == null) return;
      const s = String(raw).trim().replace(/,/g, "");
      if (!s || s === "0") {
        st.discountPercent = 0;
        st.discountPaise = 0;
      } else if (/%\s*$/.test(s)) {
        const pct = Math.max(0, Math.min(100, Number(s.replace(/%/g, "").trim()) || 0));
        st.discountPercent = pct;
        st.discountPaise = 0;
      } else {
        const amt = Math.max(0, Number(s.replace(/[₹Rs.\s]/gi, "")) || 0);
        st.discountPercent = 0;
        st.discountPaise = mny.toPaise(amt);
      }
      renderCart();
    }
    if (a === "charges") {
      /* charges UI removed — keep handler for any leftover refs */
      return;
    }
    if (a === "custom") {
      openCustomItemModal();
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
      if ($("kgPosShopName")) $("kgPosShopName").value = s.shopName || "The Kilogram";
      if ($("kgPosAddress")) $("kgPosAddress").value = s.address || "";
      if ($("kgPosGstin")) $("kgPosGstin").value = s.gstin || "";
      if ($("kgPosPhone")) $("kgPosPhone").value = s.phone || "";
      if ($("kgPosUpi")) $("kgPosUpi").value = s.upiId || "";
      if ($("kgPosRatingsUrl")) $("kgPosRatingsUrl").value = s.ratingsUrl || "";
      if ($("kgPosWaDefault")) $("kgPosWaDefault").checked = s.whatsappShareDefault !== false;
      $("kgPosSettingsOverlay").style.display = "flex";
    }
    if (a === "whatsapp") {
      syncCustomerFromInputs();
      const last = st.lastBillPayload;
      if (!last) return toast("Settle a bill first, then share on WhatsApp", "info");
      // Allow updating phone after settle from the header field
      const phoneNow = $("kgPosCustomerPhone")?.value || last.customerPhone;
      if (!root.KG.whatsappBill?.normalizePhone?.(phoneNow)) {
        return toast("Enter customer WhatsApp number in Phone field", "error");
      }
      shareBillOnWhatsApp({ ...last, customerPhone: phoneNow, customerName: st.customerName || last.customerName });
    }
    if (a === "clear") {
      root.KG.posState.clearCart();
      renderCart();
    }
    if (a === "reprint-kot") root.KG.print.reprintLastKOT();
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
      const ch = e.target.closest("[data-channel]");
      if (ch) {
        root.KG.posState.setOrderType(ch.getAttribute("data-channel"));
        setOrderTypeUi();
        return;
      }
      const unfav = e.target.closest("[data-unfav]");
      if (unfav) {
        e.preventDefault();
        e.stopPropagation();
        const key = unfav.getAttribute("data-unfav");
        root.KG.posFavourites?.removeFavourite?.(key);
        renderCategories();
        renderMenu();
        toast("Removed from favourites", "success");
        return;
      }

      const t = e.target.closest(
        "[data-size-id],[data-menu-id],[data-group-key],[data-cat],[data-order-type],[data-act],[data-hold],[data-table],[data-pos-action]"
      );
      if (!t) return;

      // Size chip inside card → add that variant immediately
      if (t.hasAttribute("data-size-id")) {
        e.stopPropagation();
        const item = root.KG.posMenu.getById(t.getAttribute("data-size-id"));
        if (item) {
          root.KG.posState.addLine(lineFromItem(item));
          renderCart();
          const sz = cleanVar(item.__variantLabel);
          /* quiet — no toast on every tap */
        }
        return;
      }

      if (t.hasAttribute("data-group-key")) {
        const g = root.KG.posMenu.getGroup(t.getAttribute("data-group-key"));
        if (!g) return;
        // Never open butter/cheese/addon popup — add directly (or ask to tap a size)
        if (g.hasVariants && g.variants.length >= 2) {
          toast("Tap a size on the card (500 ग्राम / 1 किलो…)", "info");
          return;
        }
        const item = g.variants[0];
        if (item) {
          root.KG.posState.addLine(lineFromItem(item));
          renderCart();
          /* quiet */
        }
        return;
      }
      if (t.hasAttribute("data-menu-id")) {
        const item = root.KG.posMenu.getById(t.getAttribute("data-menu-id"));
        if (item) {
          root.KG.posState.addLine(lineFromItem(item));
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
        setOrderTypeUi();
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
        setOrderTypeUi();
        return;
      }
      if (t.hasAttribute("data-act")) {
        const line = t.closest("[data-line]");
        const lineId = line?.getAttribute("data-line");
        const act = t.getAttribute("data-act");
        const st = root.KG.posState.getState();
        const row = st.cart.find((l) => l.lineId === lineId);
        if (!row) return;
        if (act === "inc") {
          if (row.isWeightMerge) root.KG.posState.adjustWeightGrams(lineId, 500);
          else root.KG.posState.updateQty(lineId, row.qty + 1);
        }
        if (act === "dec") {
          if (row.isWeightMerge) root.KG.posState.adjustWeightGrams(lineId, -500);
          else root.KG.posState.updateQty(lineId, row.qty - 1);
        }
        if (act === "rm") root.KG.posState.removeLine(lineId);
        if (act === "note") {
          const note = await openInputModal({
            title: "Kitchen note",
            hint: "Hinglish OK — e.g. bilkul hi light bhaji (goes in Hindi)",
            value: row.note || ""
          });
          if (note != null) {
            const hi = await toKitchenNoteHi(note);
            root.KG.posState.setLineNote(lineId, hi || note);
          }
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
      handleAction("settle");
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
        const item = menuListCache[0].variants[0];
        root.KG.posState.addLine(lineFromItem(item));
        renderCart();
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
    const seed = root.KILOGRAM_MENU_SEED || [];
    if (!list.length && seed.length) {
      list = seed.map((m, i) => Object.assign({ id: m.id || `seed_${i}`, available: true }, m));
    } else if (list.length && seed.length) {
      // Attach HD dish photos from seed when live menu has no imageUrl
      const byName = new Map();
      seed.forEach((m) => {
        const k = String(m.name || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        if (k && m.imageUrl) byName.set(k, m.imageUrl);
      });
      list = list.map((m) => {
        if (m.imageUrl || m.image) return m;
        const k = String(m.name || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        const img = byName.get(k);
        return img ? Object.assign({}, m, { imageUrl: img }) : m;
      });
    }
    root.KG.posMenu.loadFromArray(list);
    const st = root.KG.posState.getState();
    if (!st.activeCategory || st.activeCategory === "Snacks") st.activeCategory = "__favs";
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
    try {
      await root.KG.posFavourites?.refreshFromFirestore?.();
      renderCategories();
      // Only refresh fav/hot views — avoid full menu blink on other tabs
      const cat = root.KG.posState.getState().activeCategory;
      if (cat === "__favs" || cat === "__hot") renderMenu(true);
    } catch (_) {}
    renderCart();
    renderHeld();
    setOrderTypeUi();
    document.getElementById("kgPosKdsInsight")?.remove();
    syncIndicator();
    try {
      await root.KG.print.autoReconnect();
    } catch (_) {}
    root.KG.posCheckout.syncQueue().catch(() => {});
    try {
      root.KG.posCheckout.startBackgroundSync?.();
    } catch (_) {}
    try {
      root.KG.posKdsLive?.start?.();
    } catch (_) {}
    window.addEventListener("online", () => syncIndicator());
    window.addEventListener("offline", () => syncIndicator());
    setInterval(syncIndicator, 12000);
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
    $("kgPosPlatformNo")?.addEventListener("input", (e) => {
      root.KG.posState.setPlatformOrderNo(e.target.value);
    });
    unsub = root.KG.posState.subscribe((evt) => {
      if (evt === "sync") syncIndicator();
      if (evt === "hold" || evt === "reopen") {
        renderHeld();
        renderCart();
        setOrderTypeUi();
      }
      if (evt === "orderType") setOrderTypeUi();
    });

    $("kgPosInputOk")?.addEventListener("click", () => closeInputModal($("kgPosInputValue")?.value));
    $("kgPosInputCancel")?.addEventListener("click", () => closeInputModal(null));
    $("kgPosCustomAdd")?.addEventListener("click", () => addCustomItemFromModal());
    $("kgPosCustomCancel")?.addEventListener("click", () => {
      const ov = $("kgPosCustomOverlay");
      if (ov) ov.style.display = "none";
    });
    $("kgPosCustomPrice")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addCustomItemFromModal();
    });
    $("kgPosCustomName")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("kgPosCustomPrice")?.focus();
    });

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
        gstPercent: 0,
        gstEnabled: false,
        shopName: $("kgPosShopName")?.value || "The Kilogram",
        address: $("kgPosAddress")?.value || "",
        gstin: $("kgPosGstin")?.value || "",
        phone: $("kgPosPhone")?.value || "",
        upiId: $("kgPosUpi")?.value || "",
        ratingsUrl: $("kgPosRatingsUrl")?.value || "",
        whatsappShareDefault: !!$("kgPosWaDefault")?.checked
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
    openInputModal,
    syncIndicator
  };

  root.KG = root.KG || {};
  root.KG.posUI = api;
  root.KG.pos = root.KG.pos || {};
  root.KG.pos.devPerf = true;
  root.KG.pos.mount = mount;
  root.KG.pos.onEnter = onEnter;

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
