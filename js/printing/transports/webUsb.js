/** WebUSB transport for USB printer class (7) devices. */
(function (root) {
  "use strict";

  let device = null;
  let endpointOut = null;
  let ifaceNumber = 0;

  function isSupported() {
    return !!(typeof navigator !== "undefined" && navigator.usb);
  }

  function findOutEndpoint(iface) {
    const alts = iface.alternates || [];
    for (const alt of alts) {
      for (const ep of alt.endpoints || []) {
        if (ep.direction === "out") return ep;
      }
    }
    return null;
  }

  async function openDevice(dev) {
    await dev.open();
    if (dev.configuration == null) await dev.selectConfiguration(1);
    let found = null;
    for (const cfg of dev.configurations || []) {
      for (const iface of cfg.interfaces || []) {
        const ep = findOutEndpoint(iface);
        if (ep || iface.alternate?.interfaceClass === 7) {
          found = { iface, ep: ep || findOutEndpoint(iface) };
          break;
        }
      }
      if (found) break;
    }
    // Prefer printer class 7
    if (!found) {
      for (const cfg of dev.configurations || []) {
        for (const iface of cfg.interfaces || []) {
          const alt = iface.alternate;
          if (alt && alt.interfaceClass === 7) {
            found = { iface, ep: findOutEndpoint(iface) };
            break;
          }
        }
        if (found) break;
      }
    }
    if (!found || !found.ep) {
      // Fallback: first OUT endpoint on first interface
      const iface = dev.configuration.interfaces[0];
      const ep = findOutEndpoint(iface);
      if (!ep) throw new Error("No USB OUT endpoint found. On Windows, bind WinUSB via Zadig, or use Serial / system printer.");
      found = { iface, ep };
    }
    ifaceNumber = found.iface.interfaceNumber;
    if (!found.iface.claimed) await dev.claimInterface(ifaceNumber);
    endpointOut = found.ep.endpointNumber;
    device = dev;
  }

  async function connect() {
    if (!isSupported()) throw new Error("WebUSB not supported (use Chrome/Edge; Windows may need WinUSB/Zadig)");
    const filters = [{ classCode: 7 }]; // printer
    let dev;
    try {
      dev = await navigator.usb.requestDevice({ filters });
    } catch (_) {
      // Some ESC/POS devices don't advertise class 7
      dev = await navigator.usb.requestDevice({ filters: [] });
    }
    await openDevice(dev);
    return true;
  }

  async function tryReconnect() {
    if (!isSupported()) return false;
    try {
      const list = await navigator.usb.getDevices();
      if (!list.length) return false;
      await openDevice(list[0]);
      return true;
    } catch (e) {
      console.warn("usb reconnect", e);
      return false;
    }
  }

  function isConnected() {
    return !!(device && device.opened && endpointOut != null);
  }

  async function write(uint8, chunkSize) {
    if (!isConnected()) throw new Error("USB printer not connected");
    const size = chunkSize || 512;
    for (let i = 0; i < uint8.length; i += size) {
      const chunk = uint8.slice(i, i + size);
      await device.transferOut(endpointOut, chunk);
      await new Promise((r) => setTimeout(r, 8));
    }
  }

  async function disconnect() {
    try {
      if (device && device.opened) {
        try {
          await device.releaseInterface(ifaceNumber);
        } catch (_) {}
        await device.close();
      }
    } catch (_) {}
    device = null;
    endpointOut = null;
  }

  const api = { isSupported, connect, tryReconnect, isConnected, write, disconnect, name: "usb" };
  root.KG = root.KG || {};
  root.KG.transports = root.KG.transports || {};
  root.KG.transports.webUsb = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
