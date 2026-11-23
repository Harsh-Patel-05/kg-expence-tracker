/**
 * Device notifications for scheduled orders (24h + optional day-of).
 * Works while any app tab is open; uses Notification API + local schedule map.
 * True closed-app push needs FCM — not configured in this project yet.
 */
(function (root) {
  "use strict";

  const LS_KEY = "kg_scheduled_reminders_v1";
  const FIRED_KEY = "kg_scheduled_reminders_fired_v1";
  let timer = null;

  function loadMap() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveMap(map) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  function loadFired() {
    try {
      return JSON.parse(localStorage.getItem(FIRED_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveFired(map) {
    try {
      localStorage.setItem(FIRED_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  async function ensurePermission() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    try {
      const p = await Notification.requestPermission();
      return p === "granted";
    } catch (_) {
      return false;
    }
  }

  function notify(title, body, tag) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const n = new Notification(title, {
        body,
        tag: tag || undefined,
        requireInteraction: true
      });
      n.onclick = () => {
        try {
          window.focus();
          root.showSection?.("scheduled");
          root.KG?.scheduledUI?.openOrderById?.(String(tag || "").replace(/^so_|^soremin_/, "").split("_")[0]);
        } catch (_) {}
        n.close();
      };
    } catch (_) {}
  }

  function scheduleOrder(order, reminders) {
    if (!order?.id) return;
    const map = loadMap();
    const rem = reminders || order.reminders || {};
    if (order.status === "cancelled" || order.status === "completed") {
      delete map[`${order.id}:prep`];
      delete map[`${order.id}:dayof`];
      saveMap(map);
      return;
    }
    const baseBody = [
      order.customerName || "",
      order.customerPhone || "",
      order.orderNo || "",
      root.KG?.scheduledStore?.formatWhen?.(order.scheduledAt) || order.scheduledAt,
      `${order.fulfillmentType || "pickup"} · Total ₹${Number(order.grandTotal) || 0}`,
      `Advance ₹${Number(order.amountReceived) || 0} · Due ₹${Number(order.remainingBalance) || 0}`,
      (order.items || [])
        .slice(0, 8)
        .map((i) => `${i.qty}× ${i.name || i.nameHi}`)
        .join(", ")
    ]
      .filter(Boolean)
      .join("\n");

    if (rem.prepAt) {
      map[`${order.id}:prep`] = {
        at: rem.prepAt,
        title: `Prepare tomorrow: ${order.orderNo || ""} ${order.customerName || ""}`.trim(),
        body: baseBody,
        orderId: order.id
      };
    } else delete map[`${order.id}:prep`];

    if (rem.dayOfAt) {
      map[`${order.id}:dayof`] = {
        at: rem.dayOfAt,
        title: `Order soon: ${order.orderNo || ""} ${order.customerName || ""}`.trim(),
        body: baseBody,
        orderId: order.id
      };
    } else delete map[`${order.id}:dayof`];

    saveMap(map);
  }

  function clearOrder(orderId) {
    const map = loadMap();
    Object.keys(map).forEach((k) => {
      if (k.startsWith(`${orderId}:`)) delete map[k];
    });
    saveMap(map);
  }

  function tick() {
    const map = loadMap();
    const fired = loadFired();
    const now = Date.now();
    Object.keys(map).forEach((key) => {
      const row = map[key];
      if (!row?.at) return;
      const t = new Date(row.at).getTime();
      if (Number.isNaN(t)) return;
      if (t > now) return;
      if (now - t > 6 * 60 * 60 * 1000) {
        // too stale — drop
        delete map[key];
        return;
      }
      if (fired[key]) return;
      notify(row.title, row.body, key);
      fired[key] = now;
      delete map[key];
    });
    // prune old fired
    Object.keys(fired).forEach((k) => {
      if (now - Number(fired[k] || 0) > 7 * 86400000) delete fired[k];
    });
    saveMap(map);
    saveFired(fired);
  }

  function start() {
    if (timer) return;
    ensurePermission();
    tick();
    timer = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tick();
    });
  }

  async function hydrateFromOrders() {
    try {
      const list = await root.KG?.scheduledStore?.listOrders?.({ limit: 100 });
      const settings = await root.KG?.scheduledStore?.getSettings?.();
      (list || []).forEach((o) => {
        if (o.status === "cancelled" || o.status === "completed") return;
        const times = root.KG.scheduledStore.reminderTimes(
          o.scheduledAt,
          settings?.dayOfReminderEnabled ? settings.dayOfReminderHours : 0
        );
        scheduleOrder(o, {
          prepAt: times.prepAt,
          dayOfAt: settings?.dayOfReminderEnabled === false ? null : times.dayOfAt
        });
      });
    } catch (_) {}
  }

  root.KG = root.KG || {};
  root.KG.scheduledReminders = {
    start,
    ensurePermission,
    scheduleOrder,
    clearOrder,
    hydrateFromOrders,
    tick
  };
})(typeof window !== "undefined" ? window : globalThis);
