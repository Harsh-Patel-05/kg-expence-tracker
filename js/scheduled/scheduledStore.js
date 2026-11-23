/**
 * Scheduled / bulk / catering bookings + advance payments.
 * Advances post as sales docs with countsAsRevenue:false (cash/online in, not today's sale).
 * Fulfillment posts a normal revenue sale for remaining cash + full order totalAmount.
 */
(function (root) {
  "use strict";

  const COLLECTION = "scheduledOrders";
  const SETTINGS_DOC = "scheduled_orders";

  function db() {
    return firebase.firestore();
  }

  function toast(msg, type) {
    if (typeof root.toast === "function") root.toast(msg, type || "info");
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function actor() {
    try {
      return (
        root.KgAuth?.getProfile?.()?.name ||
        root.KgAuth?.currentUser?.email ||
        root.KG?.posState?.getState()?.cashierName ||
        "staff"
      );
    } catch (_) {
      return "staff";
    }
  }

  function businessDateISO(d) {
    if (root.KG?.salesBridge?.businessDateISO) {
      const cut = root.KG.posState?.getState()?.settings?.businessDayCutOff ?? 4;
      return root.KG.salesBridge.businessDateISO(d || new Date(), cut);
    }
    const dt = d instanceof Date ? d : new Date();
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }

  function uid(prefix) {
    return `${prefix || "id"}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function paymentStatusFrom(received, total) {
    const t = Math.max(0, num(total));
    const r = Math.max(0, num(received));
    if (t <= 0) return r > 0 ? "paid" : "unpaid";
    if (r <= 0.009) return "unpaid";
    if (r + 0.009 >= t) return "paid";
    return "partial";
  }

  function sumPayments(payments) {
    return (payments || []).reduce((s, p) => {
      if (String(p.kind || "").toLowerCase() === "refund") return s - Math.abs(num(p.amount));
      return s + num(p.amount);
    }, 0);
  }

  function recomputeMoney(order) {
    const grand = num(order.grandTotal);
    const received = Math.max(0, sumPayments(order.payments));
    const remaining = Math.max(0, Math.round((grand - received) * 100) / 100);
    let paymentStatus = paymentStatusFrom(received, grand);
    if (order.status === "cancelled" && received > 0 && remaining > 0) {
      /* keep */
    }
    if ((order.payments || []).some((p) => String(p.kind).toLowerCase() === "refund" && p.refundPending)) {
      paymentStatus = "refund_pending";
    }
    return {
      amountReceived: Math.round(received * 100) / 100,
      remainingBalance: remaining,
      paymentStatus
    };
  }

  function reminderTimes(scheduledAt, dayOfHours) {
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) return { prepAt: null, dayOfAt: null };
    const prepAt = new Date(when.getTime() - 24 * 60 * 60 * 1000);
    const hours = Number.isFinite(Number(dayOfHours)) ? Number(dayOfHours) : 2;
    const dayOfAt = hours > 0 ? new Date(when.getTime() - hours * 60 * 60 * 1000) : null;
    return {
      prepAt: prepAt.toISOString(),
      dayOfAt: dayOfAt ? dayOfAt.toISOString() : null
    };
  }

  async function nextOrderNo() {
    const date = businessDateISO(new Date());
    const ymd = date.replace(/-/g, "");
    const counterId = `SO_${ymd}`;
    const localKey = `kg_so_seq_${ymd}`;
    const localFallback = () => {
      let seq = 0;
      try {
        seq = (Number(localStorage.getItem(localKey)) || 0) + 1;
        localStorage.setItem(localKey, String(seq));
      } catch (_) {
        seq = Number(String(Date.now()).slice(-3)) || 1;
      }
      return { orderNo: `SO-${ymd}-${String(seq).padStart(4, "0")}`, date, seq };
    };
    try {
      const ref = db().collection("billCounters").doc(counterId);
      const seq = await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const n = (snap.exists ? Number(snap.data().seq) || 0 : 0) + 1;
        tx.set(
          ref,
          { seq: n, date, kind: "scheduled", updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
        return n;
      });
      try {
        localStorage.setItem(localKey, String(seq));
      } catch (_) {}
      return { orderNo: `SO-${ymd}-${String(seq).padStart(4, "0")}`, date, seq };
    } catch (_) {
      return localFallback();
    }
  }

  async function getSettings() {
    try {
      const snap = await db().collection("businessSettings").doc(SETTINGS_DOC).get();
      const d = snap.exists ? snap.data() || {} : {};
      return {
        dayOfReminderHours: d.dayOfReminderHours != null ? Number(d.dayOfReminderHours) : 2,
        dayOfReminderEnabled: d.dayOfReminderEnabled !== false,
        notifyPermissionAsked: !!d.notifyPermissionAsked
      };
    } catch (_) {
      return { dayOfReminderHours: 2, dayOfReminderEnabled: true, notifyPermissionAsked: false };
    }
  }

  async function saveSettings(patch) {
    await db()
      .collection("businessSettings")
      .doc(SETTINGS_DOC)
      .set(
        {
          ...patch,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
  }

  /**
   * Post advance / balance money into sales for cash/online balances,
   * without counting as completed restaurant sale revenue.
   */
  async function postAdvanceSale(payment, order) {
    const cash = num(payment.cashAmount);
    const online = num(payment.onlineAmount);
    const amount = cash + online;
    if (!(amount > 0)) return null;
    const saleId = `SOADV-${payment.id}`;
    const date = payment.businessDate || businessDateISO(new Date(payment.at || Date.now()));
    const payload = {
      date,
      cashAmount: cash,
      swiggyAmount: 0,
      zomatoAmount: 0,
      otherOnlineAmount: online,
      onlineAmount: online,
      totalAmount: amount,
      method: cash > 0 && online > 0 ? "mixed" : online > 0 ? "online" : "cash",
      source: "scheduled_advance",
      revenueKind: "customer_advance",
      countsAsRevenue: false,
      billId: saleId,
      billNo: order.orderNo || "",
      orderType: "Scheduled",
      scheduledOrderId: order.id,
      itemsCount: 0,
      createdBy: payment.by || actor(),
      status: "settled",
      discountTotal: 0,
      taxTotal: 0,
      notes: `${payment.kind || "advance"} · ${order.orderNo || order.id} · ${order.customerName || ""}`.trim()
    };
    if (root.KG?.salesBridge?.postBillToSales) {
      await root.KG.salesBridge.postBillToSales(payload);
    } else {
      await db().collection("sales").doc(saleId).set(
        {
          ...payload,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }
    return saleId;
  }

  async function upsertAppReminder(order, slot, atIso) {
    if (!atIso) return;
    const at = new Date(atIso);
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now() - 60000) return;
    const remId = `soremin_${order.id}_${slot}`;
    const dueDate = atIso.slice(0, 10);
    const title = `Scheduled order ${order.orderNo || ""} · ${order.customerName || ""} · ${formatWhen(order.scheduledAt)}`;
    const body = [
      order.customerPhone || "",
      `${order.fulfillmentType || "pickup"} · ₹${num(order.grandTotal)} · due ₹${num(order.remainingBalance)}`,
      (order.items || [])
        .slice(0, 6)
        .map((i) => `${i.qty}× ${i.name || i.nameHi}`)
        .join(", ")
    ]
      .filter(Boolean)
      .join(" · ");
    await db()
      .collection("reminders")
      .doc(remId)
      .set(
        {
          title,
          notes: body,
          dueDate,
          dueAt: atIso,
          notifyBeforeDays: 0,
          type: "scheduled_order",
          scheduledOrderId: order.id,
          slot,
          done: false,
          completed: false,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
  }

  async function cancelAppReminders(orderId) {
    const batch = db().batch();
    ["prep", "dayof"].forEach((slot) => {
      batch.set(
        db().collection("reminders").doc(`soremin_${orderId}_${slot}`),
        {
          done: true,
          completed: true,
          cancelled: true,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    });
    await batch.commit().catch(() => {});
  }

  function formatWhen(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso || "");
      return d.toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (_) {
      return String(iso || "");
    }
  }

  async function syncReminders(order, settings) {
    if (!order || order.status === "cancelled" || order.status === "completed") {
      await cancelAppReminders(order.id);
      return;
    }
    const cfg = settings || (await getSettings());
    const times = reminderTimes(order.scheduledAt, cfg.dayOfReminderEnabled ? cfg.dayOfReminderHours : 0);
    const reminders = {
      prepAt: times.prepAt,
      dayOfAt: cfg.dayOfReminderEnabled ? times.dayOfAt : null,
      dayOfHoursBefore: cfg.dayOfReminderHours,
      dayOfEnabled: cfg.dayOfReminderEnabled !== false
    };
    await upsertAppReminder(order, "prep", times.prepAt);
    if (reminders.dayOfAt) await upsertAppReminder(order, "dayof", reminders.dayOfAt);
    else {
      await db()
        .collection("reminders")
        .doc(`soremin_${order.id}_dayof`)
        .set({ done: true, completed: true, cancelled: true }, { merge: true })
        .catch(() => {});
    }
    try {
      root.KG?.scheduledReminders?.scheduleOrder?.(order, reminders);
    } catch (_) {}
    return reminders;
  }

  function normalizeItems(items) {
    return (items || []).map((l) => {
      const price = num(l.price);
      const qty = Math.max(0, num(l.qty) || 1);
      return {
        menuItemId: l.menuItemId || l.id || "",
        name: String(l.name || "").trim(),
        nameHi: String(l.nameHi || "").trim(),
        variantLabel: String(l.variantLabel || "").trim(),
        price,
        qty,
        lineTotal: Math.round(price * qty * 100) / 100,
        note: String(l.note || "").trim()
      };
    });
  }

  function calcTotals(items, discount, deliveryCharge) {
    const lines = normalizeItems(items);
    const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const disc = Math.max(0, num(discount));
    const delivery = Math.max(0, num(deliveryCharge));
    const grandTotal = Math.max(0, Math.round((subtotal - disc + delivery) * 100) / 100);
    return { items: lines, subtotal, discount: disc, deliveryCharge: delivery, grandTotal };
  }

  async function createOrder(input) {
    const settings = await getSettings();
    const { orderNo, date: bookDate } = await nextOrderNo();
    const id = uid("so");
    const totals = calcTotals(input.items, input.discount, input.deliveryCharge);
    let scheduledAt = String(input.scheduledAt || "").trim();
    if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(19, 0, 0, 0);
      scheduledAt = d.toISOString();
    }
    // Items optional — empty booking allowed (staff can edit later)
    const fulfillmentType = String(input.fulfillmentType || "pickup").toLowerCase() === "delivery" ? "delivery" : "pickup";

    const payments = [];
    let advanceCash = Math.max(0, num(input.advanceCash));
    let advanceOnline = Math.max(0, num(input.advanceOnline));
    let advanceTotal = advanceCash + advanceOnline;
    if (totals.grandTotal > 0 && advanceTotal > totals.grandTotal + 0.009) {
      const scale = totals.grandTotal / advanceTotal;
      advanceCash = Math.round(advanceCash * scale * 100) / 100;
      advanceOnline = Math.round(advanceOnline * scale * 100) / 100;
      advanceTotal = advanceCash + advanceOnline;
    }
    if (advanceTotal > 0) {
      const payId = uid("sopay");
      const payment = {
        id: payId,
        amount: advanceTotal,
        cashAmount: advanceCash,
        onlineAmount: advanceOnline,
        method: advanceCash > 0 && advanceOnline > 0 ? "mixed" : advanceOnline > 0 ? "online" : "cash",
        kind: advanceTotal + 0.009 >= totals.grandTotal ? "full_advance" : "advance",
        reference: String(input.paymentReference || "").trim(),
        at: nowIso(),
        businessDate: businessDateISO(new Date()),
        by: actor(),
        saleId: null
      };
      payment.saleId = await postAdvanceSale(payment, { id, orderNo, customerName: input.customerName });
      payments.push(payment);
    }

    let order = {
      id,
      orderNo,
      bookDate,
      orderCategory: String(input.orderCategory || "scheduled"),
      customerName: String(input.customerName || "").trim() || "Guest",
      customerPhone: String(input.customerPhone || "").trim(),
      companyName: String(input.companyName || "").trim(),
      items: totals.items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      deliveryCharge: totals.deliveryCharge,
      grandTotal: totals.grandTotal,
      fulfillmentType,
      delivery:
        fulfillmentType === "delivery"
          ? {
              address: String(input.delivery?.address || "").trim(),
              area: String(input.delivery?.area || "").trim(),
              landmark: String(input.delivery?.landmark || "").trim(),
              contact: String(input.delivery?.contact || input.customerPhone || "").trim(),
              instructions: String(input.delivery?.instructions || "").trim()
            }
          : null,
      pickupNotes: String(input.pickupNotes || "").trim(),
      prepNotes: String(input.prepNotes || "").trim(),
      customerNotes: String(input.customerNotes || "").trim(),
      scheduledAt,
      status: "confirmed",
      payments,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: actor(),
      fulfilledAt: null,
      saleId: null,
      kdsOrderId: null,
      cancelReason: "",
      cancelledAt: null
    };
    Object.assign(order, recomputeMoney(order));
    const reminders = await syncReminders(order, settings);
    order.reminders = reminders;

    await db()
      .collection(COLLECTION)
      .doc(id)
      .set({
        ...order,
        createdAtServer: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAtServer: firebase.firestore.FieldValue.serverTimestamp()
      });

    return order;
  }

  async function getOrder(id) {
    const snap = await db().collection(COLLECTION).doc(String(id)).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
  }

  async function listOrders(opts) {
    const o = opts || {};
    let q = db().collection(COLLECTION).orderBy("scheduledAt", "asc");
    if (o.limit) q = q.limit(Number(o.limit) || 200);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async function updateOrder(id, patch) {
    const cur = await getOrder(id);
    if (!cur) throw new Error("Order not found");
    if (cur.status === "cancelled") throw new Error("Cancelled order cannot be edited");
    if (cur.status === "completed") throw new Error("Completed order cannot be edited");

    const next = { ...cur, ...patch, id: cur.id, payments: cur.payments || [] };
    if (patch.items || patch.discount != null || patch.deliveryCharge != null) {
      const totals = calcTotals(
        patch.items || cur.items,
        patch.discount != null ? patch.discount : cur.discount,
        patch.deliveryCharge != null ? patch.deliveryCharge : cur.deliveryCharge
      );
      next.items = totals.items;
      next.subtotal = totals.subtotal;
      next.discount = totals.discount;
      next.deliveryCharge = totals.deliveryCharge;
      next.grandTotal = totals.grandTotal;
    }
    if (patch.fulfillmentType === "pickup") next.delivery = null;
    if (patch.fulfillmentType === "delivery") {
      next.delivery = {
        address: String(patch.delivery?.address || cur.delivery?.address || "").trim(),
        area: String(patch.delivery?.area || cur.delivery?.area || "").trim(),
        landmark: String(patch.delivery?.landmark || cur.delivery?.landmark || "").trim(),
        contact: String(patch.delivery?.contact || cur.delivery?.contact || cur.customerPhone || "").trim(),
        instructions: String(patch.delivery?.instructions || cur.delivery?.instructions || "").trim()
      };
    }
    Object.assign(next, recomputeMoney(next));
    if (num(next.amountReceived) > num(next.grandTotal) + 0.009) {
      throw new Error("Order total is below amount already received — raise total or refund");
    }
    next.updatedAt = nowIso();
    if (patch.scheduledAt && patch.scheduledAt !== cur.scheduledAt) {
      next.reminders = await syncReminders(next);
    } else if (patch.items || patch.customerName || patch.customerPhone) {
      next.reminders = await syncReminders(next);
    }
    const { id: _i, ...data } = next;
    await db()
      .collection(COLLECTION)
      .doc(id)
      .set(
        {
          ...data,
          updatedAtServer: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    return next;
  }

  async function addPayment(orderId, input) {
    const order = await getOrder(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status === "cancelled") throw new Error("Cannot take payment on cancelled order");
    const cash = Math.max(0, num(input.cashAmount != null ? input.cashAmount : input.cash));
    const online = Math.max(0, num(input.onlineAmount != null ? input.onlineAmount : input.online));
    const amount = cash + online;
    if (!(amount > 0)) throw new Error("Enter a payment amount");
    const money = recomputeMoney(order);
    if (amount > money.remainingBalance + 0.009) {
      throw new Error(`Payment exceeds remaining ₹${money.remainingBalance}`);
    }
    const payId = uid("sopay");
    const kind =
      String(input.kind || "").trim() ||
      (amount + 0.009 >= money.remainingBalance ? "balance" : "additional_advance");
    const payment = {
      id: payId,
      amount,
      cashAmount: cash,
      onlineAmount: online,
      method: cash > 0 && online > 0 ? "mixed" : online > 0 ? "online" : "cash",
      kind,
      reference: String(input.reference || "").trim(),
      at: nowIso(),
      businessDate: businessDateISO(new Date()),
      by: actor(),
      saleId: null
    };
    payment.saleId = await postAdvanceSale(payment, order);
    const payments = [...(order.payments || []), payment];
    const next = { ...order, payments, updatedAt: nowIso() };
    Object.assign(next, recomputeMoney(next));
    await db()
      .collection(COLLECTION)
      .doc(orderId)
      .set(
        {
          payments: next.payments,
          amountReceived: next.amountReceived,
          remainingBalance: next.remainingBalance,
          paymentStatus: next.paymentStatus,
          updatedAt: next.updatedAt,
          updatedAtServer: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    return { order: next, payment };
  }

  async function addRefund(orderId, input) {
    const order = await getOrder(orderId);
    if (!order) throw new Error("Order not found");
    const amount = Math.abs(num(input.amount));
    if (!(amount > 0)) throw new Error("Refund amount required");
    const money = recomputeMoney(order);
    if (amount > money.amountReceived + 0.009) throw new Error("Refund exceeds amount received");
    const cash = Math.max(0, num(input.cashAmount != null ? input.cashAmount : amount));
    const online = Math.max(0, num(input.onlineAmount != null ? input.onlineAmount : 0));
    const payId = uid("soref");
    const payment = {
      id: payId,
      amount,
      cashAmount: cash,
      onlineAmount: online,
      method: cash > 0 && online > 0 ? "mixed" : online > 0 ? "online" : "cash",
      kind: "refund",
      reference: String(input.reference || "").trim(),
      at: nowIso(),
      businessDate: businessDateISO(new Date()),
      by: actor(),
      saleId: null,
      refundPending: !!input.pending
    };
    // Negative cash effect via void-style advance sale (negative amounts)
    const saleId = `SOADV-${payId}`;
    const payload = {
      date: payment.businessDate,
      cashAmount: -cash,
      swiggyAmount: 0,
      zomatoAmount: 0,
      otherOnlineAmount: -online,
      onlineAmount: -online,
      totalAmount: -(cash + online),
      method: payment.method,
      source: "scheduled_refund",
      revenueKind: "customer_advance_refund",
      countsAsRevenue: false,
      billId: saleId,
      billNo: order.orderNo || "",
      orderType: "Scheduled",
      scheduledOrderId: order.id,
      status: "settled",
      notes: `refund · ${order.orderNo} · ${input.reason || ""}`.trim(),
      createdBy: actor()
    };
    await db().collection("sales").doc(saleId).set(
      {
        ...payload,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    payment.saleId = saleId;
    const payments = [...(order.payments || []), payment];
    const next = { ...order, payments, updatedAt: nowIso() };
    Object.assign(next, recomputeMoney(next));
    await db()
      .collection(COLLECTION)
      .doc(orderId)
      .set(
        {
          payments: next.payments,
          amountReceived: next.amountReceived,
          remainingBalance: next.remainingBalance,
          paymentStatus: next.paymentStatus,
          updatedAt: next.updatedAt,
          updatedAtServer: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    return { order: next, payment };
  }

  const STATUS_FLOW = {
    pickup: ["confirmed", "prep_pending", "preparing", "ready", "completed"],
    delivery: ["confirmed", "prep_pending", "preparing", "ready", "out_for_delivery", "completed"]
  };

  function allowedNextStatuses(order) {
    const type = order.fulfillmentType === "delivery" ? "delivery" : "pickup";
    const flow = STATUS_FLOW[type];
    const cur = order.status;
    if (cur === "cancelled" || cur === "completed") return [];
    const idx = flow.indexOf(cur);
    const next = [];
    if (idx >= 0 && idx < flow.length - 1) next.push(flow[idx + 1]);
    // allow skip back one for undo-ish
    if (idx > 0) next.push(flow[idx - 1]);
    next.push("cancelled");
    return [...new Set(next)];
  }

  async function setStatus(orderId, status, opts) {
    const order = await getOrder(orderId);
    if (!order) throw new Error("Order not found");
    const st = String(status || "").toLowerCase();
    if (st === "cancelled") {
      return cancelOrder(orderId, opts?.reason || "");
    }
    const allowed = allowedNextStatuses(order);
    if (!allowed.includes(st) && st !== order.status) {
      // allow direct set among known statuses for managers
      const all = [
        "confirmed",
        "prep_pending",
        "preparing",
        "ready",
        "out_for_delivery",
        "completed"
      ];
      if (!all.includes(st)) throw new Error("Invalid status");
    }
    const patch = {
      status: st,
      updatedAt: nowIso(),
      updatedAtServer: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (st === "completed") {
      patch.fulfilledAt = nowIso();
      await cancelAppReminders(orderId);
    }
    await db().collection(COLLECTION).doc(orderId).set(patch, { merge: true });
    if (st === "completed" && opts?.recognizeSale !== false) {
      await fulfillOrder(orderId, opts || {});
    }
    return getOrder(orderId);
  }

  async function cancelOrder(orderId, reason) {
    const order = await getOrder(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status === "completed") throw new Error("Completed orders cannot be cancelled");
    await cancelAppReminders(orderId);
    await db()
      .collection(COLLECTION)
      .doc(orderId)
      .set(
        {
          status: "cancelled",
          cancelReason: String(reason || "").trim(),
          cancelledAt: nowIso(),
          updatedAt: nowIso(),
          updatedAtServer: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    return getOrder(orderId);
  }

  /**
   * Recognize revenue on fulfillment day.
   * Cash/online on this sale = only unpaid remaining collected now (advances already in ledger).
   * totalAmount = full grandTotal for sales KPIs that day.
   */
  async function fulfillOrder(orderId, opts) {
    const order = await getOrder(orderId);
    if (!order) throw new Error("Order not found");
    if (order.saleId) return order;

    let current = order;
    const remaining = num(current.remainingBalance);
    const collectCash = Math.max(0, num(opts.collectCash));
    const collectOnline = Math.max(0, num(opts.collectOnline));
    const collectTotal = collectCash + collectOnline;
    if (collectTotal > remaining + 0.009) throw new Error("Collection exceeds remaining balance");
    if (collectTotal > 0) {
      const res = await addPayment(orderId, {
        cash: collectCash,
        online: collectOnline,
        kind: "balance",
        reference: opts.reference || ""
      });
      current = res.order;
    }

    // If still unpaid balance and force complete, leave paymentStatus partial
    const saleId = `SOFUL-${orderId}`;
    const date = businessDateISO(new Date());
    // Money already booked via advance sales — fulfillment sale carries revenue total,
    // cash/online zero so balances are not double-counted.
    const payload = {
      date,
      cashAmount: 0,
      swiggyAmount: 0,
      zomatoAmount: 0,
      otherOnlineAmount: 0,
      onlineAmount: 0,
      totalAmount: num(current.grandTotal),
      method: "scheduled",
      source: "scheduled_fulfillment",
      revenueKind: "scheduled_order",
      countsAsRevenue: true,
      billId: saleId,
      billNo: current.orderNo || "",
      orderType: "Scheduled",
      scheduledOrderId: orderId,
      itemsCount: (current.items || []).length,
      createdBy: actor(),
      status: "settled",
      discountTotal: num(current.discount),
      taxTotal: 0,
      notes: `Fulfilled scheduled order ${current.orderNo} · ${current.customerName}`
    };
    if (root.KG?.salesBridge?.postBillToSales) {
      await root.KG.salesBridge.postBillToSales(payload);
    } else {
      await db().collection("sales").doc(saleId).set(
        {
          ...payload,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    // Push to KDS if kitchen should see it (optional on complete — usually push earlier)
    if (opts.pushKds && root.KG?.kdsStore?.createOrder) {
      try {
        const kds = await root.KG.kdsStore.createOrder({
          orderId: current.orderNo || orderId,
          tableNo: "",
          orderType: current.fulfillmentType === "delivery" ? "Delivery" : "Takeaway",
          channel: "scheduled",
          platformOrderNo: current.orderNo || "",
          items: (current.items || []).map((i) => ({
            name_en: i.name,
            name_hi: i.nameHi || i.name,
            qty: i.qty,
            note: i.note || ""
          })),
          orderNote: [current.prepNotes, current.customerNotes].filter(Boolean).join(" · "),
          waiterName: current.customerName
        });
        await db()
          .collection(COLLECTION)
          .doc(orderId)
          .set({ kdsOrderId: kds?.id || kds?.orderId || null }, { merge: true });
      } catch (e) {
        console.warn("[scheduled] KDS push failed", e);
      }
    }

    await db()
      .collection(COLLECTION)
      .doc(orderId)
      .set(
        {
          status: "completed",
          fulfilledAt: nowIso(),
          saleId,
          updatedAt: nowIso(),
          updatedAtServer: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    await cancelAppReminders(orderId);
    return getOrder(orderId);
  }

  async function pushToKds(orderId) {
    const order = await getOrder(orderId);
    if (!order) throw new Error("Order not found");
    if (!root.KG?.kdsStore?.createOrder) throw new Error("KDS not available");
    if (order.kdsOrderId) return order.kdsOrderId;
    const money = recomputeMoney(order);
    const remaining = num(money.remainingBalance);
    const unpaid = remaining > 0.009;
    const itemPayload = (order.items || [])
      .filter((i) => i && (i.name || i.nameHi))
      .map((i) => ({
        name_en: i.name || i.nameHi || "Item",
        name_hi: i.nameHi || i.name || "",
        qty: i.qty,
        note: i.note || "",
        variant: i.variantLabel || ""
      }));
    if (!itemPayload.length) {
      itemPayload.push({
        name_en: "Scheduled order (items TBD)",
        name_hi: "",
        qty: 1,
        note: order.prepNotes || order.customerNotes || "",
        variant: ""
      });
    }
    const kds = await root.KG.kdsStore.createOrder({
      orderId: order.orderNo || orderId,
      tableNo: "",
      orderType: order.fulfillmentType === "delivery" ? "Delivery" : "Takeaway",
      channel: "scheduled",
      platformOrderNo: order.orderNo || "",
      billId: `SO-${order.id}`,
      grandTotal: remaining > 0 ? remaining : num(order.grandTotal),
      payLater: unpaid,
      paymentStatus: unpaid ? "unpaid" : "paid",
      items: itemPayload,
      orderNote: [
        `SCHEDULED ${formatWhen(order.scheduledAt)}`,
        `${order.customerName || ""} ${order.customerPhone || ""}`.trim(),
        unpaid ? `DUE ₹${remaining}` : "FULLY PAID",
        order.prepNotes,
        order.customerNotes,
        order.fulfillmentType === "delivery" && order.delivery
          ? `DELIVER: ${order.delivery.address}`
          : "PICKUP"
      ]
        .filter(Boolean)
        .join(" · "),
      waiterName: order.customerName
    });
    const kdsId = kds?.id || kds?.orderId || null;
    const nextStatus =
      order.status === "confirmed" || order.status === "prep_pending" ? "preparing" : order.status;
    await db()
      .collection(COLLECTION)
      .doc(orderId)
      .set(
        {
          kdsOrderId: kdsId,
          kdsPushedAt: nowIso(),
          status: nextStatus === "confirmed" ? "prep_pending" : order.status,
          updatedAt: nowIso(),
          updatedAtServer: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    return kdsId;
  }

  /** Orders in the POS/KDS lead window (default 45 min before → until completed). */
  function isInLeadWindow(order, leadMinutes) {
    if (!order || order.status === "cancelled" || order.status === "completed") return false;
    const when = new Date(order.scheduledAt).getTime();
    if (Number.isNaN(when)) return false;
    const lead = (Number.isFinite(Number(leadMinutes)) ? Number(leadMinutes) : 45) * 60 * 1000;
    const now = Date.now();
    return now >= when - lead;
  }

  function summarize(orders) {
    const list = orders || [];
    const active = list.filter((o) => o.status !== "cancelled");
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endToday = new Date(startToday.getTime() + 86400000);
    const endTomorrow = new Date(startToday.getTime() + 2 * 86400000);
    const inRange = (o, a, b) => {
      const t = new Date(o.scheduledAt).getTime();
      return t >= a && t < b;
    };
    const upcoming = active.filter((o) => o.status !== "completed" && new Date(o.scheduledAt) >= startToday);
    return {
      upcomingCount: upcoming.length,
      todayCount: active.filter((o) => inRange(o, startToday.getTime(), endToday.getTime())).length,
      tomorrowCount: active.filter((o) => inRange(o, endToday.getTime(), endTomorrow.getTime())).length,
      totalValue: active.reduce((s, o) => s + num(o.grandTotal), 0),
      advancesCollected: active.reduce((s, o) => s + num(o.amountReceived), 0),
      outstanding: active
        .filter((o) => o.status !== "completed")
        .reduce((s, o) => s + num(o.remainingBalance), 0),
      prepPending: active.filter((o) => ["confirmed", "prep_pending"].includes(o.status)).length,
      pickupCount: upcoming.filter((o) => o.fulfillmentType !== "delivery").length,
      deliveryCount: upcoming.filter((o) => o.fulfillmentType === "delivery").length
    };
  }

  root.KG = root.KG || {};
  root.KG.scheduledStore = {
    COLLECTION,
    createOrder,
    getOrder,
    listOrders,
    updateOrder,
    addPayment,
    addRefund,
    setStatus,
    cancelOrder,
    fulfillOrder,
    pushToKds,
    isInLeadWindow,
    getSettings,
    saveSettings,
    summarize,
    recomputeMoney,
    calcTotals,
    reminderTimes,
    formatWhen,
    allowedNextStatuses,
    paymentStatusFrom,
    syncReminders
  };
})(typeof window !== "undefined" ? window : globalThis);
