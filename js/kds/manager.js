/**
 * Manager / remote KDS view inside the main SPA.
 */
(function (root) {
  "use strict";

  let unsub = null;
  let orders = [];
  let bound = false;
  let lang = root.localStorage?.getItem("kg_kds_mgr_lang") || "hi";

  function $(id) {
    return document.getElementById(id);
  }

  function toast(msg, type) {
    if (typeof root.toast === "function") return root.toast(msg, type);
    console.log(msg);
  }

  function role() {
    try {
      return String(root.KgAuth?.getProfile?.()?.role || "employee").toLowerCase();
    } catch (_) {
      return "employee";
    }
  }

  function canManage() {
    const r = role();
    return r === "owner" || r === "admin" || r === "manager";
  }

  function canStatus() {
    const r = role();
    return canManage() || r === "kitchen";
  }

  function who() {
    try {
      return root.KgAuth?.getProfile?.()?.name || root.KgAuth?.currentUser?.email || "manager";
    } catch (_) {
      return "manager";
    }
  }

  function itemLabel(it) {
    if (lang === "hi") return it.nameHi || it.nameEn || "—";
    return it.nameEn || it.nameHi || "—";
  }

  function statusLabel(s) {
    const map = {
      hi: {
        waiting: "नया / इंतज़ार",
        preparing: "बन रहा है",
        ready: "तैयार",
        served: "परोसा गया",
        cancelled: "रद्द"
      },
      en: {
        waiting: "Waiting",
        preparing: "Preparing",
        ready: "Ready",
        served: "Served",
        cancelled: "Cancelled"
      }
    };
    return (map[lang] || map.en)[s] || s;
  }

  function statusColor(s) {
    if (s === "waiting") return "#e6b800";
    if (s === "preparing") return "#2f7fff";
    if (s === "ready") return "#22a65a";
    if (s === "cancelled") return "#8b4550";
    return "#888";
  }

  function elapsed(createdAt) {
    const ms = Date.now() - new Date(createdAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "0m";
    return Math.floor(ms / 60000) + "m";
  }

  function renderBoard() {
    const el = $("kdsMgrBoard");
    if (!el) return;
    const active = orders.filter((o) => ["waiting", "preparing", "ready"].includes(o.status));
    if (!active.length) {
      el.innerHTML = `<p class="muted">${lang === "hi" ? "कोई लाइव ऑर्डर नहीं" : "No live orders"}</p>`;
      return;
    }
    el.innerHTML = active
      .map((o) => {
        const items = (o.items || [])
          .map((it) => `${it.qty}× ${itemLabel(it)}${it.variant ? " (" + it.variant + ")" : ""}`)
          .join(", ");
        const notes = (o.liveNotes || [])
          .slice(-2)
          .map((n) => n.text)
          .join(" · ");
        const manageBtns = canManage()
          ? `<button type="button" class="secondary" data-kds-note="${o.id}">Note</button>
             <button type="button" class="secondary" data-kds-add="${o.id}">+ Items</button>
             ${
               o.status === "waiting"
                 ? `<button type="button" class="secondary" data-kds-cancel="${o.id}">Cancel</button>`
                 : ""
             }`
          : "";
        const statusBtn = canStatus()
          ? `<button type="button" data-kds-adv="${o.id}">${lang === "hi" ? "अगला" : "Next"}</button>
             <button type="button" class="secondary" data-kds-undo="${o.id}">Undo</button>`
          : "";
        return `<div class="card" style="margin-bottom:10px;border-left:4px solid ${statusColor(o.status)};padding:12px;">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <strong style="font-size:18px;">#${o.orderId || o.id}</strong>
            <span style="color:${statusColor(o.status)};font-weight:800;">${statusLabel(o.status)}</span>
            <span class="muted">${elapsed(o.createdAt)}</span>
          </div>
          <div class="muted" style="margin:4px 0;">${o.orderType || ""} ${o.tableNo ? "· Table " + o.tableNo : ""}</div>
          <div>${items}</div>
          ${o.orderNote ? `<div style="color:#c47a00;margin-top:4px;">${o.orderNote}</div>` : ""}
          ${notes ? `<div style="color:#c47a00;margin-top:4px;">${notes}</div>` : ""}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">${statusBtn}${manageBtns}</div>
        </div>`;
      })
      .join("");
  }

  function renderReports() {
    const el = $("kdsMgrReports");
    if (!el) return;
    const r = root.KG.kdsStore.computeReports(orders);
    const hours = Object.keys(r.ordersPerHour)
      .sort((a, b) => Number(a) - Number(b))
      .map((h) => `${h}:00 → ${r.ordersPerHour[h]}`)
      .join("<br/>") || "—";
    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:10px;">
        <div class="kpi-card span-12" style="margin:0;"><div class="kpi-meta"><div class="kpi-label">Avg prep (min)</div><div class="kpi-value">${r.avgPrepMin}</div></div></div>
        <div class="kpi-card span-12" style="margin:0;"><div class="kpi-meta"><div class="kpi-label">Delayed (&gt;20m)</div><div class="kpi-value">${r.delayedCount}</div></div></div>
        <div class="kpi-card span-12" style="margin:0;"><div class="kpi-meta"><div class="kpi-label">In window</div><div class="kpi-value">${r.total}</div></div></div>
      </div>
      <div class="muted" style="margin-bottom:6px;">Orders per hour</div>
      <div>${hours}</div>
      <div class="muted" style="margin:12px 0 6px;">History (served / cancelled)</div>
      <div id="kdsHistoryList"></div>`;
    const hist = $("kdsHistoryList");
    const closed = orders
      .filter((o) => o.status === "served" || o.status === "cancelled")
      .slice(0, 40);
    if (hist) {
      hist.innerHTML = closed.length
        ? closed
            .map(
              (o) =>
                `<div class="table-row"><div>#${o.orderId || o.id}</div><div>${statusLabel(o.status)}</div><div>${(o.createdAt || "").slice(0, 16)}</div></div>`
            )
            .join("")
        : "<p class='muted'>—</p>";
    }
  }

  async function loadMenuSelect() {
    const sel = $("kdsNewItemPick");
    if (!sel) return;
    let menu = [];
    try {
      menu = await root.KG.kdsStore.listMenu();
    } catch (_) {}
    if (!menu.length) {
      // Seed from POS menuItems if available
      try {
        const snap = await firebase.firestore().collection("menuItems").limit(200).get();
        menu = snap.docs.map((d) => {
          const x = d.data();
          return { id: d.id, nameEn: x.name || x.nameEn || "", nameHi: x.nameHi || "" };
        });
      } catch (_) {}
    }
    sel.innerHTML =
      `<option value="">${lang === "hi" ? "आइटम चुनें" : "Pick item"}</option>` +
      menu
        .map(
          (m) =>
            `<option value="${m.id}" data-en="${escapeAttr(m.nameEn)}" data-hi="${escapeAttr(m.nameHi)}">${escapeAttr(m.nameEn)}${m.nameHi ? " / " + escapeAttr(m.nameHi) : ""}</option>`
        )
        .join("");
  }

  function escapeAttr(s) {
    return String(s || "").replace(/"/g, "&quot;");
  }

  async function submitNewOrder() {
    if (!canManage()) return toast("Managers only", "error");
    const orderId = ($("kdsNewOrderId").value || "").trim() || `M-${Date.now().toString().slice(-6)}`;
    const tableNo = ($("kdsNewTable").value || "").trim();
    const orderType = $("kdsNewType").value || "Takeaway";
    const orderNote = ($("kdsNewNote").value || "").trim();
    const waiterName = ($("kdsNewWaiter").value || "").trim() || who();
    const pick = $("kdsNewItemPick");
    const opt = pick?.selectedOptions?.[0];
    const qty = Math.max(1, Number($("kdsNewQty").value) || 1);
    const variant = ($("kdsNewVariant").value || "").trim();
    const itemNote = ($("kdsNewItemNote").value || "").trim();
    if (!opt || !opt.value) return toast("Pick an item", "error");
    try {
      await root.KG.kdsStore.createOrder({
        orderId,
        tableNo,
        orderType,
        orderNote,
        waiterName,
        by: who(),
        items: [
          {
            nameEn: opt.getAttribute("data-en") || opt.textContent,
            nameHi: opt.getAttribute("data-hi") || "",
            qty,
            variant,
            itemNote
          }
        ]
      });
      toast(lang === "hi" ? "ऑर्डर भेजा" : "Order sent", "success");
      $("kdsNewOrderId").value = "";
      $("kdsNewNote").value = "";
    } catch (e) {
      toast(e.message || "Failed", "error");
    }
  }

  async function saveMenuItem() {
    if (!canManage()) return toast("Managers only", "error");
    const nameEn = ($("kdsMenuEn").value || "").trim();
    const nameHi = ($("kdsMenuHi").value || "").trim();
    if (!nameEn && !nameHi) return toast("Name required", "error");
    try {
      await root.KG.kdsStore.upsertMenuItem({ nameEn, nameHi, category: $("kdsMenuCat").value || "" });
      toast("Saved", "success");
      $("kdsMenuEn").value = "";
      $("kdsMenuHi").value = "";
      loadMenuSelect();
      renderMenuList();
    } catch (e) {
      toast(e.message || "Failed", "error");
    }
  }

  async function renderMenuList() {
    const el = $("kdsMenuList");
    if (!el) return;
    try {
      const menu = await root.KG.kdsStore.listMenu();
      el.innerHTML = menu.length
        ? menu
            .map((m) => `<div class="table-row"><div>${m.nameEn || ""}</div><div>${m.nameHi || ""}</div><div>${m.category || ""}</div></div>`)
            .join("")
        : "<p class='muted'>No KDS menu items yet</p>";
    } catch (e) {
      el.innerHTML = `<p class="muted">${e.message}</p>`;
    }
  }

  function saveApiSettings() {
    if (!canManage()) return toast("Managers only", "error");
    root.KG.kdsClient.saveConfig({
      apiUrl: ($("kdsApiUrl").value || "").trim(),
      apiKey: ($("kdsApiKey").value || "").trim()
    });
    toast("KDS API settings saved", "success");
  }

  function bindBoardClicks() {
    $("kdsMgrBoard")?.addEventListener("click", async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      const adv = t.getAttribute("data-kds-adv");
      const undo = t.getAttribute("data-kds-undo");
      const note = t.getAttribute("data-kds-note");
      const add = t.getAttribute("data-kds-add");
      const cancel = t.getAttribute("data-kds-cancel");
      try {
        if (adv && canStatus()) {
          await root.KG.kdsStore.advanceStatus(adv, who());
        } else if (undo && canStatus()) {
          await root.KG.kdsStore.undoStatus(undo, who());
        } else if (note && canManage()) {
          const text = prompt(lang === "hi" ? "नोट (जैसे कम तीखा)" : "Note");
          if (text) await root.KG.kdsStore.addNote(note, text, who());
        } else if (add && canManage()) {
          const name = prompt("Item name (EN)");
          const nameHi = prompt("Item name (HI)") || "";
          const qty = Number(prompt("Qty", "1")) || 1;
          if (name) {
            await root.KG.kdsStore.addItems(add, [{ nameEn: name, nameHi, qty }], who());
          }
        } else if (cancel && canManage()) {
          const ord = orders.find((o) => String(o.id || o.orderId) === String(cancel));
          if (ord && ord.status !== "waiting") {
            toast("Only waiting orders can be cancelled", "error");
            return;
          }
          if (confirm("Cancel this order?")) await root.KG.kdsStore.cancelOrder(cancel, "manager", who());
        }
      } catch (e) {
        toast(e.message || "Error", "error");
      }
    });
  }

  function bind() {
    if (bound) return;
    bound = true;
    $("kdsNewOrderBtn")?.addEventListener("click", submitNewOrder);
    $("kdsMenuSaveBtn")?.addEventListener("click", saveMenuItem);
    $("kdsApiSaveBtn")?.addEventListener("click", saveApiSettings);
    $("kdsMgrLangBtn")?.addEventListener("click", () => {
      lang = lang === "hi" ? "en" : "hi";
      root.localStorage?.setItem("kg_kds_mgr_lang", lang);
      $("kdsMgrLangBtn").textContent = lang === "hi" ? "English" : "हिंदी";
      renderBoard();
      renderReports();
    });
    $("kdsOpenTablet")?.addEventListener("click", () => {
      root.open("kds.html", "_blank");
    });
    bindBoardClicks();
  }

  function onEnter() {
    bind();
    const cfg = root.KG.kdsClient?.getConfig?.() || {};
    if ($("kdsApiUrl")) $("kdsApiUrl").value = cfg.apiUrl || "";
    if ($("kdsApiKey")) $("kdsApiKey").value = cfg.apiKey || "";
    $("kdsMgrLangBtn") && ($("kdsMgrLangBtn").textContent = lang === "hi" ? "English" : "हिंदी");

    // Gate manage panels
    const manageOnly = document.querySelectorAll("[data-kds-manage]");
    manageOnly.forEach((el) => {
      el.style.display = canManage() ? "" : "none";
    });

    loadMenuSelect();
    renderMenuList();

    if (unsub) unsub();
    unsub = root.KG.kdsStore.subscribeActive(
      (list) => {
        orders = list;
        renderBoard();
        renderReports();
      },
      (err) => toast(err.message || "KDS sync error", "error")
    );
    root.KG.kdsStore.pruneOlderThan(90).catch(() => {});
  }

  function onLeave() {
    if (unsub) {
      unsub();
      unsub = null;
    }
  }

  root.KG = root.KG || {};
  root.KG.kdsManager = { bind, onEnter, onLeave, renderBoard, canManage, canStatus };
})(typeof window !== "undefined" ? window : globalThis);
