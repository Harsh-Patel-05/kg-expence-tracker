/** Shared cash/bank balance math (operational + transfers). Used by app.js and Firestore transactions. */
(function () {
  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function saleAmounts(s) {
    if (
      s &&
      (s.cashAmount !== undefined ||
        s.onlineAmount !== undefined ||
        s.swiggyAmount !== undefined ||
        s.zomatoAmount !== undefined ||
        s.otherOnlineAmount !== undefined ||
        s.totalAmount !== undefined)
    ) {
      const cash = num(s.cashAmount);
      const swiggy = num(s.swiggyAmount);
      const zomato = num(s.zomatoAmount);
      const otherOnline = num(s.otherOnlineAmount);
      const legacyOnline = num(s.onlineAmount);
      let online;
      if (legacyOnline > 0 && swiggy === 0 && zomato === 0 && otherOnline === 0) online = legacyOnline;
      else online = swiggy + zomato + otherOnline;
      return { cash, online };
    }
    const amt = num(s?.amount);
    const m = String(s?.method || "").toLowerCase();
    return { cash: m === "cash" ? amt : 0, online: m && m !== "cash" ? amt : 0 };
  }

  function salaryAdvanceFor(advances, name, month) {
    return (advances || [])
      .filter((x) => x.name === name && x.month === month)
      .reduce((sum, x) => sum + num(x.amount), 0);
  }

  function payableForSalary(salaries, advances, sal) {
    return num(sal.amount) - salaryAdvanceFor(advances, sal.name, sal.month);
  }

  function applyBalanceTransfers(cashBalance, bankBalance, transfers) {
    let cash = cashBalance;
    let bank = bankBalance;
    (transfers || []).forEach((t) => {
      const amt = num(t.amount);
      if (!(amt > 0)) return;
      const from = String(t.fromAccount || "").toLowerCase();
      const to = String(t.toAccount || "").toLowerCase();
      if (from === "cash" && to === "bank") {
        cash -= amt;
        bank += amt;
      } else if (from === "bank" && to === "cash") {
        bank -= amt;
        cash += amt;
      }
    });
    return { cashBalance: cash, bankBalance: bank };
  }

  function computeOperationalBalances(data) {
    const sales = data.sales || [];
    const purchases = data.purchases || [];
    const expenses = data.expenses || [];
    const salaries = data.salaries || [];
    const advances = data.advances || [];
    const supplierPayments = data.supplierPayments || [];

    const salesAmounts = sales.map((s) => ({ amounts: saleAmounts(s) }));
    const cashIn = salesAmounts.reduce((sum, { amounts }) => sum + amounts.cash, 0);
    const bankIn = salesAmounts.reduce((sum, { amounts }) => sum + amounts.online, 0);

    const paidSupplierCash = purchases
      .filter((p) => p.paidStatus === "paid" && (p.paymentMethod || "cash") !== "online")
      .reduce((sum, p) => sum + num(p.price), 0);
    const paidSupplierBank = purchases
      .filter((p) => p.paidStatus === "paid" && (p.paymentMethod || "cash") === "online")
      .reduce((sum, p) => sum + num(p.price), 0);
    const paidBillsCash = expenses
      .filter((e) => e.status === "paid" && (e.paymentMethod || "cash") !== "online")
      .reduce((sum, e) => sum + num(e.amount), 0);
    const paidBillsOnline = expenses
      .filter((e) => e.status === "paid" && (e.paymentMethod || "cash") === "online")
      .reduce((sum, e) => sum + num(e.amount), 0);

    const supplierPayCash = supplierPayments
      .filter((p) => (p.method || "cash") !== "online")
      .reduce((sum, p) => sum + num(p.amount), 0);
    const supplierPayOnline = supplierPayments
      .filter((p) => (p.method || "cash") === "online")
      .reduce((sum, p) => sum + num(p.amount), 0);
    const advCash = advances
      .filter((a) => (a.method || "cash") !== "online")
      .reduce((sum, a) => sum + num(a.amount), 0);
    const advOnline = advances
      .filter((a) => (a.method || "cash") === "online")
      .reduce((sum, a) => sum + num(a.amount), 0);
    const paidSalaryCash = salaries
      .filter((s) => s.status === "paid" && (s.paymentMethod || "cash") !== "online")
      .reduce((sum, s) => sum + Math.max(0, payableForSalary(salaries, advances, s)), 0);
    const paidSalaryOnline = salaries
      .filter((s) => s.status === "paid" && (s.paymentMethod || "cash") === "online")
      .reduce((sum, s) => sum + Math.max(0, payableForSalary(salaries, advances, s)), 0);

    const cashOut = paidBillsCash + paidSalaryCash + paidSupplierCash + supplierPayCash + advCash;
    const bankOut = paidBillsOnline + paidSalaryOnline + paidSupplierBank + supplierPayOnline + advOnline;

    return {
      cashBalance: cashIn - cashOut,
      bankBalance: bankIn - bankOut
    };
  }

  function computeBalances(data) {
    const op = computeOperationalBalances(data);
    return applyBalanceTransfers(op.cashBalance, op.bankBalance, data.balanceTransfers || []);
  }

  function cashExpensesOnDate(data, dateISO) {
    const d = String(dateISO || "").slice(0, 10);
    let total = 0;
    (data.expenses || []).forEach((e) => {
      if (e.status !== "paid") return;
      if (String(e.date || "").slice(0, 10) !== d) return;
      if ((e.paymentMethod || "cash") === "online") return;
      total += num(e.amount);
    });
    (data.purchases || []).forEach((p) => {
      if (p.paidStatus !== "paid") return;
      if (String(p.date || "").slice(0, 10) !== d) return;
      if ((p.paymentMethod || "cash") === "online") return;
      total += num(p.price);
    });
    (data.supplierPayments || []).forEach((p) => {
      if (String(p.date || "").slice(0, 10) !== d) return;
      if ((p.method || "cash") === "online") return;
      total += num(p.amount);
    });
    (data.advances || []).forEach((a) => {
      if (String(a.date || "").slice(0, 10) !== d) return;
      if ((a.method || "cash") === "online") return;
      total += num(a.amount);
    });
    (data.salaries || []).forEach((s) => {
      if (s.status !== "paid") return;
      const paidDate = String(s.paidAt || s.date || "").slice(0, 10);
      if (paidDate !== d) return;
      if ((s.paymentMethod || "cash") === "online") return;
      total += Math.max(0, payableForSalary(data.salaries || [], data.advances || [], s));
    });
    return total;
  }

  function cashSalesOnDate(data, dateISO) {
    const d = String(dateISO || "").slice(0, 10);
    return (data.sales || [])
      .filter((s) => String(s.date || "").slice(0, 10) === d)
      .reduce((sum, s) => sum + saleAmounts(s).cash, 0);
  }

  function transfersOnDate(data, dateISO) {
    const d = String(dateISO || "").slice(0, 10);
    let cashToBank = 0;
    let bankToCash = 0;
    (data.balanceTransfers || []).forEach((t) => {
      if (String(t.date || "").slice(0, 10) !== d) return;
      const amt = num(t.amount);
      const from = String(t.fromAccount || "").toLowerCase();
      const to = String(t.toAccount || "").toLowerCase();
      if (from === "cash" && to === "bank") cashToBank += amt;
      if (from === "bank" && to === "cash") bankToCash += amt;
    });
    return { cashToBank, bankToCash };
  }

  window.balanceMath = {
    num,
    saleAmounts,
    applyBalanceTransfers,
    computeOperationalBalances,
    computeBalances,
    cashExpensesOnDate,
    cashSalesOnDate,
    transfersOnDate
  };
})();
