(function (root) {
  "use strict";

  const KEY = "kg_kds_last_orders";
  const MAX_AGE_MS = 30 * 60 * 1000; // discard stale offline cache
  let wakeLock = null;

  function onlyActive(orders) {
    return (orders || []).filter((o) =>
      ["waiting", "preparing", "ready"].includes(String(o?.status || "").toLowerCase())
    );
  }

  function saveSnapshot(orders) {
    try {
      root.localStorage.setItem(
        KEY,
        JSON.stringify({ at: Date.now(), orders: onlyActive(orders) })
      );
    } catch (_) {}
  }

  function loadSnapshot() {
    try {
      const raw = root.localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.at || Date.now() - Number(data.at) > MAX_AGE_MS) {
        root.localStorage.removeItem(KEY);
        return null;
      }
      data.orders = onlyActive(data.orders);
      return data;
    } catch (_) {
      return null;
    }
  }

  async function requestWakeLock() {
    try {
      if (root.navigator?.wakeLock?.request) {
        wakeLock = await root.navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
        });
      }
    } catch (e) {
      console.warn("Wake Lock unavailable", e);
    }
  }

  function onVisibility() {
    if (root.document.visibilityState === "visible") requestWakeLock();
  }

  function startKeepAwake() {
    requestWakeLock();
    root.document.addEventListener("visibilitychange", onVisibility);
  }

  function stopKeepAwake() {
    root.document.removeEventListener("visibilitychange", onVisibility);
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  root.KG = root.KG || {};
  root.KG.kdsOffline = {
    saveSnapshot,
    loadSnapshot,
    startKeepAwake,
    stopKeepAwake,
    requestWakeLock
  };
})(typeof window !== "undefined" ? window : globalThis);
