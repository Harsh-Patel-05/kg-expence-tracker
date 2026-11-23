/**
 * 58mm Bluetooth thermal printer (Web Bluetooth + ESC/POS raster).
 * Hindi KOT is drawn on canvas (Noto Sans Devanagari) then sent as a bitmap —
 * required because most thermal printers cannot print Devanagari as plain text.
 */
(function () {
  const STORAGE_KEY = "kg_thermal_printer_id";
  const PRINT_WIDTH = 384; // dots (~58mm @ 203dpi)
  const FONT_MAIN = '700 22px "Noto Sans Devanagari", "Nirmala UI", "Mangal", sans-serif';
  const FONT_SMALL = '400 18px "Noto Sans Devanagari", "Nirmala UI", "Mangal", sans-serif';
  const FONT_TITLE = '800 26px "Noto Sans Devanagari", "Nirmala UI", "Mangal", sans-serif';

  const BLE_SERVICES = [
    "000018f0-0000-1000-8000-00805f9b34fb",
    "49535343-fe7d-4ae5-8fa9-9fafd205e455",
    "e7810a71-73ae-499d-8c15-faa9aee0e38f",
    "0000ff00-0000-1000-8000-00805f9b34fb",
  ];

  const state = {
    device: null,
    server: null,
    characteristic: null,
    printerName: "",
    connecting: false,
  };

  function isSupported() {
    return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  }

  function isConnected() {
    return !!(state.device && state.device.gatt && state.device.gatt.connected && state.characteristic);
  }

  function getStatusLabel() {
    if (!isSupported()) return "Bluetooth printing not supported in this browser (use Chrome on Android/desktop)";
    if (state.connecting) return "Connecting…";
    if (isConnected()) return `Connected: ${state.printerName || "Printer"}`;
    return "Thermal printer not connected";
  }

  function updateStatusUi() {
    const el = document.getElementById("thermalPrinterStatus");
    if (el) el.textContent = getStatusLabel();
    const btn = document.getElementById("thermalPrinterConnectBtn");
    if (btn) {
      btn.textContent = isConnected() ? "Reconnect printer" : "Connect thermal printer";
    }
  }

  async function loadFonts() {
    if (!document.fonts) return;
    try {
      await Promise.all([
        document.fonts.load(FONT_TITLE),
        document.fonts.load(FONT_MAIN),
        document.fonts.load(FONT_SMALL),
      ]);
    } catch (_) {}
  }

  function wrapLines(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines = [];
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = line + " " + words[i];
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
    return lines;
  }

  /** Build printable line objects from POS cart (Hindi titles). */
  async function buildKotLinesFromCart(cart, helpers) {
    const { prepLabel, translateEnToHi, escapeHtml } = helpers;
    const lang = "hi";
    const out = [];
    out.push({ text: "THE KILOGRAM", align: "center", font: "title" });
    out.push({ text: "किचन ऑर्डर टिकट (KOT)", align: "center", font: "title" });
    out.push({ text: "—".repeat(20), align: "center", font: "small" });
    const now = new Date();
    out.push({ text: `दिनांक: ${now.toLocaleDateString("en-IN")}  ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`, font: "small" });
    out.push({ text: "—".repeat(20), align: "center", font: "small" });

    for (let i = 0; i < cart.length; i++) {
      const it = cart[i];
      let title = String(it.nameHi || "").trim();
      if (!title && String(it.name || "").trim()) {
        title = (await translateEnToHi(String(it.name).trim())) || String(it.name || "");
      }
      if (!title) title = String(it.name || "");
      const prep = prepLabel(it.prep, lang);
      out.push({ text: `${i + 1}. ${title}`, font: "main", bold: true });
      out.push({ text: `   मात्रा: × ${Number(it.qty) || 1}`, font: "small" });
      if (prep && prep !== "Regular") out.push({ text: `   (${prep})`, font: "small" });
      if (it.note) out.push({ text: `   नोट: ${it.note}`, font: "small" });
    }

    out.push({ text: "—".repeat(20), align: "center", font: "small" });
    out.push({ text: "तत्काल तैयार करें", align: "center", font: "main" });
    out.push({ text: "धन्यवाद", align: "center", font: "small" });
    return out;
  }

  async function renderKotCanvas(lines) {
    await loadFonts();
    const padding = 14;
    const maxText = PRINT_WIDTH - padding * 2;
    const measure = document.createElement("canvas").getContext("2d");

    const expanded = [];
    for (const row of lines) {
      const font =
        row.font === "title" ? FONT_TITLE : row.font === "small" ? FONT_SMALL : FONT_MAIN;
      measure.font = font;
      const chunks = wrapLines(measure, row.text, maxText);
      chunks.forEach((t) => expanded.push({ ...row, text: t }));
    }

    const lineH = 30;
    const height = padding * 2 + expanded.length * lineH + 24;
    const canvas = document.createElement("canvas");
    canvas.width = PRINT_WIDTH;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PRINT_WIDTH, height);
    ctx.fillStyle = "#000000";
    ctx.textBaseline = "top";

    let y = padding;
    for (const row of expanded) {
      const font =
        row.font === "title" ? FONT_TITLE : row.font === "small" ? FONT_SMALL : FONT_MAIN;
      ctx.font = font;
      const align = row.align || "left";
      ctx.textAlign = align;
      const x =
        align === "center" ? PRINT_WIDTH / 2 : align === "right" ? PRINT_WIDTH - padding : padding;
      ctx.fillText(row.text, x, y);
      y += lineH;
    }
    return canvas;
  }

  function canvasToEscPosRaster(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, w, h);
    const bytesPerRow = Math.ceil(w / 8);
    const raster = new Uint8Array(bytesPerRow * h);

    for (let y = 0; y < h; y++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let b = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x >= w) continue;
          const i = (y * w + x) * 4;
          const lum = data[i] + data[i + 1] + data[i + 2];
          if (lum < 600) b |= 0x80 >> bit;
        }
        raster[y * bytesPerRow + bx] = b;
      }
    }

    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = h & 0xff;
    const yH = (h >> 8) & 0xff;

    const init = Uint8Array.from([0x1b, 0x40]); // ESC @
    const img = new Uint8Array(8 + raster.length);
    img.set([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH], 0);
    img.set(raster, 8);
    const feed = Uint8Array.from([0x1b, 0x64, 0x04]); // feed 4 lines
    const cut = Uint8Array.from([0x1d, 0x56, 0x42, 0x00]); // partial cut

    const out = new Uint8Array(init.length + img.length + feed.length + cut.length);
    let o = 0;
    out.set(init, o);
    o += init.length;
    out.set(img, o);
    o += img.length;
    out.set(feed, o);
    o += feed.length;
    out.set(cut, o);
    return out;
  }

  async function findWritableCharacteristic(server) {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      let chars = [];
      try {
        chars = await service.getCharacteristics();
      } catch (_) {
        continue;
      }
      for (const ch of chars) {
        const p = ch.properties;
        if (p.writeWithoutResponse || p.write) return ch;
      }
    }
    return null;
  }

  async function writeRaw(buffer) {
    if (!state.characteristic) throw new Error("Printer not connected");
    const chunk = 180;
    const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    for (let i = 0; i < data.length; i += chunk) {
      const slice = data.slice(i, i + chunk);
      if (state.characteristic.properties.writeWithoutResponse) {
        await state.characteristic.writeValueWithoutResponse(slice);
      } else {
        await state.characteristic.writeValue(slice);
      }
      await new Promise((r) => setTimeout(r, 12));
    }
  }

  async function attachDevice(device) {
    state.device = device;
    state.printerName = device.name || "Bluetooth printer";
    device.addEventListener("gattserverdisconnected", () => {
      state.server = null;
      state.characteristic = null;
      updateStatusUi();
    });
    const server = await device.gatt.connect();
    state.server = server;
    state.characteristic = await findWritableCharacteristic(server);
    if (!state.characteristic) {
      await device.gatt.disconnect();
      throw new Error("No writable print channel found on this device");
    }
    try {
      localStorage.setItem(STORAGE_KEY, device.id);
    } catch (_) {}
    updateStatusUi();
    return true;
  }

  async function connect() {
    if (!isSupported()) throw new Error("Use Chrome or Edge with Bluetooth enabled");
    state.connecting = true;
    updateStatusUi();
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_SERVICES,
      });
      await attachDevice(device);
      return { success: true, name: state.printerName };
    } finally {
      state.connecting = false;
      updateStatusUi();
    }
  }

  async function tryReconnectSaved() {
    if (!isSupported() || isConnected()) return false;
    let savedId = "";
    try {
      savedId = localStorage.getItem(STORAGE_KEY) || "";
    } catch (_) {}
    if (!savedId || !navigator.bluetooth.getDevices) return false;
    try {
      const devices = await navigator.bluetooth.getDevices();
      const device = devices.find((d) => d.id === savedId);
      if (!device) return false;
      await attachDevice(device);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function disconnect() {
    try {
      if (state.device?.gatt?.connected) await state.device.gatt.disconnect();
    } catch (_) {}
    state.device = null;
    state.server = null;
    state.characteristic = null;
    updateStatusUi();
  }

  async function printKOTFromCart(cart, helpers) {
    if (!cart.length) throw new Error("Cart is empty");
    const lines = await buildKotLinesFromCart(cart, helpers);
    const canvas = await renderKotCanvas(lines);
    const escpos = canvasToEscPosRaster(canvas);
    await writeRaw(escpos);
    return { success: true };
  }

  window.ThermalPrinter = {
    isSupported,
    isConnected,
    connect,
    disconnect,
    tryReconnectSaved,
    printKOTFromCart,
    getStatusLabel,
    updateStatusUi,
  };

  window.thermalPrinterConnect = async function () {
    try {
      if (window.ThermalPrinter.isConnected()) await window.ThermalPrinter.disconnect();
      const r = await window.ThermalPrinter.connect();
      if (window.toast) window.toast(`Printer connected: ${r.name}`, "success");
    } catch (e) {
      console.error(e);
      if (window.toast) window.toast(e.message || "Could not connect printer", "error");
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    updateStatusUi();
    setTimeout(() => window.ThermalPrinter.tryReconnectSaved(), 800);
  });
})();
