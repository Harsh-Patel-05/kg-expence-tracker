/** Shared cash/bank balance math (operational + transfers). Used by app.js and Firestore transactions. */
(function () {
  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /** Normalize pay channel: online/bank/upi → online; everything else paid → cash */
  function isOnlineMethod(method) {
    const m = String(method || "")
      .toLowerCase()
      .trim();
    return m === "online" || m === "bank" || m === "upi" || m === "other" || m === "card";
  }

  function isCashMethod(method) {
    return !isOnlineMethod(method);
  }

  function isActiveSale(s) {
    const st = String(s?.status || "")
      .toLowerCase()
      .trim();
    // Include customer advances (countsAsRevenue:false) so cash/online balances move
    return st !== "void" && st !== "cancelled" && st !== "refunded";
  }

  function countsAsRevenueSale(s) {
    if (!isActiveSale(s)) return false;
    if (s?.countsAsRevenue === false) return false;
    if (String(s?.revenueKind || "") === "customer_advance") return false;
    if (String(s?.source || "") === "scheduled_advance") return false;
    return true;
  }

  /** Expenses / advances may use paymentMethod or paidFrom (cash | bank | online). */
  function recordIsOnline(rec) {
    if (!rec) return false;
    const paidFrom = String(rec.paidFrom || "")
      .toLowerCase()
      .trim();
    if (paidFrom === "bank" || paidFrom === "online" || paidFrom === "upi") return true;
    if (paidFrom === "cash") return false;
    return isOnlineMethod(rec.paymentMethod || rec.method || "cash");
  }

  function dayKey(rec) {
    return String(rec?.date || rec?.paidAt || "").slice(0, 10);
  }

  function onOrAfter(iso, fromISO) {
    if (!fromISO) return true;
    const d = String(iso || "").slice(0, 10);
    if (!d) return false;
    return d >= fromISO;
  }

  /**
   * Balances start at the 1st of the month of the earliest sale so
   * old supplier pays from prior months do not wipe Cash / Online.
   * Same-month advances before the first sale day still count.
   * Override with data.balanceFromISO (YYYY-MM-DD).
   */
  function resolveBalanceFromISO(data) {
    const override = String(data?.balanceFromISO || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
    let earliest = "";
    (data?.sales || []).forEach((s) => {
      if (!isActiveSale(s)) return;
      const d = dayKey(s);
      if (!d) return;
      if (!earliest || d < earliest) earliest = d;
    });
    if (!earliest) return "";
    return `${earliest.slice(0, 7)}-01`;
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
      // Prefer breakdown fields; fall back to legacy onlineAmount only when breakdown is empty
      let online;
      if (swiggy > 0 || zomato > 0 || otherOnline > 0) online = swiggy + zomato + otherOnline;
      else online = legacyOnline;
      return { cash, online };
    }
    const amt = num(s?.amount);
    const m = String(s?.method || "").toLowerCase();
    if (isOnlineMethod(m)) return { cash: 0, online: amt };
    return { cash: amt, online: 0 };
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

  /** Owner capital in / shop purchases / take-profit withdrawals */
  function applyInvestmentsAndWithdrawals(cashBalance, bankBalance, investments, withdrawals) {
    let cash = cashBalance;
    let bank = bankBalance;
    (investments || []).forEach((r) => {
      const amt = num(r.amount);
      if (!(amt > 0)) return;
      const kind = String(r.kind || "capital_in").toLowerCase();
      const account = String(r.account || "cash").toLowerCase();
      if (kind === "capital_in") {
        if (account === "cash") cash += amt;
        else if (account === "online" || account === "bank") bank += amt;
      } else if (kind === "shop_purchase") {
        if (account === "cash") cash -= amt;
        else if (account === "online" || account === "bank") bank -= amt;
      }
    });
    (withdrawals || []).forEach((r) => {
      const amt = num(r.amount);
      if (!(amt > 0)) return;
      const account = String(r.account || "cash").toLowerCase();
      if (account === "cash") cash -= amt;
      else if (account === "online" || account === "bank") bank -= amt;
    });
    return { cashBalance: cash, bankBalance: bank };
  }

  function computeOperationalBalances(data) {
    const fromISO = resolveBalanceFromISO(data);
    const sales = (data.sales || []).filter((s) => isActiveSale(s) && onOrAfter(dayKey(s), fromISO));
    const purchases = (data.purchases || []).filter((p) => onOrAfter(dayKey(p), fromISO));
    const expenses = (data.expenses || []).filter((e) => onOrAfter(dayKey(e), fromISO));
    const salaries = (data.salaries || []).filter((s) =>
      onOrAfter(String(s.paidAt || s.date || "").slice(0, 10), fromISO)
    );
    const advances = (data.advances || []).filter((a) => onOrAfter(dayKey(a), fromISO));
    const supplierPayments = (data.supplierPayments || []).filter((p) => onOrAfter(dayKey(p), fromISO));

    const salesAmounts = sales.map((s) => ({ amounts: saleAmounts(s) }));
    const cashIn = salesAmounts.reduce((sum, { amounts }) => sum + amounts.cash, 0);
    const bankIn = salesAmounts.reduce((sum, { amounts }) => sum + amounts.online, 0);

    const isPaidPurchase = (p) =>
      String(p.paidStatus || p.paymentStatus || p.status || "").toLowerCase() === "paid";

    const paidSupplierCash = purchases
      .filter((p) => isPaidPurchase(p) && !recordIsOnline(p))
      .reduce((sum, p) => sum + num(p.price), 0);
    const paidSupplierBank = purchases
      .filter((p) => isPaidPurchase(p) && recordIsOnline(p))
      .reduce((sum, p) => sum + num(p.price), 0);

    const billExpenses = expenses.filter((e) => e.status === "paid");

    const paidBillsCash = billExpenses
      .filter((e) => !recordIsOnline(e))
      .reduce((sum, e) => sum + num(e.amount), 0);
    const paidBillsOnline = billExpenses
      .filter((e) => recordIsOnline(e))
      .reduce((sum, e) => sum + num(e.amount), 0);

    const supplierPayCash = supplierPayments
      .filter((p) => !recordIsOnline(p))
      .reduce((sum, p) => sum + num(p.amount), 0);
    const supplierPayOnline = supplierPayments
      .filter((p) => recordIsOnline(p))
      .reduce((sum, p) => sum + num(p.amount), 0);
    // Advances are salary bookkeeping only — they reduce payable salary.
    // Money leaving Cash/Online must be an Expense, supplier pay, or paid salary
    // (avoids double-count when Upad is entered as both advance + expense).
    const paidSalaryCash = salaries
      .filter((s) => s.status === "paid" && !recordIsOnline(s))
      .reduce((sum, s) => sum + Math.max(0, payableForSalary(salaries, advances, s)), 0);
    const paidSalaryOnline = salaries
      .filter((s) => s.status === "paid" && recordIsOnline(s))
      .reduce((sum, s) => sum + Math.max(0, payableForSalary(salaries, advances, s)), 0);

    const cashOut = paidBillsCash + paidSalaryCash + paidSupplierCash + supplierPayCash;
    const bankOut = paidBillsOnline + paidSalaryOnline + paidSupplierBank + supplierPayOnline;

    return {
      cashBalance: cashIn - cashOut,
      bankBalance: bankIn - bankOut,
      meta: {
        balanceFromISO: fromISO,
        cashIn,
        bankIn,
        cashOut,
        bankOut
      }
    };
  }

  function computeBalances(data) {
    const fromISO = resolveBalanceFromISO(data);
    const op = computeOperationalBalances(data);
    const transfers = (data.balanceTransfers || []).filter((t) => onOrAfter(dayKey(t), fromISO));
    const investments = (data.investments || []).filter((r) => onOrAfter(dayKey(r), fromISO));
    const withdrawals = (data.profitWithdrawals || []).filter((r) => onOrAfter(dayKey(r), fromISO));
    const afterTransfers = applyBalanceTransfers(op.cashBalance, op.bankBalance, transfers);
    const finalBal = applyInvestmentsAndWithdrawals(
      afterTransfers.cashBalance,
      afterTransfers.bankBalance,
      investments,
      withdrawals
    );
    return {
      ...finalBal,
      meta: op.meta || { balanceFromISO: fromISO }
    };
  }

  function cashExpensesOnDate(data, dateISO) {
    const d = String(dateISO || "").slice(0, 10);
    const fromISO = resolveBalanceFromISO(data);
    if (fromISO && d < fromISO) return 0;
    let total = 0;
    (data.expenses || []).forEach((e) => {
      if (e.status !== "paid") return;
      if (String(e.date || "").slice(0, 10) !== d) return;
      if (recordIsOnline(e)) return;
      total += num(e.amount);
    });
    (data.purchases || []).forEach((p) => {
      const paid = String(p.paidStatus || p.paymentStatus || p.status || "").toLowerCase() === "paid";
      if (!paid) return;
      if (String(p.date || "").slice(0, 10) !== d) return;
      if (recordIsOnline(p)) return;
      total += num(p.price);
    });
    (data.supplierPayments || []).forEach((p) => {
      if (String(p.date || "").slice(0, 10) !== d) return;
      if (recordIsOnline(p)) return;
      total += num(p.amount);
    });
    (data.salaries || []).forEach((s) => {
      if (s.status !== "paid") return;
      const paidDate = String(s.paidAt || s.date || "").slice(0, 10);
      if (paidDate !== d) return;
      if (recordIsOnline(s)) return;
      total += Math.max(0, payableForSalary(data.salaries || [], data.advances || [], s));
    });
    return total;
  }

  function cashSalesOnDate(data, dateISO) {
    const d = String(dateISO || "").slice(0, 10);
    return (data.sales || [])
      .filter((s) => isActiveSale(s) && String(s.date || "").slice(0, 10) === d)
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
    isOnlineMethod,
    isCashMethod,
    isActiveSale,
    countsAsRevenueSale,
    recordIsOnline,
    resolveBalanceFromISO,
    saleAmounts,
    applyBalanceTransfers,
    applyInvestmentsAndWithdrawals,
    computeOperationalBalances,
    computeBalances,
    cashExpensesOnDate,
    cashSalesOnDate,
    transfersOnDate
  };
})();
