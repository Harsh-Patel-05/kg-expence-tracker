const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const escpos = require("../escpos.js");
const raster = require("../rasterText.js");

describe("escpos.js", () => {
  it("builds init/cut/feed/align/drawer bytes", () => {
    assert.deepEqual([...escpos.init()], [0x1b, 0x40]);
    assert.deepEqual([...escpos.align("center")], [0x1b, 0x61, 1]);
    assert.deepEqual([...escpos.feed(3)], [0x1b, 0x64, 3]);
    assert.deepEqual([...escpos.cut()], [0x1d, 0x56, 0]);
    assert.deepEqual([...escpos.drawerKick(0)], [0x1b, 0x70, 0, 0x19, 0x19]);
  });

  it("raster header dimensions", () => {
    const h = escpos.rasterHeader(48, 100);
    assert.equal(h[0], 0x1d);
    assert.equal(h[1], 0x76);
    assert.equal(h[4], 48); // xL
    assert.equal(h[6], 100); // yL
  });
});

describe("rasterText.js", () => {
  it("dots for paper widths", () => {
    assert.equal(raster.dotsForWidthMm(58), 384);
    assert.equal(raster.dotsForWidthMm(80), 576);
  });

  it("produces raster with correct widthBytes for 58 and 80mm", async () => {
    const lines = [{ text: "नमस्ते TEST", align: "center", font: "main" }];
    const r58 = await raster.renderLinesToRaster(lines, 384);
    assert.equal(r58.widthBytes, Math.ceil(384 / 8));
    assert.ok(r58.height >= 1);
    assert.ok(r58.full.length > r58.header.length);

    const r80 = await raster.renderLinesToRaster(lines, 576);
    assert.equal(r80.widthBytes, Math.ceil(576 / 8));
  });
});
