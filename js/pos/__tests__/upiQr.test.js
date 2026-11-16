const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const upi = require("../upiQr.js");

describe("upiQr.js", () => {
  it("builds upi://pay URI", () => {
    const uri = upi.buildUpiUri({
      upiId: "kilogram@upi",
      amount: 250.5,
      billNo: "KG-20260101-0001",
      payeeName: "The Kilogram"
    });
    assert.ok(uri.startsWith("upi://pay?"));
    assert.ok(uri.includes("pa=kilogram%40upi") || uri.includes("pa=kilogram@upi"));
    assert.ok(uri.includes("am=250.50"));
    assert.ok(uri.includes("cu=INR"));
  });

  it("returns empty without upiId", () => {
    assert.equal(upi.buildUpiUri({ amount: 10 }), "");
  });

  it("builds qr image url", () => {
    const url = upi.qrImageUrl("upi://pay?pa=x@y&am=1.00", 120);
    assert.ok(url.includes("api.qrserver.com"));
    assert.ok(url.includes("120x120"));
  });
});
