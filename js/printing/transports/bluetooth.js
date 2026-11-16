/**
 * Bluetooth transport adapter wrapping existing window.ThermalPrinter.
 * Keeps the Web Bluetooth path working as an extra option.
 */
(function (root) {
  "use strict";

  function tp() {
    return root.ThermalPrinter || window.ThermalPrinter;
  }

  function isSupported() {
    const t = tp();
    return !!(t && t.isSupported && t.isSupported());
  }

  function isConnected() {
    const t = tp();
    return !!(t && t.isConnected && t.isConnected());
  }

  async function connect() {
    const t = tp();
    if (!t) throw new Error("ThermalPrinter not loaded");
    await t.connect();
    return true;
  }

  async function tryReconnect() {
    const t = tp();
    if (!t || !t.tryReconnectSaved) return false;
    return !!(await t.tryReconnectSaved());
  }

  async function write(uint8) {
    // ThermalPrinter doesn't expose raw write; printerManager uses printKOTFromCart for BLE.
    // For raw bytes we attempt characteristic via undocumented path — otherwise throw to fallback.
    throw new Error("Use ThermalPrinter.printKOTFromCart for Bluetooth Hindi KOT; raw write not exposed");
  }

  async function disconnect() {
    const t = tp();
    if (t && t.disconnect) await t.disconnect();
  }

  /** Preferred BLE path for KOT from cart */
  async function printKOTFromCart(cart, helpers) {
    const t = tp();
    if (!t) throw new Error("ThermalPrinter not loaded");
    if (!isConnected()) {
      const ok = await tryReconnect();
      if (!ok) await connect();
    }
    await t.printKOTFromCart(cart, helpers);
  }

  const api = {
    isSupported,
    isConnected,
    connect,
    tryReconnect,
    write,
    disconnect,
    printKOTFromCart,
    name: "bluetooth"
  };
  root.KG = root.KG || {};
  root.KG.transports = root.KG.transports || {};
  root.KG.transports.bluetooth = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
