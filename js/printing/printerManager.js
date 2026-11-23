/**
 * Single entry: printKOT, printBill, testPrint, openCashDrawer.
 * Queue + retry + transport fallback to browser print.
 */
(function (root) {
  "use strict";

  const PREF_KEY = "kg_printer_prefs_v1";
  const queue = [];
  let busy = false;
  let lastKOT = null;
  let lastBill = null;
  let mockTransport = null; // for tests

  function prefs() {
    try {
      return Object.assign(
        {
          paperWidthMm: 80,
          baudRate: 9600,
          autoCut: true,
          cashDrawer: false,
          kotTransport: "auto",
          billTransport: "auto",
          chunkSize: 512
        },
        JSON.parse(localStorage.getItem(PREF_KEY) || "{}")
      );
    } catch (_) {
      return { paperWidthMm: 80, baudRate: 9600, autoCut: true, cashDrawer: false, chunkSize: 512 };
    }
  }

  function savePrefs(patch) {
    const next = Object.assign(prefs(), patch || {});
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function transports() {
    return root.KG && root.KG.transports ? root.KG.transports : {};
  }

  function hardwareTransports() {
    const t = transports();
    return [t.webUsb, t.webSerial, t.bluetooth].filter(Boolean);
  }

  /** True when a real USB / Serial / Bluetooth printer is connected. */
  function hasHardwarePrinter() {
    if (mockTransport) return true;
    return hardwareTransports().some((tr) => tr.isConnected && tr.isConnected());
  }

  function pickConnected(preferred) {
    if (mockTransport) return mockTransport;
    const t = transports();
    // Never auto-pick browser/system print — it opens the PDF dialog.
    // Only use it when the user explicitly chooses "browser".
    const order =
      preferred === "usb"
        ? ["webUsb", "webSerial", "bluetooth"]
        : preferred === "serial"
          ? ["webSerial", "webUsb", "bluetooth"]
          : preferred === "bluetooth"
            ? ["bluetooth", "webSerial", "webUsb"]
            : preferred === "browser"
              ? ["browserPrint"]
              : ["webUsb", "webSerial", "bluetooth"];
    for (const name of order) {
      const tr = t[name];
      if (tr && tr.isConnected && tr.isConnected()) return tr;
    }
    if (preferred === "browser") return t.browserPrint || null;
    return null;
  }

  async function writeRaw(uint8, preferred) {
    const p = prefs();
    let tr = pickConnected(preferred);
    if (!tr || tr.name === "browser") throw new Error("NO_RAW_TRANSPORT");
    await tr.write(uint8, p.chunkSize || 512);
  }

  function looksLatin(s) {
    return /[A-Za-z]/.test(String(s || "")) && !/[\u0900-\u097F]/.test(String(s || ""));
  }

  function cleanVar(v) {
    const s = String(v || "").trim();
    return !s || /^default$/i.test(s) ? "" : s;
  }

  function stripTrailingSize(n) {
    return String(n || "")
      .replace(/\s*[·\-–—]\s*Default\s*$/i, "")
      .replace(/\s*\(\s*Default\s*\)\s*$/i, "")
      .replace(/\s*\(\s*\d+(?:\.\d+)?\s*(?:kg|g|gm|gms)\s*\)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sizeSuffix(name, variantLabel) {
    const v = cleanVar(variantLabel);
    if (!v) return "";
    const compact = (x) =>
      String(x || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/gms?/g, "g");
    if (compact(name).includes(compact(v))) return "";
    return v;
  }

  async function hindiTitle(it, helpers) {
    let hi = stripTrailingSize(it.nameHi || "");
    if (hi && !looksLatin(hi)) return hi;
    const en = stripTrailingSize(it.name || "");
    const translate = helpers && helpers.translateEnToHi;
    if (en && typeof translate === "function") {
      try {
        const t = await translate(en);
        if (t && String(t).trim()) return stripTrailingSize(t);
      } catch (_) {}
    }
    return hi || en;
  }

  async function buildKotBytes(ticket) {
    const escpos = root.KG.escpos;
    const raster = root.KG.rasterText;
    const width = raster.dotsForWidthMm(prefs().paperWidthMm || 80);
    const helpers = ticket.helpers || {};
    const lines = [];
    lines.push({ text: "THE KILOGRAM", align: "center", font: "title" });
    lines.push({ text: "किचन ऑर्डर टिकट", align: "center", font: "title" });
    lines.push({ text: `नंबर: ${ticket.kotNo || ticket.billNo || ""}`, align: "center", font: "small" });
    lines.push({
      text: "टेकअवे",
      align: "center",
      font: "small"
    });
    lines.push({
      text: new Date(ticket.at || Date.now()).toLocaleString("hi-IN"),
      align: "center",
      font: "small"
    });
    const items = ticket.items || [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const title = await hindiTitle(it, helpers);
      const sz = sizeSuffix(title, it.variantLabel || it.variant);
      const size = sz ? ` (${sz})` : "";
      lines.push({ text: `${i + 1}. ${title}${size}  ×${it.qty || 1}`, font: "main" });
      if (it.note) lines.push({ text: `   नोट: ${it.note}`, font: "small" });
    }
    lines.push({ text: "तत्काल तैयार करें", align: "center", font: "main" });

    const parts = [escpos.init(), escpos.align("left")];
    const rasterOut = await raster.renderLinesToRaster(lines, width);
    parts.push(rasterOut.full);
    parts.push(escpos.feed(3));
    if (prefs().autoCut) parts.push(escpos.cut());
    return escpos.concat(parts);
  }

  async function buildBillBytes(bill) {
    const escpos = root.KG.escpos;
    const raster = root.KG.rasterText;
    const money = root.KG.money;
    const width = raster.dotsForWidthMm(prefs().paperWidthMm || 80);
    const settings = (root.KG.posState && root.KG.posState.getState().settings) || {};
    const lines = [];
    lines.push({ text: "THE KILOGRAM", align: "center", font: "title" });
    if (settings.address) lines.push({ text: settings.address, align: "center", font: "small" });
    if (settings.gstin) lines.push({ text: `GSTIN: ${settings.gstin}`, align: "center", font: "small" });
    if (settings.phone) lines.push({ text: settings.phone, align: "center", font: "small" });
    lines.push({ text: `Bill ${bill.billNo || ""}`, align: "center", font: "main" });
    lines.push({
      text: new Date(bill.at || Date.now()).toLocaleString("en-IN"),
      align: "center",
      font: "small"
    });
    (bill.items || []).forEach((it) => {
      const amt = (Number(it.price) || 0) * (Number(it.qty) || 1);
      const en = stripTrailingSize(it.name || "");
      const sz = sizeSuffix(en, it.variantLabel || it.variant);
      const size = sz ? ` (${sz})` : "";
      lines.push({
        text: `${en}${size} x${it.qty}  ${money ? money.formatINR(amt) : amt}`,
        font: "small"
      });
    });
    lines.push({ text: `Subtotal: ${money.formatINR(bill.subtotal || 0)}`, font: "small" });
    if (bill.discount) lines.push({ text: `Discount: ${money.formatINR(bill.discount)}`, font: "small" });
    lines.push({ text: `TOTAL: ${money.formatINR(bill.grandTotal || bill.total || 0)}`, font: "title" });
    lines.push({ text: `Paid: ${bill.paymentLabel || ""}`, font: "small" });
    if (settings.upiId) {
      lines.push({ text: `UPI: ${settings.upiId}`, align: "center", font: "small" });
      lines.push({ text: "Scan UPI QR", align: "center", font: "small" });
    }
    lines.push({ text: "Thank you", align: "center", font: "main" });

    const parts = [escpos.init()];
    const rasterOut = await raster.renderLinesToRaster(lines, width);
    parts.push(rasterOut.full);
    // Optional UPI QR raster (best-effort; browser print always includes img)
    try {
      const upi = root.KG && root.KG.upiQr;
      if (upi && settings.upiId) {
        const uri = upi.buildUpiUri({
          upiId: settings.upiId,
          amount: bill.grandTotal || bill.total || 0,
          billNo: bill.billNo,
          payeeName: "The Kilogram"
        });
        if (uri && typeof document !== "undefined") {
          const canvas = await upi.drawQrToCanvas(uri, 180);
          if (canvas) {
            const qrRaster = raster.canvasToRaster(canvas, escpos);
            parts.push(escpos.align("center"));
            parts.push(qrRaster.full);
          }
        }
      }
    } catch (e) {
      console.warn("UPI QR raster skipped", e);
    }
    parts.push(escpos.feed(3));
    if (prefs().autoCut) parts.push(escpos.cut());
    if (prefs().cashDrawer) parts.push(escpos.drawerKick(0));
    return escpos.concat(parts);
  }

  function billHtml(bill) {
    const bp = transports().browserPrint;
    const esc = bp ? bp.escapeHtml.bind(bp) : (s) => s;
    const money = root.KG.money;
    const settings = (root.KG.posState && root.KG.posState.getState().settings) || {};
    const rows = (bill.items || [])
      .map((it) => {
        const amt = (Number(it.price) || 0) * (Number(it.qty) || 1);
        const en = stripTrailingSize(it.name || "");
        const sz = sizeSuffix(en, it.variantLabel || it.variant);
        const size = sz ? ` (${esc(sz)})` : "";
        return `<div class="row"><span>${esc(en)}${size} ×${it.qty}</span><span>${esc(
          money.formatINR(amt)
        )}</span></div>`;
      })
      .join("");
    return `<div class="c lg">THE KILOGRAM</div>
      <div class="c">${esc(settings.address || "")}</div>
      <hr/>
      <div class="c b">Bill ${esc(bill.billNo || "")}</div>
      <div class="c">${esc(new Date(bill.at || Date.now()).toLocaleString("en-IN"))}</div>
      <hr/>${rows}<hr/>
      <div class="row"><span>Subtotal</span><span>${esc(money.formatINR(bill.subtotal || 0))}</span></div>
      ${
        bill.discount
          ? `<div class="row"><span>Discount</span><span>${esc(money.formatINR(bill.discount))}</span></div>`
          : ""
      }
      <div class="row lg"><span>TOTAL</span><span>${esc(
        money.formatINR(bill.grandTotal || bill.total || 0)
      )}</span></div>
      <div class="c">${esc(bill.paymentLabel || "")}</div>
      ${(() => {
        const upi = root.KG && root.KG.upiQr;
        if (!upi || !settings.upiId) return "";
        const uri = upi.buildUpiUri({
          upiId: settings.upiId,
          amount: bill.grandTotal || bill.total || 0,
          billNo: bill.billNo,
          payeeName: "The Kilogram"
        });
        if (!uri) return "";
        return `<div class="c" style="margin-top:8px;">Pay via UPI<br/><img alt="UPI QR" width="140" height="140" src="${esc(
          upi.qrImageUrl(uri, 140)
        )}"/><div style="font-size:10px;word-break:break-all;">${esc(settings.upiId)}</div></div>`;
      })()}
      <div class="c">Thank you</div>`;
  }

  async function kotHtml(ticket) {
    const bp = transports().browserPrint;
    const esc = bp ? bp.escapeHtml.bind(bp) : (s) => s;
    const helpers = ticket.helpers || {};
    const parts = [];
    for (const it of ticket.items || []) {
      const title = await hindiTitle(it, helpers);
      const sz = sizeSuffix(title, it.variantLabel || it.variant);
      const size = sz ? ` (${sz})` : "";
      parts.push(
        `<div class="lg">${esc(title)}${esc(size)} ×${it.qty}</div>${
          it.note ? `<div>नोट: ${esc(it.note)}</div>` : ""
        }`
      );
    }
    return `<div class="c lg">THE KILOGRAM</div>
      <div class="c b">किचन ऑर्डर टिकट</div>
      <div class="c">नंबर ${esc(ticket.kotNo || ticket.billNo || "")}</div>
      <div class="c">टेकअवे</div>
      <hr/>${parts.join("")}<hr/><div class="c">तत्काल तैयार करें</div>`;
  }

  async function processQueue() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        const job = queue[0];
        try {
          await job.run();
          queue.shift();
        } catch (e) {
          job.retries = (job.retries || 0) + 1;
          if (job.retries > 3) {
            console.error("print job failed", e);
            queue.shift();
            if (job.onFail) job.onFail(e);
          } else {
            await new Promise((r) => setTimeout(r, 400 * job.retries));
          }
        }
      }
    } finally {
      busy = false;
    }
  }

  function enqueue(run, meta) {
    queue.push({ run, retries: 0, meta });
    processQueue();
  }

  async function printKOT(ticket) {
    lastKOT = ticket;
    const p = prefs();
    // Skip when no hardware — avoid system PDF popup
    if (p.kotTransport !== "browser" && !hasHardwarePrinter()) {
      console.info("KOT skipped — no hardware printer connected");
      return;
    }
    enqueue(async () => {
      const ble = transports().bluetooth;
      if (ble && ble.isConnected && ble.isConnected() && ticket.cart && ble.printKOTFromCart) {
        await ble.printKOTFromCart(ticket.cart, ticket.helpers || {});
        return;
      }
      try {
        const bytes = await buildKotBytes(ticket);
        await writeRaw(bytes, p.kotTransport);
      } catch (e) {
        if (p.kotTransport === "browser") {
          const bp = transports().browserPrint;
          if (bp) await bp.printHtml(await kotHtml(ticket), { paperWidthMm: p.paperWidthMm });
          return;
        }
        console.warn("KOT print failed (no browser fallback)", e);
      }
    }, { type: "kot" });
  }

  async function printBill(bill) {
    lastBill = bill;
    const p = prefs();
    if (p.billTransport !== "browser" && !hasHardwarePrinter()) {
      console.info("Bill print skipped — no hardware printer connected");
      return;
    }
    enqueue(async () => {
      try {
        const bytes = await buildBillBytes(bill);
        await writeRaw(bytes, p.billTransport);
      } catch (e) {
        if (p.billTransport === "browser") {
          const bp = transports().browserPrint;
          if (bp) await bp.printHtml(billHtml(bill), { paperWidthMm: p.paperWidthMm });
          return;
        }
        console.warn("Bill print failed (no browser fallback)", e);
      }
    }, { type: "bill" });
  }

  async function testPrint() {
    await printBill({
      billNo: "TEST",
      at: Date.now(),
      items: [{ name: "टेस्ट आइटम / Test", qty: 1, price: 1 }],
      subtotal: 1,
      gst: 0,
      grandTotal: 1,
      paymentLabel: "TEST"
    });
  }

  async function openCashDrawer() {
    const escpos = root.KG.escpos;
    try {
      await writeRaw(escpos.concat([escpos.init(), escpos.drawerKick(0)]), prefs().billTransport);
    } catch (e) {
      throw new Error("Cash drawer requires USB/Serial printer connection");
    }
  }

  async function autoReconnect() {
    const t = transports();
    const results = {};
    if (t.webUsb) results.usb = await t.webUsb.tryReconnect();
    if (t.webSerial) results.serial = await t.webSerial.tryReconnect(prefs());
    if (t.bluetooth) results.bluetooth = await t.bluetooth.tryReconnect();
    return results;
  }

  const api = {
    prefs,
    savePrefs,
    hasHardwarePrinter,
    printKOT,
    printBill,
    testPrint,
    openCashDrawer,
    autoReconnect,
    reprintLastKOT() {
      if (lastKOT) return printKOT(lastKOT);
    },
    reprintLastBill() {
      if (lastBill) return printBill(lastBill);
    },
    getLastKOT: () => lastKOT,
    getLastBill: () => lastBill,
    /** Test hook */
    setMockTransport(tr) {
      mockTransport = tr;
    },
    _buildKotBytes: buildKotBytes,
    _buildBillBytes: buildBillBytes,
    queueLength: () => queue.length
  };

  root.KG = root.KG || {};
  root.KG.print = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
