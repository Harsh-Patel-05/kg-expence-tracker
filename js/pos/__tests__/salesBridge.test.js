const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const bridge = require("../salesBridge.js");

describe("salesBridge.js", () => {
  it("maps bill to sale fields", () => {
    const sale = bridge.mapBillToSale({
      billId: "bill_1",
      billNo: "KG-20260101-0001",
      cashAmount: 100,
      otherOnlineAmount: 50,
      swiggyAmount: 20,
      zomatoAmount: 30,
      totalAmount: 200,
      orderType: "takeaway",
      itemsCount: 3,
      date: "2026-01-01"
    });
    assert.equal(sale.source, "pos");
    assert.equal(sale.billId, "bill_1");
    assert.equal(sale.cashAmount, 100);
    assert.equal(sale.swiggyAmount, 20);
    assert.equal(sale.zomatoAmount, 30);
    assert.equal(sale.otherOnlineAmount, 50);
    assert.equal(sale.onlineAmount, 100);
    assert.equal(sale.method, "mixed");
  });

  it("aggregate increments and void reverse", () => {
    const sale = {
      cashAmount: 100,
      otherOnlineAmount: 40,
      swiggyAmount: 10,
      zomatoAmount: 0,
      totalAmount: 150,
      discountTotal: 5,
      taxTotal: 7,
      status: "settled"
    };
    const up = bridge.aggregateIncrements(sale);
    assert.equal(up.totalSales, 150);
    assert.equal(up.cashSales, 100);
    assert.equal(up.onlineSales, 40);
    assert.equal(up.swiggySales, 10);
    assert.equal(up.billCount, 1);
    const down = bridge.aggregateIncrements({ ...sale, status: "void" });
    assert.equal(down.totalSales, -150);
    assert.equal(down.billCount, -1);
  });

  it("business date respects cut-off hour conceptually", () => {
    // 03:00 IST on Jan 2 should map to Jan 1 with cut-off 4
    // Construct a Date that is 03:00 IST
    const utc = Date.UTC(2026, 0, 1, 21, 30, 0); // 03:00 IST Jan 2
    const d = new Date(utc);
    const iso = bridge.businessDateISO(d, 4);
    assert.equal(iso, "2026-01-01");
  });
});
