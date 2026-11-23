/**
 * Scheduled / bulk order UI — dashboard, booking wizard (from POS), detail, calendar.
 */
(function (root) {
  "use strict";

  let ordersCache = [];
  let filter = {
    range: "upcoming7",
    fulfillment: "all",
    payment: "all",
    status: "all",
    q: "",
    from: "",
    to: ""
  };
  let selectedId = null;
  let wizardStep = 1;
  let wizard = null;
  let calendarMonth = null;
  let menuCache = [];

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
  }

  function inr(n) {
    return root.KG?.money?.formatINR?.(n) || `₹${Math.round(Number(n) || 0)}`;
  }

  function store() {
    return root.KG.scheduledStore;
  }

  function emptyWizard() {
    const cart = root.KG?.posState?.getState?.()?.cart || [];
    const st = root.KG?.posState?.getState?.() || {};
    return {
      customerName: st.customerName || "",
      customerPhone: st.customerPhone || "",
      companyName: "",
      orderCategory: "scheduled",
      items: cart.map((l) => ({
        menuItemId: l.menuItemId,
        name: l.name,
        nameHi: l.nameHi,
        variantLabel: l.variantLabel || "",
        price: l.price,
        qty: l.qty,
        note: l.note || ""
      })),
      discount: 0,
      deliveryCharge: 0,
      fulfillmentType: "pickup",
      delivery: { address: "", area: "", landmark: "", contact: "", instructions: "" },
      pickupNotes: "",
      prepNotes: "",
      customerNotes: "",
      scheduledAt: "",
      advanceCash: 0,
      advanceOnline: 0,
      paymentReference: ""
    };
  }

  function statusLabel(s) {
    const map = {
      confirmed: "Confirmed",
      prep_pending: "Prep pending",
      preparing: "Preparing",
      ready: "Ready",
      out_for_delivery: "Out for delivery",
      completed: "Completed",
      cancelled: "Cancelled"
    };
    return map[s] || s;
  }

  function payLabel(s) {
    const map = {
      unpaid: "Unpaid",
      partial: "Partially paid",
      paid: "Fully paid",
      refund_pending: "Refund pending"
    };
    return map[s] || s;
  }

  function dayStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function matchesFilter(o) {
    const q = String(filter.q || "")
      .trim()
      .toLowerCase();
    if (q) {
      const hay = `${o.orderNo} ${o.customerName} ${o.customerPhone} ${o.companyName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter.fulfillment !== "all" && (o.fulfillmentType || "pickup") !== filter.fulfillment) return false;
    if (filter.payment !== "all" && (o.paymentStatus || "") !== filter.payment) return false;
    if (filter.status !== "all" && (o.status || "") !== filter.status) return false;

    const t = new Date(o.scheduledAt).getTime();
    if (Number.isNaN(t)) return false;
    const now = new Date();
    const today0 = dayStart(now);
    const tomorrow0 = today0 + 86400000;
    const day8 = today0 + 8 * 86400000;

    if (filter.range === "today") return t >= today0 && t < tomorrow0;
    if (filter.range === "tomorrow") return t >= tomorrow0 && t < tomorrow0 + 86400000;
    if (filter.range === "upcoming7") return t >= today0 && t < day8 && o.status !== "cancelled";
    if (filter.range === "all") return true;
    if (filter.range === "custom") {
      if (filter.from) {
        const f = new Date(filter.from + "T00:00:00").getTime();
        if (t < f) return false;
      }
      if (filter.to) {
        const to = new Date(filter.to + "T23:59:59").getTime();
        if (t > to) return false;
      }
    }
    return true;
  }

  async function refresh() {
    try {
      ordersCache = await store().listOrders({ limit: 300 });
    } catch (e) {
      console.warn(e);
      toast(e.message || "Could not load scheduled orders", "error");
      ordersCache = [];
    }
    renderAll();
  }

  function renderAll() {
    renderSummary();
    renderList();
    renderCalendar();
    if (selectedId) renderDetail(selectedId);
  }

  function renderSummary() {
    const el = $("soSummary");
    if (!el) return;
    const s = store().summarize(ordersCache);
    el.innerHTML = [
      ["Upcoming", s.upcomingCount],
      ["Today", s.todayCount],
      ["Tomorrow", s.tomorrowCount],
      ["Booked value", inr(s.totalValue)],
      ["Advances in", inr(s.advancesCollected)],
      ["Outstanding", inr(s.outstanding)],
      ["Prep pending", s.prepPending],
      ["Pickup", s.pickupCount],
      ["Delivery", s.deliveryCount]
    ]
      .map(
        ([k, v]) =>
          `<div class="so-kpi"><div class="so-kpi-v">${esc(String(v))}</div><div class="so-kpi-l">${esc(k)}</div></div>`
      )
      .join("");
  }

  function renderList() {
    const el = $("soList");
    if (!el) return;
    const rows = ordersCache.filter(matchesFilter);
    if (!rows.length) {
      el.innerHTML = `<div class="muted so-empty">No scheduled orders for this filter.</div>`;
      return;
    }
    el.innerHTML = rows
      .map((o) => {
        const dueSoon =
          o.status !== "completed" &&
          o.status !== "cancelled" &&
          new Date(o.scheduledAt).getTime() - Date.now() < 3 * 3600000 &&
          new Date(o.scheduledAt).getTime() >= Date.now() - 3600000;
        const overdue =
          o.status !== "completed" &&
          o.status !== "cancelled" &&
          new Date(o.scheduledAt).getTime() < Date.now();
        return `<button type="button" class="so-card${selectedId === o.id ? " active" : ""}${
          overdue ? " overdue" : dueSoon ? " due-soon" : ""
        }" data-so-id="${esc(o.id)}">
          <div class="so-card-top">
            <b>${esc(o.orderNo || o.id)}</b>
            <span class="so-badge so-status-${esc(o.status)}">${esc(statusLabel(o.status))}</span>
          </div>
          <div class="so-card-name">${esc(o.customerName)} · ${esc(o.customerPhone || "—")}</div>
          <div class="so-card-when">${esc(store().formatWhen(o.scheduledAt))}</div>
          <div class="so-card-meta">
            <span class="so-badge so-ful-${esc(o.fulfillmentType || "pickup")}">${esc(
              o.fulfillmentType === "delivery" ? "Delivery" : "Pickup"
            )}</span>
            <span class="so-badge so-pay-${esc(o.paymentStatus || "unpaid")}">${esc(
              payLabel(o.paymentStatus)
            )}</span>
            <span>${inr(o.grandTotal)}</span>
            <span class="muted">due ${inr(o.remainingBalance)}</span>
          </div>
        </button>`;
      })
      .join("");
  }

  function renderCalendar() {
    const el = $("soCalendar");
    if (!el) return;
    if (!calendarMonth) calendarMonth = new Date();
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const title = calendarMonth.toLocaleString(undefined, { month: "long", year: "numeric" });
    const byDay = {};
    ordersCache.forEach((o) => {
      if (o.status === "cancelled") return;
      const d = new Date(o.scheduledAt);
      if (d.getFullYear() !== y || d.getMonth() !== m) return;
      const key = d.getDate();
      (byDay[key] = byDay[key] || []).push(o);
    });
    let cells = "";
    for (let i = 0; i < startPad; i++) cells += `<div class="so-cal-cell empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const list = byDay[day] || [];
      cells += `<div class="so-cal-cell${list.length ? " has" : ""}">
        <div class="so-cal-day">${day}</div>
        ${list
          .slice(0, 3)
          .map(
            (o) =>
              `<button type="button" class="so-cal-chip" data-so-id="${esc(o.id)}">${esc(
                (o.customerName || o.orderNo || "").slice(0, 12)
              )}</button>`
          )
          .join("")}
        ${list.length > 3 ? `<div class="muted">+${list.length - 3}</div>` : ""}
      </div>`;
    }
    el.innerHTML = `<div class="so-cal-head">
      <button type="button" class="btn-ghost" id="soCalPrev">‹</button>
      <b>${esc(title)}</b>
      <button type="button" class="btn-ghost" id="soCalNext">›</button>
    </div>
    <div class="so-cal-dow">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      .map((d) => `<div>${d}</div>`)
      .join("")}</div>
    <div class="so-cal-grid">${cells}</div>`;
    $("soCalPrev")?.addEventListener("click", () => {
      calendarMonth = new Date(y, m - 1, 1);
      renderCalendar();
    });
    $("soCalNext")?.addEventListener("click", () => {
      calendarMonth = new Date(y, m + 1, 1);
      renderCalendar();
    });
  }

  function renderDetail(id) {
    const panel = $("soDetail");
    if (!panel) return;
    const o = ordersCache.find((x) => x.id === id) || null;
    selectedId = id;
    if (!o) {
      panel.innerHTML = `<div class="muted">Select an order</div>`;
      return;
    }
    const items = (o.items || [])
      .map(
        (i) =>
          `<tr><td>${esc(i.name)}${i.variantLabel ? ` <span class="muted">(${esc(i.variantLabel)})</span>` : ""}${
            i.note ? `<div class="muted">${esc(i.note)}</div>` : ""
          }</td><td>${esc(i.qty)}</td><td>${inr(i.price)}</td><td>${inr(i.lineTotal || i.price * i.qty)}</td></tr>`
      )
      .join("");
    const pays = (o.payments || [])
      .map(
        (p) =>
          `<tr><td>${esc(new Date(p.at).toLocaleString())}</td><td>${esc(p.kind)}</td><td>${esc(
            p.method
          )}</td><td>${p.kind === "refund" ? "−" : ""}${inr(p.amount)}</td><td>${esc(p.by || "")}</td><td>${esc(
            p.reference || ""
          )}</td></tr>`
      )
      .join("");
    const nextStatuses = store().allowedNextStatuses(o);
    panel.innerHTML = `
      <div class="so-detail-head">
        <div>
          <h3>${esc(o.orderNo)}</h3>
          <div class="muted">${esc(store().formatWhen(o.scheduledAt))} · ${esc(o.orderCategory || "scheduled")}</div>
        </div>
        <div class="so-detail-badges">
          <span class="so-badge so-status-${esc(o.status)}">${esc(statusLabel(o.status))}</span>
          <span class="so-badge so-pay-${esc(o.paymentStatus)}">${esc(payLabel(o.paymentStatus))}</span>
        </div>
      </div>
      <div class="so-detail-grid">
        <div>
          <h4>Customer</h4>
          <div><b>${esc(o.customerName)}</b></div>
          <div>${esc(o.customerPhone || "—")}</div>
          ${o.companyName ? `<div class="muted">${esc(o.companyName)}</div>` : ""}
        </div>
        <div>
          <h4>Fulfillment</h4>
          <div>${o.fulfillmentType === "delivery" ? "Delivery" : "Pickup"}</div>
          ${
            o.fulfillmentType === "delivery" && o.delivery
              ? `<div>${esc(o.delivery.address)}</div>
                 <div class="muted">${esc([o.delivery.area, o.delivery.landmark].filter(Boolean).join(" · "))}</div>
                 <div class="muted">${esc(o.delivery.instructions || "")}</div>`
              : `<div class="muted">${esc(o.pickupNotes || "")}</div>`
          }
          ${o.prepNotes ? `<div class="muted">Kitchen: ${esc(o.prepNotes)}</div>` : ""}
        </div>
        <div>
          <h4>Money</h4>
          <div>Total <b>${inr(o.grandTotal)}</b></div>
          <div>Received ${inr(o.amountReceived)}</div>
          <div>Remaining <b>${inr(o.remainingBalance)}</b></div>
        </div>
      </div>
      <h4>Items</h4>
      <table class="so-table"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Line</th></tr></thead><tbody>${items}</tbody></table>
      <div class="muted">Subtotal ${inr(o.subtotal)} · Discount ${inr(o.discount)} · Delivery ${inr(
        o.deliveryCharge
      )}</div>
      <h4>Payment history</h4>
      <table class="so-table"><thead><tr><th>When</th><th>Type</th><th>Method</th><th>Amount</th><th>By</th><th>Ref</th></tr></thead>
      <tbody>${pays || `<tr><td colspan="6" class="muted">No payments yet</td></tr>`}</tbody></table>
      <div class="so-actions">
        ${
          o.status !== "cancelled" && o.status !== "completed"
            ? `
          <button type="button" class="btn" data-so-act="pay">Add payment</button>
          <button type="button" class="btn btn-secondary" data-so-act="reschedule">Reschedule</button>
          <button type="button" class="btn btn-secondary" data-so-act="edit">Edit details</button>
          <button type="button" class="btn btn-secondary" data-so-act="kds">Send to KDS</button>
          <button type="button" class="btn btn-secondary" data-so-act="print">Print booking</button>
          ${nextStatuses
            .filter((s) => s !== "cancelled" && s !== "completed")
            .map(
              (s) =>
                `<button type="button" class="btn btn-secondary" data-so-act="status" data-status="${esc(
                  s
                )}">${esc(statusLabel(s))}</button>`
            )
            .join("")}
          <button type="button" class="btn btn-secondary" data-so-act="complete">Complete &amp; settle</button>
          <button type="button" class="btn danger" data-so-act="cancel">Cancel</button>
        `
            : `<button type="button" class="btn btn-secondary" data-so-act="print">Print booking</button>`
        }
      </div>
    `;
  }

  async function openOrderById(id) {
    selectedId = id;
    if (!ordersCache.find((o) => o.id === id)) await refresh();
    renderList();
    renderDetail(id);
    $("soDetail")?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }

  /* ---------- Wizard ---------- */

  function openWizard(seed) {
    bind(); // must run even when opened from POS (onEnter may never have fired)
    wizard = { ...emptyWizard(), ...(seed || {}) };
    if (!wizard.scheduledAt) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(19, 0, 0, 0);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      wizard.scheduledAt = local.toISOString().slice(0, 16);
    } else if (wizard.scheduledAt.length > 16) {
      const d = new Date(wizard.scheduledAt);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      wizard.scheduledAt = local.toISOString().slice(0, 16);
    }
    wizardStep = 1;
    const ov = $("soWizardOverlay");
    if (ov) {
      ov.hidden = false;
      ov.removeAttribute("hidden");
      ov.classList.add("open");
    }
    renderWizard();
    loadMenuForWizard();
  }

  function closeWizard() {
    const ov = $("soWizardOverlay");
    if (ov) {
      ov.hidden = true;
      ov.setAttribute("hidden", "");
      ov.classList.remove("open");
    }
    wizard = null;
  }

  async function loadMenuForWizard() {
    try {
      if (root.state?.menuItems?.length) menuCache = root.state.menuItems.slice();
      else if (root.KG?.posMenu?.getAll) menuCache = root.KG.posMenu.getAll() || [];
      else if (root.api?.menuItems?.list) menuCache = await root.api.menuItems.list();
      else if (typeof api !== "undefined" && api.menuItems?.list) menuCache = await api.menuItems.list();
      else {
        const snap = await firebase.firestore().collection("menuItems").get();
        menuCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
    } catch (_) {
      menuCache = [];
    }
    if (wizardStep === 2) renderWizard();
  }

  function wizardTotals() {
    return store().calcTotals(wizard.items, wizard.discount, wizard.deliveryCharge);
  }

  function renderWizard() {
    const body = $("soWizardBody");
    const title = $("soWizardTitle");
    if (!body || !wizard) return;
    const steps = ["Customer", "Items", "When & how", "Advance", "Confirm"];
    title.textContent = `Book advance order · Step ${wizardStep}/5 · ${steps[wizardStep - 1]}`;
    const totals = wizardTotals();
    if (wizardStep === 1) {
      body.innerHTML = `
        <label class="label">Customer name</label>
        <input class="input" id="soWName" value="${esc(wizard.customerName)}" placeholder="Optional" />
        <label class="label">Mobile</label>
        <input class="input" id="soWPhone" inputmode="tel" value="${esc(wizard.customerPhone)}" placeholder="Optional" />
        <label class="label">Company / event</label>
        <input class="input" id="soWCompany" value="${esc(wizard.companyName)}" placeholder="Optional" />
        <label class="label">Order type</label>
        <select class="input" id="soWCat">
          ${["scheduled", "bulk", "catering", "party", "corporate"]
            .map(
              (c) =>
                `<option value="${c}"${wizard.orderCategory === c ? " selected" : ""}>${c}</option>`
            )
            .join("")}
        </select>`;
    } else if (wizardStep === 2) {
      const lines = (wizard.items || [])
        .map(
          (it, idx) => `
        <div class="so-w-line" data-idx="${idx}">
          <div><b>${esc(it.name)}</b> ${it.variantLabel ? `<span class="muted">${esc(it.variantLabel)}</span>` : ""}</div>
          <div class="so-w-line-row">
            <input type="number" min="1" step="1" class="input so-w-qty" value="${esc(it.qty)}" style="width:72px" />
            <span>${inr(it.price)}</span>
            <input class="input so-w-note" placeholder="Note" value="${esc(it.note || "")}" />
            <button type="button" class="btn-ghost so-w-rm">✕</button>
          </div>
        </div>`
        )
        .join("");
      body.innerHTML = `
        <input class="input" id="soWMenuSearch" placeholder="Search menu to add…" />
        <div id="soWMenuHits" class="so-w-menu-hits"></div>
        <div class="so-w-lines">${lines || `<div class="muted">No items — search menu above or use current POS cart.</div>`}</div>
        <div class="so-w-tot">Subtotal <b>${inr(totals.subtotal)}</b></div>
        <label class="label">Discount ₹</label>
        <input class="input" id="soWDisc" type="number" min="0" step="1" value="${esc(wizard.discount)}" />`;
    } else if (wizardStep === 3) {
      body.innerHTML = `
        <label class="label">Fulfillment date &amp; time</label>
        <input class="input" id="soWWhen" type="datetime-local" value="${esc(wizard.scheduledAt)}" />
        <label class="label">Pickup or delivery</label>
        <select class="input" id="soWFul">
          <option value="pickup"${wizard.fulfillmentType !== "delivery" ? " selected" : ""}>Pickup</option>
          <option value="delivery"${wizard.fulfillmentType === "delivery" ? " selected" : ""}>Delivery</option>
        </select>
        <div id="soWDelivery" style="${wizard.fulfillmentType === "delivery" ? "" : "display:none"}">
          <label class="label">Address</label>
          <textarea class="input" id="soWAddr" rows="2" placeholder="Optional">${esc(wizard.delivery?.address || "")}</textarea>
          <label class="label">Area / locality</label>
          <input class="input" id="soWArea" value="${esc(wizard.delivery?.area || "")}" />
          <label class="label">Landmark</label>
          <input class="input" id="soWLand" value="${esc(wizard.delivery?.landmark || "")}" />
          <label class="label">Delivery contact</label>
          <input class="input" id="soWDcontact" value="${esc(wizard.delivery?.contact || wizard.customerPhone)}" />
          <label class="label">Delivery instructions</label>
          <input class="input" id="soWDinst" value="${esc(wizard.delivery?.instructions || "")}" />
          <label class="label">Delivery charge ₹</label>
          <input class="input" id="soWDchg" type="number" min="0" value="${esc(wizard.deliveryCharge)}" />
        </div>
        <div id="soWPickup" style="${wizard.fulfillmentType === "delivery" ? "display:none" : ""}">
          <label class="label">Pickup notes</label>
          <input class="input" id="soWPick" value="${esc(wizard.pickupNotes)}" />
        </div>
        <label class="label">Kitchen / prep notes</label>
        <textarea class="input" id="soWPrep" rows="2">${esc(wizard.prepNotes)}</textarea>
        <label class="label">Customer instructions</label>
        <textarea class="input" id="soWCustNote" rows="2">${esc(wizard.customerNotes)}</textarea>`;
    } else if (wizardStep === 4) {
      const rem = Math.max(0, totals.grandTotal - (Number(wizard.advanceCash) || 0) - (Number(wizard.advanceOnline) || 0));
      body.innerHTML = `
        <div class="so-w-tot">Order total <b>${inr(totals.grandTotal)}</b></div>
        <p class="muted">Advance is optional. ₹0 is allowed — order stays Unpaid.</p>
        <label class="label">Cash advance ₹</label>
        <input class="input" id="soWCash" type="number" min="0" step="1" value="${esc(wizard.advanceCash)}" />
        <label class="label">Online / UPI advance ₹</label>
        <input class="input" id="soWOnline" type="number" min="0" step="1" value="${esc(wizard.advanceOnline)}" />
        <label class="label">Payment reference</label>
        <input class="input" id="soWRef" value="${esc(wizard.paymentReference)}" />
        <div class="so-w-tot">Remaining after this <b>${inr(rem)}</b></div>
        <p class="muted">Only the advance hits today's cash/online collection — not the full ₹${esc(
          String(totals.grandTotal)
        )} sale.</p>`;
    } else {
      const adv = (Number(wizard.advanceCash) || 0) + (Number(wizard.advanceOnline) || 0);
      body.innerHTML = `
        <div class="so-confirm">
          <div><b>${esc(wizard.customerName)}</b> · ${esc(wizard.customerPhone)}</div>
          <div>${esc(wizard.companyName || "")}</div>
          <div>${esc(store().formatWhen(new Date(wizard.scheduledAt).toISOString()))}</div>
          <div>${wizard.fulfillmentType === "delivery" ? "Delivery" : "Pickup"} · ${esc(
            wizard.orderCategory
          )}</div>
          <ul>${(wizard.items || [])
            .map((i) => `<li>${esc(i.qty)}× ${esc(i.name)} — ${inr(i.price * i.qty)}</li>`)
            .join("")}</ul>
          <div>Total <b>${inr(totals.grandTotal)}</b></div>
          <div>Advance now ${inr(adv)} · Balance later ${inr(Math.max(0, totals.grandTotal - adv))}</div>
        </div>`;
    }
    const back = $("soWizardBack");
    const next = $("soWizardNext");
    if (back) back.style.visibility = wizardStep === 1 ? "hidden" : "visible";
    if (next) {
      next.disabled = false;
      next.textContent = wizardStep === 5 ? "Confirm booking" : "Next";
    }
  }

  function readWizardStep() {
    if (!wizard) return;
    if (wizardStep === 1) {
      wizard.customerName = $("soWName")?.value?.trim() || "";
      wizard.customerPhone = $("soWPhone")?.value?.trim() || "";
      wizard.companyName = $("soWCompany")?.value?.trim() || "";
      wizard.orderCategory = $("soWCat")?.value || "scheduled";
    } else if (wizardStep === 2) {
      document.querySelectorAll(".so-w-line").forEach((row) => {
        const idx = Number(row.getAttribute("data-idx"));
        if (!wizard.items[idx]) return;
        wizard.items[idx].qty = Math.max(1, Number(row.querySelector(".so-w-qty")?.value) || 1);
        wizard.items[idx].note = row.querySelector(".so-w-note")?.value || "";
      });
      wizard.discount = Math.max(0, Number($("soWDisc")?.value) || 0);
    } else if (wizardStep === 3) {
      wizard.scheduledAt = $("soWWhen")?.value || "";
      wizard.fulfillmentType = $("soWFul")?.value || "pickup";
      wizard.prepNotes = $("soWPrep")?.value || "";
      wizard.customerNotes = $("soWCustNote")?.value || "";
      wizard.pickupNotes = $("soWPick")?.value || "";
      if (wizard.fulfillmentType === "delivery") {
        wizard.delivery = {
          address: $("soWAddr")?.value || "",
          area: $("soWArea")?.value || "",
          landmark: $("soWLand")?.value || "",
          contact: $("soWDcontact")?.value || "",
          instructions: $("soWDinst")?.value || ""
        };
        wizard.deliveryCharge = Math.max(0, Number($("soWDchg")?.value) || 0);
      } else {
        wizard.deliveryCharge = 0;
      }
    } else if (wizardStep === 4) {
      wizard.advanceCash = Math.max(0, Number($("soWCash")?.value) || 0);
      wizard.advanceOnline = Math.max(0, Number($("soWOnline")?.value) || 0);
      wizard.paymentReference = $("soWRef")?.value || "";
    }
  }

  function validateStep() {
    readWizardStep();
    // Nothing mandatory — fill gaps with safe defaults so staff can move fast
    if (wizardStep === 1) {
      if (!String(wizard.customerName || "").trim()) wizard.customerName = "Guest";
    }
    if (wizardStep === 3) {
      if (!wizard.scheduledAt || Number.isNaN(new Date(wizard.scheduledAt).getTime())) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(19, 0, 0, 0);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        wizard.scheduledAt = local.toISOString().slice(0, 16);
      }
    }
    if (wizardStep === 4) {
      const totals = wizardTotals();
      const adv = (Number(wizard.advanceCash) || 0) + (Number(wizard.advanceOnline) || 0);
      // Soft-cap only (don't block booking): trim advance to total
      if (totals.grandTotal > 0 && adv > totals.grandTotal + 0.009) {
        const scale = totals.grandTotal / adv;
        wizard.advanceCash = Math.round((Number(wizard.advanceCash) || 0) * scale * 100) / 100;
        wizard.advanceOnline = Math.round((Number(wizard.advanceOnline) || 0) * scale * 100) / 100;
      }
    }
    return "";
  }

  async function wizardNext() {
    const err = validateStep();
    if (err) {
      toast(err, "error");
      return;
    }
    if (wizardStep < 5) {
      wizardStep += 1;
      renderWizard();
      return;
    }
    await confirmWizard();
  }

  async function confirmWizard() {
    readWizardStep();
    const err = validateStep();
    if (err) {
      toast(err, "error");
      return;
    }
    const when = new Date(wizard.scheduledAt);
    const btn = $("soWizardNext");
    if (btn) btn.disabled = true;
    try {
      const order = await store().createOrder({
        ...wizard,
        scheduledAt: when.toISOString()
      });
      toast(`Booked ${order.orderNo} · advance ${inr(order.amountReceived)}`, "success");
      try {
        root.KG?.scheduledReminders?.ensurePermission?.();
        root.KG?.scheduledReminders?.scheduleOrder?.(order, order.reminders);
      } catch (_) {}
      closeWizard();
      // clear POS cart if we used it
      try {
        root.KG?.posState?.clearCart?.();
      } catch (_) {}
      printBooking(order);
      if (root.showSection) root.showSection("scheduled");
      await refresh();
      openOrderById(order.id);
    } catch (e) {
      console.error(e);
      toast(e.message || "Booking failed", "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function printBooking(order) {
    const o = order;
    const w = window.open("", "_blank", "noopener,noreferrer,width=420,height=720");
    if (!w) {
      toast("Allow pop-ups to print", "error");
      return;
    }
    const items = (o.items || [])
      .map(
        (i) =>
          `<tr><td>${esc(i.qty)}× ${esc(i.name)}${i.variantLabel ? " (" + esc(i.variantLabel) + ")" : ""}</td><td style="text-align:right">${inr(
            i.lineTotal || i.price * i.qty
          )}</td></tr>`
      )
      .join("");
    w.document.write(`<!doctype html><html><head><title>${esc(o.orderNo)}</title>
      <style>
        body{font-family:ui-monospace,Menlo,monospace;padding:16px;color:#111}
        h1{font-size:16px;margin:0 0 4px}
        .tag{display:inline-block;border:1px solid #111;padding:2px 6px;font-size:11px;margin:8px 0}
        table{width:100%;border-collapse:collapse;margin:8px 0}
        td{padding:3px 0;font-size:12px;vertical-align:top}
        .muted{color:#555;font-size:11px}
      </style></head><body>
      <h1>The Kilogram</h1>
      <div class="tag">FUTURE ORDER / BOOKING RECEIPT</div>
      <div><b>${esc(o.orderNo)}</b></div>
      <div>${esc(o.customerName)} · ${esc(o.customerPhone)}</div>
      ${o.companyName ? `<div>${esc(o.companyName)}</div>` : ""}
      <div class="muted">Scheduled: ${esc(store().formatWhen(o.scheduledAt))}</div>
      <div>${o.fulfillmentType === "delivery" ? "DELIVERY" : "PICKUP"}</div>
      ${
        o.fulfillmentType === "delivery" && o.delivery
          ? `<div class="muted">${esc(o.delivery.address)} ${esc(o.delivery.area || "")}</div>`
          : ""
      }
      <table>${items}</table>
      <div>Total <b>${inr(o.grandTotal)}</b></div>
      <div>Advance received ${inr(o.amountReceived)}</div>
      <div>Remaining balance <b>${inr(o.remainingBalance)}</b></div>
      <div class="muted">Not a completed sale receipt</div>
      <script>window.print();</script>
      </body></html>`);
    w.document.close();
  }

  async function actPay(o) {
    const rem = Number(o.remainingBalance) || 0;
    if (rem <= 0) {
      toast("Nothing due", "info");
      return;
    }
    const cashStr = prompt(`Cash amount (remaining ${rem})`, String(rem));
    if (cashStr == null) return;
    const onlineStr = prompt("Online / UPI amount", "0");
    if (onlineStr == null) return;
    const cash = Math.max(0, Number(cashStr) || 0);
    const online = Math.max(0, Number(onlineStr) || 0);
    try {
      await store().addPayment(o.id, { cash, online });
      toast("Payment recorded", "success");
      await refresh();
      openOrderById(o.id);
    } catch (e) {
      toast(e.message || "Payment failed", "error");
    }
  }

  async function actReschedule(o) {
    const cur = new Date(o.scheduledAt);
    const local = new Date(cur.getTime() - cur.getTimezoneOffset() * 60000);
    const next = prompt("New date & time (YYYY-MM-DDTHH:mm)", local.toISOString().slice(0, 16));
    if (!next) return;
    const when = new Date(next);
    if (Number.isNaN(when.getTime())) {
      toast("Invalid date", "error");
      return;
    }
    try {
      await store().updateOrder(o.id, { scheduledAt: when.toISOString() });
      toast("Rescheduled + reminders updated", "success");
      await refresh();
      openOrderById(o.id);
    } catch (e) {
      toast(e.message || "Reschedule failed", "error");
    }
  }

  async function actEdit(o) {
    const name = prompt("Customer name", o.customerName || "");
    if (name == null) return;
    const phone = prompt("Phone", o.customerPhone || "");
    if (phone == null) return;
    const prep = prompt("Kitchen notes", o.prepNotes || "");
    if (prep == null) return;
    try {
      await store().updateOrder(o.id, {
        customerName: name,
        customerPhone: phone,
        prepNotes: prep
      });
      toast("Updated", "success");
      await refresh();
      openOrderById(o.id);
    } catch (e) {
      toast(e.message || "Update failed", "error");
    }
  }

  async function actComplete(o) {
    const rem = Number(o.remainingBalance) || 0;
    let collectCash = 0;
    let collectOnline = 0;
    if (rem > 0) {
      const cashStr = prompt(`Collect remaining cash (due ${rem}). Cancel to abort.`, String(rem));
      if (cashStr == null) return;
      collectCash = Math.max(0, Number(cashStr) || 0);
      const onlineStr = prompt("Collect online / UPI", "0");
      if (onlineStr == null) return;
      collectOnline = Math.max(0, Number(onlineStr) || 0);
    }
    if (!confirm(`Mark ${o.orderNo} completed? Revenue will count on today's sales; cash already taken as advance is not double-counted.`)) {
      return;
    }
    try {
      await store().fulfillOrder(o.id, { collectCash, collectOnline });
      toast("Order completed", "success");
      await refresh();
      openOrderById(o.id);
    } catch (e) {
      toast(e.message || "Complete failed", "error");
    }
  }

  function bind() {
    if (bind._done) return;
    bind._done = true;

    document.addEventListener("click", (e) => {
      const card = e.target.closest?.("[data-so-id]");
      if (card && (e.target.closest("#soList") || e.target.closest("#soCalendar"))) {
        openOrderById(card.getAttribute("data-so-id"));
        return;
      }
      const actBtn = e.target.closest?.("[data-so-act]");
      if (actBtn && $("soDetail")?.contains(actBtn)) {
        const o = ordersCache.find((x) => x.id === selectedId);
        if (!o) return;
        const act = actBtn.getAttribute("data-so-act");
        if (act === "pay") actPay(o);
        else if (act === "reschedule") actReschedule(o);
        else if (act === "edit") actEdit(o);
        else if (act === "print") printBooking(o);
        else if (act === "kds") {
          store()
            .pushToKds(o.id)
            .then(() => toast("Sent to kitchen", "success"))
            .catch((err) => toast(err.message || "KDS failed", "error"));
        } else if (act === "status") {
          store()
            .setStatus(o.id, actBtn.getAttribute("data-status"), { recognizeSale: false })
            .then(() => refresh().then(() => openOrderById(o.id)))
            .catch((err) => toast(err.message || "Status failed", "error"));
        } else if (act === "complete") actComplete(o);
        else if (act === "cancel") {
          const reason = prompt("Cancel reason?");
          if (reason == null) return;
          store()
            .cancelOrder(o.id, reason)
            .then(() => {
              toast("Cancelled (payments kept)", "success");
              return refresh();
            })
            .then(() => openOrderById(o.id))
            .catch((err) => toast(err.message || "Cancel failed", "error"));
        }
      }
    });

    $("soNewBtn")?.addEventListener("click", () => openWizard());
    $("soRefreshBtn")?.addEventListener("click", () => refresh());
    $("soFilterRange")?.addEventListener("change", (e) => {
      filter.range = e.target.value;
      $("soCustomRange").style.display = filter.range === "custom" ? "flex" : "none";
      renderList();
    });
    $("soFilterFul")?.addEventListener("change", (e) => {
      filter.fulfillment = e.target.value;
      renderList();
    });
    $("soFilterPay")?.addEventListener("change", (e) => {
      filter.payment = e.target.value;
      renderList();
    });
    $("soFilterStatus")?.addEventListener("change", (e) => {
      filter.status = e.target.value;
      renderList();
    });
    $("soSearch")?.addEventListener("input", (e) => {
      filter.q = e.target.value;
      renderList();
    });
    $("soFrom")?.addEventListener("change", (e) => {
      filter.from = e.target.value;
      renderList();
    });
    $("soTo")?.addEventListener("change", (e) => {
      filter.to = e.target.value;
      renderList();
    });
    $("soNotifyBtn")?.addEventListener("click", async () => {
      const ok = await root.KG.scheduledReminders.ensurePermission();
      toast(ok ? "Notifications enabled" : "Notifications blocked — enable in browser settings", ok ? "success" : "error");
    });
    $("soSettingsBtn")?.addEventListener("click", async () => {
      const s = await store().getSettings();
      const hours = prompt("Day-of reminder hours before (0 = off)", String(s.dayOfReminderHours ?? 2));
      if (hours == null) return;
      const h = Math.max(0, Number(hours) || 0);
      await store().saveSettings({ dayOfReminderHours: h, dayOfReminderEnabled: h > 0 });
      toast("Reminder settings saved", "success");
      for (const o of ordersCache) {
        if (o.status === "cancelled" || o.status === "completed") continue;
        await store().syncReminders(o);
      }
      await root.KG.scheduledReminders.hydrateFromOrders();
    });

    // Delegated so Next/Back always work from POS or Scheduled section
    document.addEventListener("click", (e) => {
      const t = e.target?.closest?.("#soWizardNext, #soWizardBack, #soWizardClose");
      if (!t) return;
      if (t.id === "soWizardClose") {
        e.preventDefault();
        closeWizard();
        return;
      }
      if (t.id === "soWizardBack") {
        e.preventDefault();
        readWizardStep();
        if (wizardStep > 1) {
          wizardStep -= 1;
          renderWizard();
        }
        return;
      }
      if (t.id === "soWizardNext") {
        e.preventDefault();
        wizardNext();
      }
    });

    document.addEventListener("input", (e) => {
      if (e.target?.id === "soWMenuSearch") {
        const q = String(e.target.value || "")
          .trim()
          .toLowerCase();
        const hits = $("soWMenuHits");
        if (!hits) return;
        if (!q) {
          hits.innerHTML = "";
          return;
        }
        const list = (menuCache || [])
          .filter((m) => `${m.name} ${m.nameHi} ${m.category}`.toLowerCase().includes(q))
          .slice(0, 12);
        hits.innerHTML = list
          .map(
            (m) =>
              `<button type="button" class="so-w-menu-hit" data-mid="${esc(m.id)}">${esc(m.name)} · ${inr(
                m.price
              )}</button>`
          )
          .join("");
      }
      if (e.target?.id === "soWFul") {
        wizard.fulfillmentType = e.target.value;
        const del = $("soWDelivery");
        const pick = $("soWPickup");
        if (del) del.style.display = wizard.fulfillmentType === "delivery" ? "" : "none";
        if (pick) pick.style.display = wizard.fulfillmentType === "delivery" ? "none" : "";
      }
    });

    document.addEventListener("click", (e) => {
      const hit = e.target.closest?.(".so-w-menu-hit");
      if (hit && wizard) {
        const id = hit.getAttribute("data-mid");
        const m = menuCache.find((x) => x.id === id);
        if (!m) return;
        wizard.items.push({
          menuItemId: m.id,
          name: m.name,
          nameHi: m.nameHi || "",
          variantLabel: "",
          price: Number(m.price) || 0,
          qty: 1,
          note: ""
        });
        renderWizard();
        return;
      }
      const rm = e.target.closest?.(".so-w-rm");
      if (rm && wizard) {
        const row = rm.closest(".so-w-line");
        const idx = Number(row?.getAttribute("data-idx"));
        if (Number.isFinite(idx)) {
          wizard.items.splice(idx, 1);
          renderWizard();
        }
      }
    });
  }

  async function onEnter() {
    bind();
    await refresh();
    root.KG?.scheduledReminders?.start?.();
    root.KG?.scheduledReminders?.hydrateFromOrders?.();
  }

  root.KG = root.KG || {};
  root.KG.scheduledUI = {
    onEnter,
    refresh,
    openWizard,
    openOrderById,
    printBooking
  };
  root.openScheduledBooking = function () {
    openWizard();
  };

  // Bind early so POS "Book future" works before visiting Scheduled Orders
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try {
        bind();
      } catch (_) {}
    });
  } else {
    try {
      bind();
    } catch (_) {}
  }
})(typeof window !== "undefined" ? window : globalThis);
