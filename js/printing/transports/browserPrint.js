/** System printer fallback via hidden iframe + @media print (58/80mm). */
(function (root) {
  "use strict";

  function isSupported() {
    return typeof document !== "undefined" && typeof window !== "undefined";
  }

  function isConnected() {
    return isSupported();
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * @param {string} htmlBody inner HTML
   * @param {{ paperWidthMm?: number }} opts
   */
  async function printHtml(htmlBody, opts) {
    const mm = (opts && opts.paperWidthMm) || 80;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page { size: ${mm}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; width: ${mm}mm; }
  body {
    font-family: "Noto Sans Devanagari", "Nirmala UI", Mangal, monospace;
    font-size: 12px; color: #000; background: #fff;
    padding: 4mm 3mm;
  }
  .c { text-align: center; }
  .b { font-weight: 800; }
  .lg { font-size: 15px; font-weight: 800; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
</style></head><body>${htmlBody}</body></html>`);
    doc.close();
    await new Promise((r) => setTimeout(r, 120));
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => iframe.remove(), 800);
    }
  }

  /** Accepts ESC/POS bytes — ignored; callers should use printHtml for this transport. */
  async function write() {
    throw new Error("browserPrint uses printHtml(), not raw bytes");
  }

  async function connect() {
    return true;
  }
  async function tryReconnect() {
    return true;
  }
  async function disconnect() {}

  const api = {
    isSupported,
    isConnected,
    connect,
    tryReconnect,
    write,
    disconnect,
    printHtml,
    escapeHtml,
    name: "browser"
  };
  root.KG = root.KG || {};
  root.KG.transports = root.KG.transports || {};
  root.KG.transports.browserPrint = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
