/**
 * Shared cash/bank balance math (operational + transfers + investments).
 * Staff advances deduct from Cash/Online immediately; soft-delete restores that pocket.
 * Paid salary uses net (earned − advances) so advances are not double-counted.
 */

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize pay channel: online/bank/upi → online; everything else paid → cash */
export function isOnlineMethod(method?: string | null): boolean {
  const m = String(method || "")
    .toLowerCase()
    .trim();
  return m === "online" || m === "bank" || m === "upi" || m === "other" || m === "card";
}

export function isCashMethod(method?: string | null): boolean {
  return !isOnlineMethod(method);
}

export function isDeletedRecord(r: any): boolean {
  if (!r) return true;
  if (r.isDeleted === true || r.deleted === true || r.archived === true) return true;
  const st = String(r.status || "")
    .toLowerCase()
    .trim();
  return st === "deleted" || st === "void";
}

/**
 * Optional blocklist for sales days (empty = all dates allowed).
 * Was used once to wipe mistaken 2026-11-23 POS rows; cleared so new entries for that day count again.
 */
export const CLEARED_SALES_DATES = new Set<string>();

export function saleDayKey(s: any): string {
  const raw = s?.date ?? s?.saleDate ?? s?.billDate;
  if (typeof raw === "string") return raw.slice(0, 10);
  if (raw && typeof raw === "object" && typeof raw.toDate === "function") {
    try {
      return raw.toDate().toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }
  return String(raw || "").slice(0, 10);
}

export function isActiveSale(s: any): boolean {
  if (isDeletedRecord(s)) return false;
  // Cleared days: excluded from every balance / chart / settlement path
  if (CLEARED_SALES_DATES.has(saleDayKey(s))) return false;
  const st = String(s?.status || "")
    .toLowerCase()
    .trim();
  // Classic POS used status "settled"; React POS may leave status empty
  if (st === "void" || st === "cancelled" || st === "refunded" || st === "deleted") return false;
  return true;
}

export function countsAsRevenueSale(s: any): boolean {
  if (!isActiveSale(s)) return false;
  // Explicit flag wins — advances posted as today's sales use countsAsRevenue: true
  if (s?.countsAsRevenue === true) return true;
  if (s?.countsAsRevenue === false) return false;
  if (String(s?.revenueKind || "") === "customer_advance") return false;
  if (String(s?.source || "") === "scheduled_advance") return false;
  return true;
}

/** Weekly Swiggy/Zomato totals entered on Sales page — not POS kitchen tickets. */
export function isManualPlatformSaleEntry(s: any): boolean {
  if (!isActiveSale(s)) return false;
  const src = String(s?.source || "")
    .toLowerCase()
    .trim();
  if (src === "pos" || src === "pos_collect" || src.includes("pos")) return false;
  if (String(s?.notes || "").startsWith("POS ")) return false;
  if (s?.orderId) return false;
  if (src === "manual" || src === "manual_sales" || src === "sales_entry") return true;
  // Sales-page rows: platform amounts without a POS order link
  return num(s?.swiggyAmount) > 0 || num(s?.zomatoAmount) > 0;
}

/** Expenses / advances may use paymentMethod or paidFrom (cash | bank | online). */
export function recordIsOnline(rec: any): boolean {
  if (!rec) return false;
  const paidFrom = String(rec.paidFrom || "")
    .toLowerCase()
    .trim();
  if (paidFrom === "bank" || paidFrom === "online" || paidFrom === "upi") return true;
  if (paidFrom === "cash") return false;
  const pm = String(rec.paymentMethod || rec.method || "")
    .toLowerCase()
    .trim();
  if (pm === "unpaid" || pm === "pending" || pm === "") {
    // Fall through — unpaid is not online; treat as cash pocket only if paid
    return false;
  }
  return isOnlineMethod(pm);
}

/**
 * Expense counts against Cash/Online when paid.
 * Accepts legacy docs with missing status but a real payment method / paidFrom.
 */
export function isPaidExpense(e: any): boolean {
  if (!e || isDeletedRecord(e)) return false;
  const st = String(e.status || e.paymentStatus || "")
    .toLowerCase()
    .trim();
  if (st === "unpaid" || st === "pending" || st === "draft" || st === "rejected" || st === "cancelled") {
    return false;
  }
  if (st === "paid" || st === "completed" || st === "captured" || st === "approved") return true;
  const pm = String(e.paymentMethod || e.method || "")
    .toLowerCase()
    .trim();
  if (pm === "unpaid" || pm === "pending") return false;
  if (pm === "cash" || pm === "online" || pm === "upi" || pm === "bank" || pm === "card") return true;
  if (e.paidFrom) return true;
  // No explicit unpaid flag + has amount → count (matches classic daily expense entry)
  return num(e.amount) > 0 && st === "";
}

/** Staff advance already deducted via advances[] — don't subtract the same money again as an expense. */
export function isDuplicateAdvanceExpense(e: any, advances: any[]): boolean {
  if (!e || !advances?.length) return false;
  const label = `${e.title || ""} ${e.category || ""} ${e.expenseType || ""} ${e.vendor || ""}`.toLowerCase();
  if (!/(upad|advance|udhaar|उधार)/i.test(label)) return false;
  const amt = num(e.amount);
  const d = dayKey(e);
  if (!(amt > 0) || !d) return false;
  return advances.some((a) => {
    if (isDeletedRecord(a)) return false;
    if (num(a.amount) !== amt) return false;
    return dayKey(a) === d;
  });
}

export function dayKey(rec: any): string {
  return String(rec?.date || rec?.paidAt || "").slice(0, 10);
}

export function onOrAfter(iso: string, fromISO?: string): boolean {
  if (!fromISO) return true;
  const d = String(iso || "").slice(0, 10);
  if (!d) return false;
  return d >= fromISO;
}

/**
 * Balances start at the 1st of the month of the earliest sale so
 * old supplier pays from prior months do not wipe Cash / Online.
 */
export function resolveBalanceFromISO(data: { balanceFromISO?: string; sales?: any[] }): string {
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

export type SaleAmounts = {
  cash: number;
  /** Platform + UPI for ledger / bank movement (includes Swiggy + Zomato). */
  online: number;
  /** Shop sales only — Cash + UPI/other online. Swiggy/Zomato excluded. */
  retail: number;
  swiggy: number;
  zomato: number;
  otherOnline: number;
  legacyOnline: number;
  total: number;
};

function channelHint(s: any): string {
  return String(s?.orderType || s?.channel || s?.method || s?.source || "")
    .toLowerCase()
    .trim();
}

/** Classic saleAmounts — retail excludes Swiggy/Zomato from shop total sales. */
export function saleAmounts(s: any): SaleAmounts {
  const ch = channelHint(s);
  const isSwiggy = ch.includes("swiggy");
  const isZomato = ch.includes("zomato");

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
    let swiggy = num(s.swiggyAmount);
    let zomato = num(s.zomatoAmount);
    const otherOnline = num(s.otherOnlineAmount);
    const legacyOnline = num(s.onlineAmount);
    // Channel-only POS bills: whole total tagged as Swiggy/Zomato
    if (isSwiggy && swiggy <= 0 && cash <= 0 && otherOnline <= 0 && zomato <= 0) {
      swiggy = num(s.totalAmount) || legacyOnline || num(s.amount);
    }
    if (isZomato && zomato <= 0 && cash <= 0 && otherOnline <= 0 && swiggy <= 0) {
      zomato = num(s.totalAmount) || legacyOnline || num(s.amount);
    }
    const hasOnlineBreakdown = swiggy > 0 || zomato > 0 || otherOnline > 0;
    const retailLegacyOnly = !hasOnlineBreakdown && legacyOnline > 0 ? legacyOnline : 0;
    const retail = cash + otherOnline + retailLegacyOnly;
    const online = hasOnlineBreakdown ? swiggy + zomato + otherOnline : legacyOnline;
    const total = cash + online || num(s.totalAmount) || retail;
    return { cash, online, retail, swiggy, zomato, otherOnline, legacyOnline, total };
  }

  const amt = num(s?.amount ?? s?.total ?? s?.totalAmount);
  if (isSwiggy) {
    return { cash: 0, online: amt, retail: 0, swiggy: amt, zomato: 0, otherOnline: 0, legacyOnline: 0, total: amt };
  }
  if (isZomato) {
    return { cash: 0, online: amt, retail: 0, swiggy: 0, zomato: amt, otherOnline: 0, legacyOnline: 0, total: amt };
  }
  const m = String(s?.method || "").toLowerCase();
  if (isOnlineMethod(m)) {
    return { cash: 0, online: amt, retail: amt, swiggy: 0, zomato: 0, otherOnline: amt, legacyOnline: amt, total: amt };
  }
  return { cash: amt, online: 0, retail: amt, swiggy: 0, zomato: 0, otherOnline: 0, legacyOnline: 0, total: amt };
}

/** Shop total sales KPI — excludes Swiggy / Zomato platform amounts. */
export function retailSaleTotal(s: any): number {
  return saleAmounts(s).retail;
}

export function isAggregatorSale(s: any): boolean {
  const a = saleAmounts(s);
  if (a.swiggy > 0 || a.zomato > 0) return a.retail <= 0.009;
  const ch = channelHint(s);
  return ch.includes("swiggy") || ch.includes("zomato");
}

export function salaryAdvanceFor(advances: any[], name: string, month: string): number {
  return (advances || [])
    .filter((x) => !isDeletedRecord(x) && x.name === name && String(x.month || "").slice(0, 7) === String(month || "").slice(0, 7))
    .reduce((sum, x) => sum + num(x.amount), 0);
}

export function payableForSalary(salaries: any[], advances: any[], sal: any): number {
  return num(sal.amount) - salaryAdvanceFor(advances, sal.name, sal.month);
}

export function applyBalanceTransfers(
  cashBalance: number,
  bankBalance: number,
  transfers: any[]
): { cashBalance: number; bankBalance: number } {
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

export function applyInvestmentsAndWithdrawals(
  cashBalance: number,
  bankBalance: number,
  investments: any[],
  withdrawals: any[]
): { cashBalance: number; bankBalance: number } {
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

export type BalanceData = {
  sales?: any[];
  purchases?: any[];
  expenses?: any[];
  salaries?: any[];
  advances?: any[];
  supplierPayments?: any[];
  balanceTransfers?: any[];
  investments?: any[];
  profitWithdrawals?: any[];
  balanceFromISO?: string;
};

export function computeOperationalBalances(data: BalanceData) {
  const fromISO = resolveBalanceFromISO(data);
  const sales = (data.sales || []).filter((s) => isActiveSale(s) && onOrAfter(dayKey(s), fromISO));
  const purchases = (data.purchases || []).filter((p) => !isDeletedRecord(p) && onOrAfter(dayKey(p), fromISO));
  const expenses = (data.expenses || []).filter((e) => !isDeletedRecord(e) && onOrAfter(dayKey(e), fromISO));
  const salaries = (data.salaries || []).filter(
    (s) => !isDeletedRecord(s) && onOrAfter(String(s.paidAt || s.date || "").slice(0, 10), fromISO)
  );
  // Staff advances leave Cash/Online immediately; deleting the advance restores that pocket.
  // Paid salary still uses net (earned − advances) so money is not double-counted.
  const advances = (data.advances || []).filter((a) => !isDeletedRecord(a) && onOrAfter(dayKey(a), fromISO));
  const supplierPayments = (data.supplierPayments || []).filter(
    (p) => !isDeletedRecord(p) && onOrAfter(dayKey(p), fromISO)
  );

  const salesAmounts = sales.map((s) => ({ amounts: saleAmounts(s) }));
  // Shop pockets only — Swiggy/Zomato never inflate Cash/Online balances
  const cashIn = salesAmounts.reduce((sum, { amounts }) => sum + amounts.cash, 0);
  const bankIn = salesAmounts.reduce(
    (sum, { amounts }) => sum + Math.max(0, amounts.retail - amounts.cash),
    0
  );

  const isPaidPurchase = (p: any) =>
    String(p.paidStatus || p.paymentStatus || p.status || "").toLowerCase() === "paid";

  const paidSupplierCash = purchases
    .filter((p) => isPaidPurchase(p) && !recordIsOnline(p))
    .reduce((sum, p) => sum + num(p.price), 0);
  const paidSupplierBank = purchases
    .filter((p) => isPaidPurchase(p) && recordIsOnline(p))
    .reduce((sum, p) => sum + num(p.price), 0);

  const billExpenses = expenses.filter((e) => isPaidExpense(e) && !isDuplicateAdvanceExpense(e, advances));

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

  const advanceCash = advances
    .filter((a) => !recordIsOnline(a))
    .reduce((sum, a) => sum + num(a.amount), 0);
  const advanceOnline = advances
    .filter((a) => recordIsOnline(a))
    .reduce((sum, a) => sum + num(a.amount), 0);

  const paidSalaryCash = salaries
    .filter((s) => s.status === "paid" && !recordIsOnline(s))
    .reduce((sum, s) => sum + Math.max(0, payableForSalary(salaries, advances, s)), 0);
  const paidSalaryOnline = salaries
    .filter((s) => s.status === "paid" && recordIsOnline(s))
    .reduce((sum, s) => sum + Math.max(0, payableForSalary(salaries, advances, s)), 0);

  const cashOut = paidBillsCash + paidSalaryCash + paidSupplierCash + supplierPayCash + advanceCash;
  const bankOut = paidBillsOnline + paidSalaryOnline + paidSupplierBank + supplierPayOnline + advanceOnline;

  return {
    cashBalance: cashIn - cashOut,
    bankBalance: bankIn - bankOut,
    meta: {
      balanceFromISO: fromISO,
      cashIn,
      bankIn,
      cashOut,
      bankOut,
      advanceCash,
      advanceOnline
    }
  };
}

export function computeBalances(data: BalanceData) {
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

export function cashExpensesOnDate(data: BalanceData, dateISO: string): number {
  const d = String(dateISO || "").slice(0, 10);
  const fromISO = resolveBalanceFromISO(data);
  if (fromISO && d < fromISO) return 0;
  let total = 0;
  (data.expenses || []).forEach((e) => {
    if (!isPaidExpense(e)) return;
    if (isDuplicateAdvanceExpense(e, data.advances || [])) return;
    if (String(e.date || "").slice(0, 10) !== d) return;
    if (recordIsOnline(e)) return;
    total += num(e.amount);
  });
  (data.purchases || []).forEach((p) => {
    if (isDeletedRecord(p)) return;
    const paid = String(p.paidStatus || p.paymentStatus || p.status || "").toLowerCase() === "paid";
    if (!paid) return;
    if (String(p.date || "").slice(0, 10) !== d) return;
    if (recordIsOnline(p)) return;
    total += num(p.price);
  });
  (data.supplierPayments || []).forEach((p) => {
    if (isDeletedRecord(p)) return;
    if (String(p.date || "").slice(0, 10) !== d) return;
    if (recordIsOnline(p)) return;
    total += num(p.amount);
  });
  (data.advances || []).forEach((a) => {
    if (isDeletedRecord(a)) return;
    if (String(a.date || "").slice(0, 10) !== d) return;
    if (recordIsOnline(a)) return;
    total += num(a.amount);
  });
  (data.salaries || []).forEach((s) => {
    if (isDeletedRecord(s) || s.status !== "paid") return;
    const paidDate = String(s.paidAt || s.date || "").slice(0, 10);
    if (paidDate !== d) return;
    if (recordIsOnline(s)) return;
    total += Math.max(0, payableForSalary(data.salaries || [], data.advances || [], s));
  });
  return total;
}

export function cashSalesOnDate(data: BalanceData, dateISO: string): number {
  const d = String(dateISO || "").slice(0, 10);
  return (data.sales || [])
    .filter((s) => isActiveSale(s) && String(s.date || "").slice(0, 10) === d)
    .reduce((sum, s) => sum + saleAmounts(s).cash, 0);
}

export function transfersOnDate(data: BalanceData, dateISO: string) {
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
