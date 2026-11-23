/**
 * ESC/POS command builder (bytes).
 */
(function (root) {
  "use strict";

  const ESC = 0x1b;
  const GS = 0x1d;
  const FS = 0x1c;

  function bytes(...parts) {
    const out = [];
    parts.forEach((p) => {
      if (p == null) return;
      if (typeof p === "number") out.push(p & 0xff);
      else if (typeof p === "string") {
        for (let i = 0; i < p.length; i++) out.push(p.charCodeAt(i) & 0xff);
      } else if (p instanceof Uint8Array || Array.isArray(p)) {
        for (let i = 0; i < p.length; i++) out.push(p[i] & 0xff);
      }
    });
    return new Uint8Array(out);
  }

  function concat(arrays) {
    let len = 0;
    arrays.forEach((a) => (len += a.length));
    const out = new Uint8Array(len);
    let off = 0;
    arrays.forEach((a) => {
      out.set(a, off);
      off += a.length;
    });
    return out;
  }

  const api = {
    ESC,
    GS,
    FS,
    bytes,
    concat,
    init() {
      return bytes(ESC, "@");
    },
    align(mode) {
      // 0 left, 1 center, 2 right
      const m = mode === "center" ? 1 : mode === "right" ? 2 : 0;
      return bytes(ESC, "a", m);
    },
    bold(on) {
      return bytes(ESC, "E", on ? 1 : 0);
    },
    doubleSize(on) {
      return bytes(GS, "!", on ? 0x11 : 0x00);
    },
    feed(n) {
      return bytes(ESC, "d", Math.max(0, Math.min(255, n || 1)));
    },
    cut(partial) {
      return bytes(GS, "V", partial ? 1 : 0);
    },
    /** Cash drawer kick ESC p m t1 t2 */
    drawerKick(pin) {
      const m = pin === 1 ? 1 : 0;
      return bytes(ESC, "p", m, 0x19, 0x19);
    },
    textLine(str) {
      // ASCII-safe line; Hindi must use raster
      const s = String(str || "") + "\n";
      return bytes(s);
    },
    /**
     * GS v 0 raster bit image header + data
     * widthBytes = ceil(widthDots/8), height = rows
     */
    rasterHeader(widthBytes, height) {
      const xL = widthBytes & 0xff;
      const xH = (widthBytes >> 8) & 0xff;
      const yL = height & 0xff;
      const yH = (height >> 8) & 0xff;
      return bytes(GS, "v", 0, 0, xL, xH, yL, yH);
    }
  };

  root.KG = root.KG || {};
  root.KG.escpos = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
