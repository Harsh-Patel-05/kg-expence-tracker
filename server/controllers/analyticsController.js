const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Expense = require("../models/Expense");
const Salary = require("../models/Salary");
const Advance = require("../models/Advance");
const { keyByRange, getBuckets } = require("../utils/analyticsHelpers");

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function saleValue(sale) {
  // New schema stores totalAmount; legacy uses amount
  return sale && sale.totalAmount !== undefined ? num(sale.totalAmount) : num(sale?.amount);
}

function saleCashOnline(sale) {
  const cash = sale && sale.cashAmount !== undefined ? num(sale.cashAmount) : sale?.method === "cash" ? num(sale?.amount) : 0;
  const online =
    sale && sale.onlineAmount !== undefined
      ? num(sale.onlineAmount)
      : sale?.method === "online"
        ? num(sale?.amount)
        : 0;
  return { cash, online };
}

/**
 * GET /api/analytics?type=daily|weekly|monthly
 */
async function getAnalytics(req, res) {
  const type = req.query.type || "monthly";
  const mode = type === "daily" ? "day" : type === "weekly" ? "week" : "month";

  try {
    const userId = req.user.id;
    const [sales, purchases, expenses, salaries, advances] = await Promise.all([
      Sale.find({ userId }),
      Purchase.find({ userId }),
      Expense.find({ userId }),
      Salary.find({ userId }),
      Advance.find({ userId })
    ]);

    const salesTotal = sales.reduce((s, x) => s + saleValue(x), 0);
    const paidPurchases = purchases.filter((x) => x.paidStatus === "paid").reduce((s, x) => s + num(x.price), 0);
    const paidBills = expenses.filter((x) => x.status === "paid").reduce((s, x) => s + num(x.amount), 0);

    const advByStaffMonth = {};
    advances.forEach((a) => {
      const k = `${a.month}::${a.name}`;
      advByStaffMonth[k] = num(advByStaffMonth[k]) + num(a.amount);
    });

    const paidSalaries = salaries
      .filter((x) => x.status === "paid")
      .reduce((s, sal) => {
        const k = `${sal.month}::${sal.name}`;
        const adv = num(advByStaffMonth[k]);
        return s + Math.max(0, num(sal.amount) - adv);
      }, 0);

    const totalExpenses = paidPurchases + paidBills + paidSalaries;
    const netProfit = salesTotal - totalExpenses;

    const buckets = getBuckets(mode);
    const sumSales = {};
    sales.forEach((x) => {
      const k = keyByRange(x.date, mode);
      if (k) sumSales[k] = num(sumSales[k]) + saleValue(x);
    });

    const sumExpenseParts = (p) => {
      const m = {};
      p.forEach((x) => {
        const k = keyByRange(x.date, mode);
        if (!k) return;
        let v = 0;
        if (x.price !== undefined) v = x.paidStatus === "paid" ? num(x.price) : 0;
        else if (x.amount !== undefined && x.status !== undefined) v = x.status === "paid" ? num(x.amount) : 0;
        m[k] = num(m[k]) + v;
      });
      return m;
    };

    const purMap = sumExpenseParts(purchases);
    const expMap = sumExpenseParts(expenses);

    const salRows = salaries.filter((x) => x.status === "paid").map((sal) => {
      const k = `${sal.month}::${sal.name}`;
      const adv = num(advByStaffMonth[k]);
      const payable = Math.max(0, num(sal.amount) - adv);
      return { date: `${sal.month}-01`, value: payable };
    });
    const salMap = {};
    salRows.forEach((r) => {
      const k = keyByRange(r.date, mode);
      if (k) salMap[k] = num(salMap[k]) + num(r.value);
    });

    const series = buckets.map((b) => ({
      label: b.label,
      key: b.key,
      sales: num(sumSales[b.key]),
      expenses: num(purMap[b.key]) + num(expMap[b.key]) + num(salMap[b.key])
    }));

    return res.json({
      type,
      totalSales: salesTotal,
      totalExpenses,
      netProfit,
      breakdown: {
        paidPurchases,
        paidBills,
        paidSalariesNet: paidSalaries
      },
      charts: {
        salesVsExpenses: series
      },
      cashVsOnline: {
        cash: sales.reduce((s, x) => s + saleCashOnline(x).cash, 0),
        online: sales.reduce((s, x) => s + saleCashOnline(x).online, 0)
      },
      expenseBar: {
        Purchases: paidPurchases,
        Bills: paidBills,
        SalaryPayable: paidSalaries
      }
    });
  } catch (e) {
    return res.status(500).json({ message: "Analytics failed" });
  }
}

module.exports = { getAnalytics };
