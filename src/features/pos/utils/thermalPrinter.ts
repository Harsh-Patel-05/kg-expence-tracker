import { inr } from "@/lib/utils";
import type { WhatsAppBillPayload } from "./whatsappBill";

const STORAGE_KEY = "kg_thermal_printer_id";
const PRINT_WIDTH = 384;
const FONT_MAIN = '600 20px system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_SMALL = '400 17px system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_TITLE = '800 24px system-ui, -apple-system, "Segoe UI", sans-serif';

const BLE_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aee0e38f",
  "0000ff00-0000-1000-8000-00805f9b34fb"
];

type PrintRow = { text: string; align?: "left" | "center" | "right"; font?: "title" | "main" | "small" };

type BleCharacteristic = {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValueWithoutResponse: (data: BufferSource) => Promise<void>;
  writeValue: (data: BufferSource) => Promise<void>;
};

type BleGattServer = {
  getPrimaryServices: () => Promise<Array<{ getCharacteristics: () => Promise<BleCharacteristic[]> }>>;
};

type BleDevice = {
  id: string;
  name?: string;
  gatt?: BleGattServer & {
    connected: boolean;
    connect: () => Promise<BleGattServer>;
    disconnect: () => Promise<void>;
  };
  addEventListener: (type: string, listener: () => void) => void;
};

type BluetoothNav = Navigator & {
  bluetooth?: {
    requestDevice: (options: {
      acceptAllDevices?: boolean;
      optionalServices?: string[];
    }) => Promise<BleDevice>;
    getDevices?: () => Promise<BleDevice[]>;
  };
};

const state: {
  device: BleDevice | null;
  characteristic: BleCharacteristic | null;
  printerName: string;
  connecting: boolean;
} = {
  device: null,
  characteristic: null,
  printerName: "",
  connecting: false
};

function navBluetooth() {
  return (navigator as BluetoothNav).bluetooth;
}

export function thermalPrinterSupported() {
  const bt = navBluetooth();
  return !!(bt && bt.requestDevice);
}

export function thermalPrinterConnected() {
  return !!(
    state.device &&
    state.device.gatt &&
    state.device.gatt.connected &&
    state.characteristic
  );
}

export function thermalPrinterStatusLabel() {
  if (!thermalPrinterSupported()) {
    return "Bluetooth printing not supported in this browser (use Chrome on Android/desktop)";
  }
  if (state.connecting) return "Connecting…";
  if (thermalPrinterConnected()) return `Connected: ${state.printerName || "Printer"}`;
  return "Thermal printer not connected";
}

export function thermalConnectButtonLabel() {
  return thermalPrinterConnected() ? "Reconnect printer" : "Connect thermal printer";
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${line} ${words[i]}`;
    if (ctx.measureText(test).width <= maxWidth) line = test;
    else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

function buildBillPrintLines(bill: WhatsAppBillPayload, shopName?: string) {
  const name = String(shopName || "The Kilogram").trim() || "The Kilogram";
  const out: PrintRow[] = [];
  out.push({ text: name.toUpperCase(), align: "center", font: "title" });
  out.push({ text: "Customer Bill", align: "center", font: "title" });
  out.push({ text: "—".repeat(18), align: "center", font: "small" });
  out.push({ text: `Bill: ${bill.billNo || bill.billId || "—"}`, font: "small" });
  if (bill.customerName) out.push({ text: `Customer: ${bill.customerName}`, font: "small" });
  const when = new Date(bill.at || Date.now()).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
  out.push({ text: when, font: "small" });
  out.push({ text: "—".repeat(18), align: "center", font: "small" });

  for (const it of bill.items || []) {
    const qty = Number(it.qty) || 1;
    const amt = (Number(it.price) || 0) * qty;
    out.push({ text: `${qty} x ${it.name}`, font: "main" });
    out.push({ text: `   ${inr(amt)}`, font: "small" });
    if (it.note) out.push({ text: `   Note: ${it.note}`, font: "small" });
  }

  out.push({ text: "—".repeat(18), align: "center", font: "small" });
  if (bill.subtotal != null) out.push({ text: `Subtotal: ${inr(bill.subtotal)}`, font: "small" });
  if (bill.discount) out.push({ text: `Discount: -${inr(bill.discount)}`, font: "small" });
  if (bill.charges) out.push({ text: `Charges: ${inr(bill.charges)}`, font: "small" });
  out.push({ text: `TOTAL: ${inr(bill.grandTotal ?? bill.total ?? 0)}`, font: "main" });
  if (bill.paymentLabel) out.push({ text: `Paid: ${bill.paymentLabel}`, font: "small" });
  out.push({ text: "Thank you!", align: "center", font: "main" });
  return out;
}

function renderLinesCanvas(lines: PrintRow[]) {
  const padding = 14;
  const maxText = PRINT_WIDTH - padding * 2;
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Canvas not available");

  const expanded: PrintRow[] = [];
  for (const row of lines) {
    const font = row.font === "title" ? FONT_TITLE : row.font === "small" ? FONT_SMALL : FONT_MAIN;
    measure.font = font;
    const chunks = wrapLines(measure, row.text, maxText);
    chunks.forEach((t) => expanded.push({ ...row, text: t }));
  }

  const lineH = 28;
  const height = padding * 2 + expanded.length * lineH + 20;
  const canvas = document.createElement("canvas");
  canvas.width = PRINT_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PRINT_WIDTH, height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  let y = padding;
  for (const row of expanded) {
    const font = row.font === "title" ? FONT_TITLE : row.font === "small" ? FONT_SMALL : FONT_MAIN;
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

function canvasToEscPosRaster(canvas: HTMLCanvasElement) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
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

  const init = Uint8Array.from([0x1b, 0x40]);
  const img = new Uint8Array(8 + raster.length);
  img.set([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH], 0);
  img.set(raster, 8);
  const feed = Uint8Array.from([0x1b, 0x64, 0x04]);
  const cut = Uint8Array.from([0x1d, 0x56, 0x42, 0x00]);

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

async function findWritableCharacteristic(server: BleGattServer) {
  const services = await server.getPrimaryServices();
  for (const service of services) {
    let chars: BleCharacteristic[] = [];
    try {
      chars = await service.getCharacteristics();
    } catch {
      continue;
    }
    for (const ch of chars) {
      const p = ch.properties;
      if (p.writeWithoutResponse || p.write) return ch;
    }
  }
  return null;
}

async function writeRaw(buffer: Uint8Array) {
  if (!state.characteristic) throw new Error("Printer not connected");
  const chunk = 180;
  for (let i = 0; i < buffer.length; i += chunk) {
    const slice = buffer.slice(i, i + chunk);
    if (state.characteristic.properties.writeWithoutResponse) {
      await state.characteristic.writeValueWithoutResponse(slice);
    } else {
      await state.characteristic.writeValue(slice);
    }
    await new Promise((r) => window.setTimeout(r, 12));
  }
}

async function attachDevice(device: BleDevice) {
  state.device = device;
  state.printerName = device.name || "Bluetooth printer";
  device.addEventListener("gattserverdisconnected", () => {
    state.characteristic = null;
  });
  if (!device.gatt) throw new Error("GATT not available on device");
  const server = await device.gatt.connect();
  state.characteristic = await findWritableCharacteristic(server);
  if (!state.characteristic) {
    await device.gatt.disconnect();
    throw new Error("No writable print channel found on this device");
  }
  try {
    localStorage.setItem(STORAGE_KEY, device.id);
  } catch {
    /* ignore */
  }
  return true;
}

export async function connectThermalPrinter() {
  const bt = navBluetooth();
  if (!bt?.requestDevice) throw new Error("Use Chrome or Edge with Bluetooth enabled");
  state.connecting = true;
  try {
    const device = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_SERVICES
    });
    await attachDevice(device);
    return { success: true as const, name: state.printerName };
  } finally {
    state.connecting = false;
  }
}

export async function tryReconnectThermalPrinter() {
  const bt = navBluetooth();
  if (!bt || thermalPrinterConnected()) return false;
  let savedId = "";
  try {
    savedId = localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return false;
  }
  if (!savedId || !bt.getDevices) return false;
  try {
    const devices = await bt.getDevices();
    const device = devices.find((d) => d.id === savedId);
    if (!device) return false;
    await attachDevice(device);
    return true;
  } catch {
    return false;
  }
}

export async function disconnectThermalPrinter() {
  try {
    if (state.device?.gatt?.connected) await state.device.gatt.disconnect();
  } catch {
    /* ignore */
  }
  state.device = null;
  state.characteristic = null;
}

export async function printLastBillThermal(bill: WhatsAppBillPayload, shopName?: string) {
  if (!bill.items?.length) throw new Error("No bill to print");
  const lines = buildBillPrintLines(bill, shopName);
  const canvas = renderLinesCanvas(lines);
  const escpos = canvasToEscPosRaster(canvas);
  await writeRaw(escpos);
  return { success: true as const };
}