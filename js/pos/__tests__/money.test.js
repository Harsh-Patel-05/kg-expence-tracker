const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const money = require("../money.js");

describe("money.js", () => {
  it("converts rupees to paise safely", () => {
    assert.equal(money.toPaise(10.5), 1050);
    assert.equal(money.toPaise("12.345"), 1235);
    assert.equal(money.fromPaise(199), 1.99);
  });

  it("computes GST exclusive with discount %", () => {
    const r = money.computeBill({
      subtotalPaise: 10000,
      discountPercent: 10,
      gstPercent: 5,
      gstEnabled: true,
      gstInclusive: false,
      roundOff: false
    });
    assert.equal(r.discountPaise, 1000);
    assert.equal(r.gstPaise, 450); // 5% of 9000
    assert.equal(r.grandPaise, 9450);
    assert.equal(r.netRevenuePaise, 9000);
  });

  it("computes GST inclusive", () => {
    const r = money.computeBill({
      subtotalPaise: 10500,
      gstPercent: 5,
      gstEnabled: true,
      gstInclusive: true,
      roundOff: false
    });
    assert.equal(r.grandPaise, 10500);
    assert.equal(r.netRevenuePaise + r.gstPaise, 10500);
  });

  it("round-off to nearest rupee", () => {
    const r = money.computeBill({
      subtotalPaise: 10001,
      gstEnabled: false,
      roundOff: true
    });
    assert.equal(r.grandPaise % 100, 0);
  });

  it("validates split payments", () => {
    const ok = money.validateSplit(10000, {
      cashPaise: 4000,
      onlinePaise: 3000,
      swiggyPaise: 2000,
      zomatoPaise: 1000
    });
    assert.equal(ok.ok, true);
    const bad = money.validateSplit(10000, { cashPaise: 1000, onlinePaise: 0, swiggyPaise: 0, zomatoPaise: 0 });
    assert.equal(bad.ok, false);
  });

  it("change due", () => {
    assert.equal(money.changeDue(10000, 15000), 5000);
    assert.equal(money.changeDue(10000, 8000), 0);
  });
});
