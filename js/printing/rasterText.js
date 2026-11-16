/**
 * Devanagari/Hindi → ESC/POS raster (GS v 0).
 * Refactored from thermalPrinter.js canvas approach.
 */
(function (root) {
  "use strict";

  const FONTS = {
    title: '800 26px "Noto Sans Devanagari", "Nirmala UI", "Mangal", sans-serif',
    main: '700 22px "Noto Sans Devanagari", "Nirmala UI", "Mangal", sans-serif',
    small: '400 18px "Noto Sans Devanagari", "Nirmala UI", "Mangal", sans-serif'
  };

  function dotsForWidthMm(mm) {
    // ~203 dpi: 58mm≈384, 80mm≈576
    return mm >= 72 ? 576 : 384;
  }

  async function loadFonts() {
    if (typeof document === "undefined" || !document.fonts) return;
    try {
      await Promise.all([
        document.fonts.load(FONTS.title),
        document.fonts.load(FONTS.main),
        document.fonts.load(FONTS.small)
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

  /**
   * @param {Array<{text:string, align?:string, font?:string}>} lines
   * @param {number} widthDots
   * @returns {{ widthBytes:number, height:number, data:Uint8Array, header:Uint8Array, full:Uint8Array }}
   */
  async function renderLinesToRaster(lines, widthDots) {
    const escpos = root.KG && root.KG.escpos;
    if (!escpos) throw new Error("KG.escpos required");
    if (typeof document === "undefined") {
      // Node/test stub: empty raster with correct header dims
      const widthBytes = Math.ceil(widthDots / 8);
      const height = Math.max(1, (lines || []).length * 24);
      const data = new Uint8Array(widthBytes * height);
      const header = escpos.rasterHeader(widthBytes, height);
      return { widthBytes, height, data, header, full: escpos.concat([header, data]) };
    }

    await loadFonts();
    const width = widthDots || 384;
    const padding = 14;
    const maxText = width - padding * 2;
    const measure = document.createElement("canvas").getContext("2d");

    const expanded = [];
    for (const row of lines || []) {
      const font = FONTS[row.font] || FONTS.main;
      measure.font = font;
      const wrapped = wrapLines(measure, row.text, maxText);
      wrapped.forEach((t) => expanded.push({ text: t, align: row.align || "left", font }));
    }

    const lineH = 28;
    const height = Math.max(lineH, expanded.length * lineH + padding * 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#000";
    ctx.textBaseline = "top";

    let y = padding;
    expanded.forEach((row) => {
      ctx.font = row.font;
      const tw = ctx.measureText(row.text).width;
      let x = padding;
      if (row.align === "center") x = Math.max(padding, (width - tw) / 2);
      if (row.align === "right") x = Math.max(padding, width - padding - tw);
      ctx.fillText(row.text, x, y);
      y += lineH;
    });

    return canvasToRaster(canvas, escpos);
  }

  function canvasToRaster(canvas, escpos) {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, width, height).data;
    const widthBytes = Math.ceil(width / 8);
    const data = new Uint8Array(widthBytes * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = img[i];
        const g = img[i + 1];
        const b = img[i + 2];
        const a = img[i + 3];
        const lum = (r + g + b) / 3;
        const black = a > 128 && lum < 180;
        if (black) {
          const byteIndex = y * widthBytes + (x >> 3);
          data[byteIndex] |= 0x80 >> (x & 7);
        }
      }
    }

    const header = escpos.rasterHeader(widthBytes, height);
    return {
      widthBytes,
      height,
      data,
      header,
      full: escpos.concat([header, data])
    };
  }

  const api = {
    FONTS,
    dotsForWidthMm,
    renderLinesToRaster,
    canvasToRaster,
    loadFonts
  };

  root.KG = root.KG || {};
  root.KG.rasterText = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
