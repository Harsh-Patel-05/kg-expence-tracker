import { num } from "@/lib/utils";
import type {
  AdvanceDoc,
  AttendanceDoc,
  EmployeeDoc,
  FixedSalaryDoc,
  IncentiveDoc,
  PayrollResult,
  SalaryDoc,
  TipDoc
} from "../types";
import type { WithId } from "@/features/pos/hooks/useRestaurantCollection";

export const DAYS_IN_MONTH = 30;

/** Classic: present + half-day×0.5 only (late does not count as worked). */
export function presentEquivalent(status: string): number {
  const s = String(status || "").toLowerCase();
  if (s === "present") return 1;
  if (s === "half-day") return 0.5;
  return 0;
}

export function fixedSalaryFor(
  name: string,
  fixed: Array<WithId<FixedSalaryDoc> | FixedSalaryDoc>,
  staff?: EmployeeDoc | null
) {
  if (staff?.monthlySalary && num(staff.monthlySalary) > 0) return num(staff.monthlySalary);
  const rows = fixed
    .filter((f) => String(f.name || "").toLowerCase() === String(name).toLowerCase())
    .sort((a, b) => String(b.joinDate || "").localeCompare(String(a.joinDate || "")));
  return num(rows[0]?.amount);
}

export function salaryDailyRate(monthly: number): number {
  return DAYS_IN_MONTH > 0 ? num(monthly) / DAYS_IN_MONTH : 0;
}

/** Normalize attendance row status (supports legacy `present: true` boolean docs). */
export function attendanceRowStatus(r: AttendanceDoc | Record<string, unknown>): string {
  const st = String((r as any).status || "").toLowerCase().trim();
  if (st) return st;
  if ((r as any).present === true) return "present";
  if ((r as any).present === false) return "absent";
  return "";
}

export function attendanceMatchesStaff(
  row: AttendanceDoc | Record<string, unknown>,
  name: string,
  staffId?: string | null
): boolean {
  const rowName = String((row as any).name || "").toLowerCase().trim();
  const want = String(name || "").toLowerCase().trim();
  if (rowName && want && rowName === want) return true;
  const rowId = String((row as any).staffId || "").trim();
  if (staffId && rowId && rowId === String(staffId)) return true;
  return false;
}

export function attendanceStatsForMonth(
  name: string,
  month: string,
  attendance: Array<WithId<AttendanceDoc> | AttendanceDoc>,
  staffId?: string | null
) {
  const rows = attendance.filter(
    (a) =>
      attendanceMatchesStaff(a, name, staffId) && String(a.date || "").slice(0, 7) === String(month).slice(0, 7)
  );
  let presentEq = 0;
  let present = 0;
  let half = 0;
  let absent = 0;
  let late = 0;
  rows.forEach((r) => {
    const st = attendanceRowStatus(r);
    presentEq += presentEquivalent(st);
    if (st === "present" || st === "p") present++;
    else if (st === "half-day" || st === "half" || st === "h") half++;
    else if (st === "late") late++;
    else if (st === "absent" || st === "a") absent++;
  });
  return { presentEq, present, half, absent, late, daysMarked: rows.length };
}

export function salaryLeaveDaysFromStats(stats: { absent: number; half: number }): number {
  return num(stats.absent) + num(stats.half) * 0.5;
}

export function salaryLeaveDeduction(monthly: number, stats: { absent: number; half: number }): number {
  const daily = salaryDailyRate(monthly);
  const leaveDays = salaryLeaveDaysFromStats(stats);
  return Math.min(num(monthly), daily * leaveDays);
}

export function salaryEarnedFromAttendance(monthly: number, presentEq: number): number {
  return Math.max(0, salaryDailyRate(monthly) * num(presentEq));
}

export function directAdvancesFor(
  name: string,
  month: string,
  advances: Array<WithId<AdvanceDoc> | AdvanceDoc>
): number {
  return advances
    .filter(
      (a) =>
        !(a as any).isDeleted &&
        !(a as any).deleted &&
        String(a.name || "").toLowerCase() === String(name).toLowerCase() &&
        String(a.month || "").slice(0, 7) === String(month).slice(0, 7)
    )
    .reduce((s, a) => s + num(a.amount) - num(a.recovered), 0);
}

/** @deprecated use directAdvancesFor + salaryAdvanceFor */
export function advancesForMonth(name: string, month: string, advances: Array<WithId<AdvanceDoc> | AdvanceDoc>) {
  return directAdvancesFor(name, month, advances);
}

export function incentivesForMonth(name: string, month: string, incentives: Array<WithId<IncentiveDoc> | IncentiveDoc>) {
  return incentives
    .filter((i) => String(i.name || "").toLowerCase() === String(name).toLowerCase() && String(i.month || "").slice(0, 7) === month)
    .reduce((s, i) => s + num(i.amount), 0);
}

export function tipsForMonth(name: string, month: string, tips: Array<WithId<TipDoc> | TipDoc>) {
  return tips
    .filter((t) => String(t.name || "").toLowerCase() === String(name).toLowerCase() && String(t.date || "").slice(0, 7) === month)
    .reduce((s, t) => s + num(t.amount), 0);
}

export function prevMonthISO(month: string): string {
  const [y, m] = String(month || "").slice(0, 7).split("-").map(Number);
  if (!y || !m) return "";
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isSalaryMonthSettled(
  name: string,
  month: string,
  salaries: Array<WithId<SalaryDoc> | SalaryDoc>
): boolean {
  return salaries.some(
    (s) =>
      String(s.name || "").toLowerCase() === String(name).toLowerCase() &&
      String(s.month || "").slice(0, 7) === String(month).slice(0, 7) &&
      s.status === "paid"
  );
}

/**
 * Advances for month = this month's direct advances + leftover from prior months
 * when prior advances exceeded that month's earned salary (always carries,
 * whether or not "Pay full" was clicked — leftover keeps running in minus).
 */
export function salaryAdvanceFor(
  name: string,
  month: string,
  advances: Array<WithId<AdvanceDoc> | AdvanceDoc>,
  attendance: Array<WithId<AttendanceDoc> | AttendanceDoc>,
  fixedSalaries: Array<WithId<FixedSalaryDoc> | FixedSalaryDoc>,
  salaries: Array<WithId<SalaryDoc> | SalaryDoc>,
  staff?: EmployeeDoc | null,
  depth = 0
): number {
  if (depth > 18) return directAdvancesFor(name, month, advances);
  const direct = directAdvancesFor(name, month, advances);
  const prev = prevMonthISO(month);
  if (!prev) return direct;
  const prevTotalAdv = salaryAdvanceFor(
    name,
    prev,
    advances,
    attendance,
    fixedSalaries,
    salaries,
    staff,
    depth + 1
  );
  const monthly = fixedSalaryFor(name, fixedSalaries, staff);
  const stats = attendanceStatsForMonth(name, prev, attendance, (staff as { id?: string } | null | undefined)?.id);
  const attendanceEarned = salaryEarnedFromAttendance(monthly, stats.presentEq);
  // Prefer posted slip gross earned when that month was paid
  const paidSlip = salaries.find(
    (s) =>
      String(s.name || "").toLowerCase() === String(name).toLowerCase() &&
      String(s.month || "").slice(0, 7) === prev &&
      s.status === "paid"
  );
  const earnedCovered = paidSlip ? num(paidSlip.amount) || num(paidSlip.basic) || attendanceEarned : attendanceEarned;
  // Leftover advance after cutting prior month salary → carries into this month
  const carry = Math.max(0, prevTotalAdv - earnedCovered);
  return direct + carry;
}

export function carryoverIntoMonth(
  name: string,
  month: string,
  advances: Array<WithId<AdvanceDoc> | AdvanceDoc>,
  attendance: Array<WithId<AttendanceDoc> | AttendanceDoc>,
  fixedSalaries: Array<WithId<FixedSalaryDoc> | FixedSalaryDoc>,
  salaries: Array<WithId<SalaryDoc> | SalaryDoc>,
  staff?: EmployeeDoc | null
): number {
  return Math.max(
    0,
    salaryAdvanceFor(name, month, advances, attendance, fixedSalaries, salaries, staff) -
      directAdvancesFor(name, month, advances)
  );
}

/** Display payable for a salary row (can be negative). */
export function payableForSalary(
  sal: { name: string; month: string; amount: number },
  advances: Array<WithId<AdvanceDoc> | AdvanceDoc>,
  attendance: Array<WithId<AttendanceDoc> | AttendanceDoc>,
  fixedSalaries: Array<WithId<FixedSalaryDoc> | FixedSalaryDoc>,
  salaries: Array<WithId<SalaryDoc> | SalaryDoc>,
  staff?: EmployeeDoc | null
): number {
  return num(sal.amount) - salaryAdvanceFor(sal.name, sal.month, advances, attendance, fixedSalaries, salaries, staff);
}

export function payableForSalaryNonNegative(
  sal: { name: string; month: string; amount: number },
  advances: Array<WithId<AdvanceDoc> | AdvanceDoc>,
  attendance: Array<WithId<AttendanceDoc> | AttendanceDoc>,
  fixedSalaries: Array<WithId<FixedSalaryDoc> | FixedSalaryDoc>,
  salaries: Array<WithId<SalaryDoc> | SalaryDoc>,
  staff?: EmployeeDoc | null
): number {
  return Math.max(0, payableForSalary(sal, advances, attendance, fixedSalaries, salaries, staff));
}

/** Classic calcSalaryForMonth + incentives/tips from React HR. */
export function calcPayrollForMonth(args: {
  name: string;
  month: string;
  staff?: EmployeeDoc | null;
  fixedSalaries: Array<WithId<FixedSalaryDoc> | FixedSalaryDoc>;
  attendance: Array<WithId<AttendanceDoc> | AttendanceDoc>;
  advances: Array<WithId<AdvanceDoc> | AdvanceDoc>;
  salaries?: Array<WithId<SalaryDoc> | SalaryDoc>;
  incentives?: Array<WithId<IncentiveDoc> | IncentiveDoc>;
  tips?: Array<WithId<TipDoc> | TipDoc>;
  extraDeductions?: number;
}): PayrollResult {
  const salaries = args.salaries || [];
  const monthlyFixed = fixedSalaryFor(args.name, args.fixedSalaries, args.staff);
  const stats = attendanceStatsForMonth(
    args.name,
    args.month,
    args.attendance,
    (args.staff as { id?: string } | null | undefined)?.id
  );
  let earned = 0;
  const type = args.staff?.salaryType || "monthly";
  if (type === "daily" && num(args.staff?.dailyWage) > 0) {
    earned = num(args.staff?.dailyWage) * stats.presentEq;
  } else if (type === "hourly" && num(args.staff?.hourlyRate) > 0) {
    earned = num(args.staff?.hourlyRate) * 8 * stats.presentEq;
  } else {
    earned = salaryEarnedFromAttendance(monthlyFixed, stats.presentEq);
  }

  const directAdv = directAdvancesFor(args.name, args.month, args.advances);
  const carryIn = carryoverIntoMonth(
    args.name,
    args.month,
    args.advances,
    args.attendance,
    args.fixedSalaries,
    salaries,
    args.staff
  );
  const advances = directAdv + carryIn;
  const leaveDeduction = salaryLeaveDeduction(monthlyFixed, stats);
  const incentives = incentivesForMonth(args.name, args.month, args.incentives || []);
  const tips = tipsForMonth(args.name, args.month, args.tips || []);
  const deductions = advances + leaveDeduction + num(args.extraDeductions);
  // Can be negative when advances exceed earned — show minus & carry to next month
  const monthEndPayable = earned + incentives + tips - advances - leaveDeduction - num(args.extraDeductions);
  const net = monthEndPayable;
  const carryOut = Math.max(0, -monthEndPayable);
  const settled = isSalaryMonthSettled(args.name, args.month, salaries);

  return {
    name: args.name,
    month: args.month,
    presentEquivalent: stats.presentEq,
    monthlyFixed,
    earned,
    advances,
    directAdvances: directAdv,
    carryIn,
    carryOut,
    leaveDeduction,
    incentives,
    tips,
    deductions,
    net,
    monthEndPayable,
    settled,
    absent: stats.absent,
    half: stats.half
  };
}

export function leaveDays(fromDate: string, toDate: string): number {
  const a = Date.parse(String(fromDate).slice(0, 10));
  const b = Date.parse(String(toDate).slice(0, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

export function monthISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function attendanceDatesForMonth(month: string, today = new Date()): string[] {
  const m = String(month || "").slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return [];
  const lastDay = new Date(y, mo, 0).getDate();
  const cur = monthISO(today);
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (m > cur) return [];
  let maxDay = lastDay;
  if (m === cur) maxDay = Math.min(lastDay, parseInt(todayISO.slice(8, 10), 10));
  const out: string[] = [];
  for (let d = 1; d <= maxDay; d++) out.push(`${m}-${String(d).padStart(2, "0")}`);
  return out;
}
