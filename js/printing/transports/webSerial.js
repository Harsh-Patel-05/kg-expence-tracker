/** Web Serial transport for USB-serial / COM thermal printers. */
(function (root) {
  "use strict";

  const STORAGE = "kg_printer_serial_info";
  let port = null;
  let writer = null;

  function isSupported() {
    return !!(typeof navigator !== "undefined" && navigator.serial);
  }

  async function connect(opts) {
    if (!isSupported()) throw new Error("Web Serial not supported (use Chrome/Edge on HTTPS or localhost)");
    const baud = (opts && opts.baudRate) || 9600;
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: baud });
    writer = port.writable.getWriter();
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ baudRate: baud, at: Date.now() }));
    } catch (_) {}
    return true;
  }

  async function tryReconnect(opts) {
    if (!isSupported()) return false;
    try {
      const ports = await navigator.serial.getPorts();
      if (!ports.length) return false;
      const baud = (opts && opts.baudRate) || 9600;
      port = ports[0];
      if (!port.readable) await port.open({ baudRate: baud });
      writer = port.writable.getWriter();
      return true;
    } catch (e) {
      console.warn("serial reconnect", e);
      return false;
    }
  }

  function isConnected() {
    return !!(port && writer);
  }

  async function write(uint8, chunkSize) {
    if (!writer) throw new Error("Serial printer not connected");
    const size = chunkSize || 512;
    for (let i = 0; i < uint8.length; i += size) {
      await writer.write(uint8.slice(i, i + size));
      await new Promise((r) => setTimeout(r, 8));
    }
  }

  async function disconnect() {
    try {
      if (writer) {
        writer.releaseLock();
        writer = null;
      }
      if (port) {
        await port.close();
        port = null;
      }
    } catch (_) {}
  }

  const api = { isSupported, connect, tryReconnect, isConnected, write, disconnect, name: "serial" };
  root.KG = root.KG || {};
  root.KG.transports = root.KG.transports || {};
  root.KG.transports.webSerial = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
