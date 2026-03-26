import type { AdvanceDoc, AttendanceDoc, ExpenseDoc, SaleDoc, StaffDoc, SupplierBillDoc } from "@/lib/firestoreTypes";
import { num } from "@/lib/utils";

export type DashboardTotals = {
  cashBalance: number;
  bankBalance: number;
  totalBalance: number;
  totalRevenue: number;
  unpaidBills: number;
  netProfit: number;
  totalSales: number;
  salaryAccrued: number;
  totalExpenses: number;
  supplierPaidTotal: number;
};

function sum<T>(arr: T[], pick: (t: T) => unknown): number {
  return arr.reduce((acc, x) => acc + num(pick(x)), 0);
}

export function calcSalaryAccruedForMonth(args: {
  staff: StaffDoc[];
  attendance: AttendanceDoc[];
  advances: AdvanceDoc[];
  monthISO: string; // YYYY-MM
}) {
  const { staff, attendance, advances, monthISO } = args;
  const staffById = new Map<string, StaffDoc>();
  for (const s of staff) staffById.set((s as any).id ?? "", s);

  const monthAttendance = attendance.filter((a) => String(a.date).startsWith(monthISO));
  const monthAdvances = advances.filter((a) => String(a.date).startsWith(monthISO));

  const daysPresentByStaff = new Map<string, number>();
  for (const a of monthAttendance) {
    if (!a.present) continue;
    daysPresentByStaff.set(a.staffId, (daysPresentByStaff.get(a.staffId) ?? 0) + 1);
  }

  const advancesByStaff = new Map<string, number>();
  for (const adv of monthAdvances) {
    advancesByStaff.set(adv.staffId, (advancesByStaff.get(adv.staffId) ?? 0) + num(adv.amount));
  }

  let grossSalary = 0;
  let totalAdvances = 0;

  for (const [staffId, daysPresent] of daysPresentByStaff.entries()) {
    const s = staffById.get(staffId);
    if (!s || !s.active) continue;
    const dailySalary = num(s.monthlySalary) / 30;
    grossSalary += dailySalary * daysPresent;
  }

  for (const v of advancesByStaff.values()) totalAdvances += v;

  const payable = Math.max(0, grossSalary - totalAdvances);
  return { grossSalary, totalAdvances, payable };
}

export function calcDashboardTotals(args: {
  sales: SaleDoc[];
  expenses: ExpenseDoc[];
  supplierBills: SupplierBillDoc[];
  staff: StaffDoc[];
  attendance: AttendanceDoc[];
  advances: AdvanceDoc[];
  monthISO: string; // YYYY-MM (used for salary accrued)
}): DashboardTotals {
  const { sales, expenses, supplierBills, staff, attendance, advances, monthISO } = args;

  const totalCashSales = sum(sales, (s) => s.cashAmount);
  const totalOnlineSales = sum(sales, (s) => s.onlineAmount);
  const totalRevenue = totalCashSales + totalOnlineSales;

  const cashExpenses = sum(expenses.filter((e) => e.paidFrom === "cash"), (e) => e.amount);
  const bankExpenses = sum(expenses.filter((e) => e.paidFrom === "bank"), (e) => e.amount);

  const paidBills = supplierBills.filter((b) => b.status === "paid");
  const unpaidBills = supplierBills.filter((b) => b.status === "unpaid");

  const supplierPaidCash = sum(paidBills.filter((b) => b.paidFrom === "cash"), (b) => b.amount);
  const supplierPaidBank = sum(paidBills.filter((b) => b.paidFrom === "bank"), (b) => b.amount);

  const advancesCash = sum(advances.filter((a) => a.paidFrom === "cash"), (a) => a.amount);
  const advancesBank = sum(advances.filter((a) => a.paidFrom === "bank"), (a) => a.amount);

  const cashBalance = totalCashSales - cashExpenses - supplierPaidCash - advancesCash;
  const bankBalance = totalOnlineSales - bankExpenses - supplierPaidBank - advancesBank;
  const totalBalance = cashBalance + bankBalance;

  const unpaidBillsTotal = sum(unpaidBills, (b) => b.amount);

  const salary = calcSalaryAccruedForMonth({ staff, attendance, advances, monthISO });

  const totalExpenses = cashExpenses + bankExpenses;
  const supplierPaidTotal = supplierPaidCash + supplierPaidBank;

  const netProfit = totalRevenue - totalExpenses - supplierPaidTotal - salary.grossSalary;

  return {
    cashBalance,
    bankBalance,
    totalBalance,
    totalRevenue,
    unpaidBills: unpaidBillsTotal,
    netProfit,
    totalSales: totalRevenue,
    salaryAccrued: salary.grossSalary,
    totalExpenses,
    supplierPaidTotal
  };
}

