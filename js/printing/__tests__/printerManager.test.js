const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

// Load deps into globalThis
require("../escpos.js");
require("../rasterText.js");
require("../../pos/money.js");
require("../../pos/posState.js");
const print = require("../printerManager.js");

describe("printerManager mock transport", () => {
  const writes = [];
  before(() => {
    print.setMockTransport({
      name: "mock",
      isConnected: () => true,
      write: async (u8) => {
        writes.push(u8);
      }
    });
  });

  it("queues printBill and sends bytes for Hindi sample", async () => {
    writes.length = 0;
    await print.printBill({
      billNo: "KG-TEST-0001",
      items: [{ name: "दाल फ्राई", nameHi: "दाल फ्राई", qty: 2, price: 80 }],
      subtotal: 160,
      gst: 8,
      grandTotal: 168,
      paymentLabel: "Cash",
      at: Date.now()
    });
    // allow queue microtask
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(writes.length >= 1, "expected mock write");
    assert.ok(writes[0].length > 10);
    assert.equal(writes[0][0], 0x1b); // ESC init
  });

  it("falls back when transport throws", async () => {
    print.setMockTransport({
      name: "mock",
      isConnected: () => true,
      write: async () => {
        throw new Error("busy");
      }
    });
    // browserPrint missing in node — job should retry then drop without throwing to caller
    await print.printKOT({
      billNo: "K1",
      items: [{ name: "रोटी", nameHi: "रोटी", qty: 1 }],
      at: Date.now()
    });
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(true);
  });
});
