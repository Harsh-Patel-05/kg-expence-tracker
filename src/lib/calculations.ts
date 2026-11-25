import type { ExpenseDoc, SaleDoc, SupplierBillDoc } from "@/lib/firestoreTypes";
import { num } from "@/lib/utils";
import {
  attendanceStatsForMonth,
  fixedSalaryFor,
  salaryEarnedFromAttendance
} from "@/features/hr/utils/payroll";
import {
  computeBalances,
  countsAsRevenueSale,
  isDuplicateAdvanceExpense,
  isPaidExpense,
  recordIsOnline,
  saleAmounts
} from "@/lib/balanceMath";

export type DashboardTotals = {
  cashBalance: number;
  bankBalance: number;
  totalBalance: number;
  /** Shop sales only (Cash + UPI) — Swiggy/Zomato excluded */
  totalRevenue: number;
  unpaidBills: number;
  netProfit: number;
  totalSales: number;
  /** Swiggy + Zomato platform sales (tracked separately) */
  aggregatorSales: number;
  salaryAccrued: number;
  totalExpenses: number;
  supplierPaidTotal: number;
};

function sum<T>(arr: T[], pick: (t: T) => unknown): number {
  return arr.reduce((acc, x) => acc + num(pick(x)), 0);
}

/**
 * Classic salary accrual: by staff name + attendance status presentEquivalent × daily rate.
 * Advances are bookkeeping only (not deducted from cash here).
 */
export function calcSalaryAccruedForMonth(args: {
  staff: any[];
  attendance: any[];
  advances: any[];
  fixedSalaries?: any[];
  monthISO: string;
}) {
  const { staff, attendance, advances, fixedSalaries = [], monthISO } = args;
  const active = staff.filter((s) => s && s.active !== false);
  let grossSalary = 0;
  let totalAdvances = 0;

  for (const s of active) {
    const name = String(s.name || "").trim();
    if (!name) continue;
    const monthly = fixedSalaryFor(name, fixedSalaries, s);
    const stats = attendanceStatsForMonth(name, monthISO, attendance);
    grossSalary += salaryEarnedFromAttendance(monthly, stats.presentEq);
  }

  for (const adv of advances) {
    const m = String(adv.month || adv.date || "").slice(0, 7);
    if (m === monthISO) totalAdvances += num(adv.amount) - num(adv.recovered);
  }

  const payable = Math.max(0, grossSalary - totalAdvances);
  return { grossSalary, totalAdvances, payable };
}

/**
 * Dashboard KPIs + classic balanceMath.computeBalances for Cash / Online.
 */
export function calcDashboardTotals(args: {
  sales: SaleDoc[];
  expenses: ExpenseDoc[];
  supplierBills: SupplierBillDoc[];
  purchases?: Array<{ paidStatus?: string; paymentStatus?: string; status?: string; price?: number; total?: number; paymentMethod?: string; paidFrom?: string }>;
  supplierPayments?: Array<{ amount?: number; paymentMethod?: string; paidFrom?: string; method?: string }>;
  staff: any[];
  attendance: any[];
  advances: any[];
  salaries?: any[];
  fixedSalaries?: any[];
  investments?: any[];
  profitWithdrawals?: any[];
  balanceTransfers?: any[];
  balanceFromISO?: string;
  monthISO: string;
}): DashboardTotals {
  const {
    sales,
    expenses,
    supplierBills,
    purchases = [],
    supplierPayments = [],
    staff,
    attendance,
    advances,
    salaries = [],
    fixedSalaries = [],
    investments = [],
    profitWithdrawals = [],
    balanceTransfers = [],
    balanceFromISO,
    monthISO
  } = args;

  // Classic cash/bank — exact balanceMath.computeBalances
  const bal = computeBalances({
    sales,
    purchases: purchases.map((p) => ({ ...p, price: num((p as any).price ?? (p as any).total) })),
    expenses,
    salaries,
    advances,
    supplierPayments,
    balanceTransfers,
    investments,
    profitWithdrawals,
    balanceFromISO
  });

  // Shop revenue = retail only (Cash + UPI). Swiggy/Zomato do not count in total sales.
  const revenueSales = sales.filter(countsAsRevenueSale);
  const totalRevenue = revenueSales.reduce((s, sale) => s + saleAmounts(sale).retail, 0);
  const aggregatorSales = revenueSales.reduce((s, sale) => {
    const a = saleAmounts(sale);
    return s + a.swiggy + a.zomato;
  }, 0);

  const billExpenses = expenses.filter(
    (e: any) => isPaidExpense(e) && !isDuplicateAdvanceExpense(e, advances)
  );
  const cashExpenses = sum(
    billExpenses.filter((e: any) => !recordIsOnline(e)),
    (e) => e.amount
  );
  const bankExpenses = sum(
    billExpenses.filter((e: any) => recordIsOnline(e)),
    (e) => e.amount
  );

  const unpaidExpenseTotal = sum(
    expenses.filter((e: any) => !e.isDeleted && !e.archived && !isPaidExpense(e)),
    (e: any) => Math.max(0, num(e.amount) - num(e.paidAmount))
  );

  const unpaidBills = supplierBills.filter((b) => b.status === "unpaid");
  const isPaidPurchase = (p: { paidStatus?: string; paymentStatus?: string; status?: string }) =>
    String(p.paidStatus || p.paymentStatus || p.status || "").toLowerCase() === "paid";
  const unpaidPurchases = purchases.filter((p) => !isPaidPurchase(p));
  const paidPurchases = purchases.filter((p) => isPaidPurchase(p));

  const supplierPaidTotal =
    sum(
      supplierBills.filter((b) => b.status === "paid"),
      (b) => b.amount
    ) +
    sum(paidPurchases, (p) => p.price ?? p.total) +
    sum(supplierPayments, (p) => p.amount);

  const unpaidBillsTotal =
    sum(unpaidBills, (b) => b.amount) + unpaidExpenseTotal + sum(unpaidPurchases, (p) => p.price ?? p.total);

  const salary = calcSalaryAccruedForMonth({ staff, attendance, advances, fixedSalaries, monthISO });

  const paidSalaryOut = salaries
    .filter((s) => s.status === "paid")
    .reduce((sum, s) => {
      const adv = advances
        .filter((a: any) => a.name === s.name && a.month === s.month)
        .reduce((x: number, a: any) => x + num(a.amount), 0);
      return sum + Math.max(0, num(s.amount) - adv);
    }, 0);

  const totalExpenses = cashExpenses + bankExpenses + paidSalaryOut;
  const netProfit = totalRevenue - cashExpenses - bankExpenses - supplierPaidTotal - salary.grossSalary;

  return {
    cashBalance: bal.cashBalance,
    bankBalance: bal.bankBalance,
    totalBalance: bal.cashBalance + bal.bankBalance,
    totalRevenue,
    unpaidBills: unpaidBillsTotal,
    netProfit,
    totalSales: totalRevenue,
    aggregatorSales,
    salaryAccrued: salary.grossSalary,
    totalExpenses,
    supplierPaidTotal
  };
}
