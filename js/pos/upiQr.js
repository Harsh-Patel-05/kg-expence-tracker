/**
 * UPI QR helpers for bills — upi://pay payload + canvas/img for print.
 */
(function (root) {
  "use strict";

  function buildUpiUri(opts) {
    const o = opts || {};
    const pa = String(o.upiId || "").trim();
    if (!pa) return "";
    const params = new URLSearchParams();
    params.set("pa", pa);
    params.set("pn", o.payeeName || "The Kilogram");
    params.set("am", String(Number(o.amount || 0).toFixed(2)));
    params.set("cu", "INR");
    if (o.billNo) params.set("tn", `Bill ${o.billNo}`);
    return `upi://pay?${params.toString()}`;
  }

  /** Browser-print friendly QR image URL (no extra dependency). */
  function qrImageUrl(data, size) {
    const s = size || 160;
    return `https://api.qrserver.com/v1/create-qr-code/?size=${s}x${s}&data=${encodeURIComponent(data)}`;
  }

  async function drawQrToCanvas(data, size) {
    if (typeof document === "undefined") return null;
    const s = size || 180;
    const url = qrImageUrl(data, s);
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, s, s);
    ctx.drawImage(img, 0, 0, s, s);
    return canvas;
  }

  const api = { buildUpiUri, qrImageUrl, drawQrToCanvas };
  root.KG = root.KG || {};
  root.KG.upiQr = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
