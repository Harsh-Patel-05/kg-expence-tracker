const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const finance = require("../netMargin.js");

describe("netMargin.js", () => {
  it("allocates fixed costs across month days including Feb leap year", () => {
    const leap = finance.allocateFixedCosts(
      [{ name: "Rent", amount: 2900, month: "2024-02", recurring: false }],
      "2024-02-01",
      "2024-02-29"
    );
    assert.ok(Math.abs(leap.total - 2900) < 0.01);
    assert.equal(Object.keys(leap.byDay).length, 29);

    const partial = finance.allocateFixedCosts(
      [{ name: "Rent", amount: 3100, month: "2025-01", recurring: true }],
      "2025-01-01",
      "2025-01-10"
    );
    assert.ok(Math.abs(partial.total - 1000) < 0.02); // 3100/31 * 10
  });

  it("daysInMonth handles 28/29/30/31", () => {
    assert.equal(finance.daysInMonth(2023, 1), 28);
    assert.equal(finance.daysInMonth(2024, 1), 29);
    assert.equal(finance.daysInMonth(2025, 3), 30);
    assert.equal(finance.daysInMonth(2025, 0), 31);
  });

  it("computes net margin with GST exclusion and commissions", () => {
    const result = finance.computeNetMargin({
      fromISO: "2025-01-01",
      toISO: "2025-01-02",
      sales: [
        {
          date: "2025-01-01",
          totalAmount: 1050,
          discountTotal: 0,
          taxTotal: 50,
          cashAmount: 1050,
          swiggyAmount: 0,
          zomatoAmount: 0,
          otherOnlineAmount: 0
        },
        {
          date: "2025-01-02",
          totalAmount: 500,
          taxTotal: 0,
          swiggyAmount: 500,
          cashAmount: 0,
          otherOnlineAmount: 0,
          zomatoAmount: 0
        }
      ],
      expenses: [{ date: "2025-01-01", amount: 100, status: "paid", category: "gas" }],
      purchases: [{ date: "2025-01-01", price: 200, paidStatus: "paid" }],
      supplierPayments: [],
      fixedSalaries: [{ name: "Ram", amount: 30000 }],
      attendance: [
        { date: "2025-01-01", name: "Ram", status: "present" },
        { date: "2025-01-02", name: "Ram", status: "half-day" }
      ],
      advances: [{ name: "Ram", month: "2025-01", amount: 5000 }],
      fixedCosts: [{ name: "Rent", amount: 3100, month: "2025-01", recurring: true }],
      settings: { swiggyCommissionPct: 20, zomatoCommissionPct: 20, gatewayChargePct: 0 }
    });
    // Net revenue = (1050-50) + 500 = 1500
    assert.equal(result.netRevenue, 1500);
    assert.equal(result.cogs, 200);
    assert.equal(result.dailyExpenses, 100);
    // Staff: 1000/day * 1 + 500 = 1500 for 2 days (30000/30=1000)
    assert.equal(result.staffCost, 1500);
    assert.ok(result.staffNote.includes("Advances"));
    assert.ok(Math.abs(result.platformCommission - 100) < 0.01); // 20% of 500
    assert.ok(result.netMarginPct !== null);
  });

  it("guards divide-by-zero", () => {
    const result = finance.computeNetMargin({
      fromISO: "2025-03-01",
      toISO: "2025-03-01",
      sales: [],
      expenses: [],
      purchases: [],
      fixedCosts: [],
      fixedSalaries: [],
      attendance: []
    });
    assert.equal(result.netMarginPct, null);
    assert.equal(result.netProfit, 0);
  });

  it("negative profit when costs exceed revenue", () => {
    const result = finance.computeNetMargin({
      fromISO: "2025-03-01",
      toISO: "2025-03-01",
      sales: [{ date: "2025-03-01", totalAmount: 100, taxTotal: 0 }],
      expenses: [{ date: "2025-03-01", amount: 500, status: "paid" }],
      purchases: [],
      fixedCosts: [],
      fixedSalaries: [],
      attendance: []
    });
    assert.ok(result.netProfit < 0);
  });
});
