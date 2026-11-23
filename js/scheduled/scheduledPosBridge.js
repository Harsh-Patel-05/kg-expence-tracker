/**
 * Scheduled orders → POS highlight + auto KDS push.
 * From 45 minutes before fulfillment until completed/cancelled:
 *  - show highlighted chips on POS (like unpaid)
 *  - auto-send to kitchen once
 *  - remaining balance collectible as Cash / Online on deliver
 */
(function (root) {
  "use strict";

  const LEAD_MIN = 45;
  const POLL_MS = 20000;
  let timer = null;
  let started = false;
  let dueCache = [];
  const listeners = new Set();
  const pushing = new Set();

  function toast(msg, type) {
    if (typeof root.toast === "function") root.toast(msg, type || "info");
  }

  function store() {
    return root.KG?.scheduledStore;
  }

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(dueCache.slice());
      } catch (_) {}
    });
    try {
      root.KG?.posKdsLive?.refreshScheduledDue?.(dueCache.slice());
    } catch (_) {}
  }

  function onChange(fn) {
    if (typeof fn === "function") listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getDueOrders() {
    return dueCache.slice();
  }

  async function tick() {
    const st = store();
    if (!st?.listOrders) return;
    let list = [];
    try {
      list = await st.listOrders({ limit: 150 });
    } catch (e) {
      console.warn("[scheduledPosBridge] list failed", e);
      return;
    }
    const due = (list || []).filter((o) => st.isInLeadWindow(o, LEAD_MIN));
    due.sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
    dueCache = due;

    for (const o of due) {
      if (o.kdsOrderId || o.kdsPushedAt) continue;
      if (pushing.has(o.id)) continue;
      pushing.add(o.id);
      try {
        const kdsId = await st.pushToKds(o.id);
        o.kdsOrderId = kdsId;
        o.kdsPushedAt = new Date().toISOString();
        if (o.status === "confirmed") o.status = "prep_pending";
        toast(`Kitchen: ${o.orderNo || o.id} (scheduled)`, "success");
      } catch (e) {
        console.warn("[scheduledPosBridge] KDS push", o.orderNo, e);
      } finally {
        pushing.delete(o.id);
      }
    }

    notify();
  }

  function start() {
    if (started) return;
    started = true;
    tick();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tick();
    });
  }

  function stop() {
    started = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  /**
   * Collect remaining balance (cash and/or online) and mark order completed.
   * Updates linked KDS ticket payment status when possible.
   */
  async function collectAndComplete(orderId, { cash, online, mode } = {}) {
    const st = store();
    if (!st) throw new Error("Scheduled store not ready");
    const order = await st.getOrder(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status === "cancelled") throw new Error("Order cancelled");
    if (order.status === "completed" && order.saleId) return order;

    const remaining = Number(order.remainingBalance) || 0;
    let collectCash = Math.max(0, Number(cash) || 0);
    let collectOnline = Math.max(0, Number(online) || 0);

    if (mode === "cash") {
      collectCash = remaining;
      collectOnline = 0;
    } else if (mode === "online") {
      collectCash = 0;
      collectOnline = remaining;
    }

    if (remaining > 0.009 && collectCash + collectOnline <= 0) {
      throw new Error("Choose Cash or Online for the remaining amount");
    }
    if (collectCash + collectOnline > remaining + 0.009) {
      throw new Error(`Amount exceeds remaining ₹${remaining}`);
    }

    const updated = await st.fulfillOrder(orderId, {
      collectCash,
      collectOnline,
      pushKds: false
    });

    // Mark kitchen ticket paid
    try {
      const kdsId = updated?.kdsOrderId || order.kdsOrderId;
      if (kdsId && root.KG?.kdsStore?.markPaid) {
        await root.KG.kdsStore.markPaid(kdsId);
      } else if (kdsId && root.KG?.kdsStore?.updateOrder) {
        await root.KG.kdsStore.updateOrder(kdsId, { payLater: false, paymentStatus: "paid" });
      }
    } catch (e) {
      console.warn("[scheduledPosBridge] markPaid", e);
    }

    await tick();
    return updated;
  }

  root.KG = root.KG || {};
  root.KG.scheduledPosBridge = {
    LEAD_MIN,
    start,
    stop,
    tick,
    getDueOrders,
    onChange,
    collectAndComplete
  };
})(typeof window !== "undefined" ? window : globalThis);
