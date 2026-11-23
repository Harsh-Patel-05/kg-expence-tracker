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

function isOnlinePay(rec: { paidFrom?: string; paymentMethod?: string; method?: string } | null | undefined): boolean {
  if (!rec) return false;
  const paidFrom = String(rec.paidFrom || "").toLowerCase().trim();
  if (paidFrom === "bank" || paidFrom === "online" || paidFrom === "upi") return true;
  if (paidFrom === "cash") return false;
  const m = String(rec.paymentMethod || rec.method || "cash").toLowerCase().trim();
  return m === "online" || m === "bank" || m === "upi" || m === "other" || m === "card";
}

function saleCashOnline(s: any): { cash: number; online: number } {
  const st = String(s?.status || "").toLowerCase();
  if (st === "void" || st === "cancelled" || st === "refunded") return { cash: 0, online: 0 };
  const cash = num(s?.cashAmount);
  const swiggy = num(s?.swiggyAmount);
  const zomato = num(s?.zomatoAmount);
  const otherOnline = num(s?.otherOnlineAmount);
  const legacyOnline = num(s?.onlineAmount);
  const online =
    swiggy > 0 || zomato > 0 || otherOnline > 0 ? swiggy + zomato + otherOnline : legacyOnline;
  if (cash || online || s?.cashAmount !== undefined || s?.onlineAmount !== undefined || s?.otherOnlineAmount !== undefined) {
    return { cash, online };
  }
  const amt = num(s?.amount);
  return isOnlinePay({ method: s?.method }) ? { cash: 0, online: amt } : { cash: amt, online: 0 };
}

export function calcDashboardTotals(args: {
  sales: SaleDoc[];
  expenses: ExpenseDoc[];
  supplierBills: SupplierBillDoc[];
  purchases?: Array<{ paidStatus?: string; paymentStatus?: string; status?: string; price?: number; total?: number; paymentMethod?: string; paidFrom?: string }>;
  staff: StaffDoc[];
  attendance: AttendanceDoc[];
  advances: AdvanceDoc[];
  monthISO: string; // YYYY-MM (used for salary accrued)
}): DashboardTotals {
  const { sales, expenses, supplierBills, purchases = [], staff, attendance, advances, monthISO } = args;

  const saleSplits = sales.map(saleCashOnline);
  const totalCashSales = saleSplits.reduce((sum, a) => sum + a.cash, 0);
  const totalOnlineSales = saleSplits.reduce((sum, a) => sum + a.online, 0);
  const totalRevenue = totalCashSales + totalOnlineSales;

  const cashExpenses = sum(
    expenses.filter((e: any) => {
      if (e.isDeleted || e.archived) return false;
      if (e.status !== "paid") return false;
      return !isOnlinePay(e);
    }),
    (e) => e.amount
  );
  const bankExpenses = sum(
    expenses.filter((e: any) => {
      if (e.isDeleted || e.archived) return false;
      if (e.status !== "paid") return false;
      return isOnlinePay(e);
    }),
    (e) => e.amount
  );

  const unpaidExpenseTotal = sum(
    expenses.filter((e: any) => !e.isDeleted && !e.archived && (e.status === "unpaid" || e.paymentStatus === "pending" || e.paymentStatus === "partial")),
    (e: any) => Math.max(0, num(e.amount) - num(e.paidAmount))
  );

  const paidBills = supplierBills.filter((b) => b.status === "paid");
  const unpaidBills = supplierBills.filter((b) => b.status === "unpaid");
  const isPaidPurchase = (p: { paidStatus?: string; paymentStatus?: string; status?: string }) =>
    String(p.paidStatus || p.paymentStatus || p.status || "").toLowerCase() === "paid";
  const unpaidPurchases = purchases.filter((p) => !isPaidPurchase(p));
  const paidPurchases = purchases.filter((p) => isPaidPurchase(p));

  const supplierPaidCash = sum(paidBills.filter((b) => !isOnlinePay(b as any)), (b) => b.amount)
    + sum(paidPurchases.filter((p) => !isOnlinePay(p)), (p) => p.price ?? p.total);
  const supplierPaidBank = sum(paidBills.filter((b) => isOnlinePay(b as any)), (b) => b.amount)
    + sum(paidPurchases.filter((p) => isOnlinePay(p)), (p) => p.price ?? p.total);

  const advancesCash = sum(advances.filter((a) => !isOnlinePay(a as any)), (a) => a.amount);
  const advancesBank = sum(advances.filter((a) => isOnlinePay(a as any)), (a) => a.amount);

  const cashBalance = totalCashSales - cashExpenses - supplierPaidCash - advancesCash;
  const bankBalance = totalOnlineSales - bankExpenses - supplierPaidBank - advancesBank;
  const totalBalance = cashBalance + bankBalance;

  const unpaidBillsTotal = sum(unpaidBills, (b) => b.amount) + unpaidExpenseTotal + sum(unpaidPurchases, (p) => p.price ?? p.total);

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

