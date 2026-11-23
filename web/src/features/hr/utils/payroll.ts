import { num } from "@/lib/utils";
import type {
  AdvanceDoc,
  AttendanceDoc,
  EmployeeDoc,
  FixedSalaryDoc,
  IncentiveDoc,
  PayrollResult,
  TipDoc
} from "../types";
import type { WithId } from "@/features/pos/hooks/useRestaurantCollection";

/** Port of vanilla attendance presentEquivalent */
export function presentEquivalent(status: string): number {
  const s = String(status || "").toLowerCase();
  if (s === "present" || s === "late") return 1;
  if (s === "half-day") return 0.5;
  return 0;
}

export function fixedSalaryFor(name: string, fixed: Array<WithId<FixedSalaryDoc> | FixedSalaryDoc>, staff?: EmployeeDoc | null) {
  if (staff?.monthlySalary && num(staff.monthlySalary) > 0) return num(staff.monthlySalary);
  const rows = fixed
    .filter((f) => String(f.name || "").toLowerCase() === String(name).toLowerCase())
    .sort((a, b) => String(b.joinDate || "").localeCompare(String(a.joinDate || "")));
  return num(rows[0]?.amount);
}

export function attendanceStatsForMonth(
  name: string,
  month: string,
  attendance: Array<WithId<AttendanceDoc> | AttendanceDoc>
) {
  const rows = attendance.filter(
    (a) => String(a.name || "").toLowerCase() === String(name).toLowerCase() && String(a.date || "").slice(0, 7) === month
  );
  let presentEq = 0;
  let present = 0;
  let half = 0;
  let absent = 0;
  let late = 0;
  rows.forEach((r) => {
    const st = String(r.status || "");
    const eq = presentEquivalent(st);
    presentEq += eq;
    if (st === "present") present++;
    else if (st === "half-day") half++;
    else if (st === "late") {
      late++;
      present++;
    } else if (st === "absent") absent++;
  });
  return { presentEq, present, half, absent, late, daysMarked: rows.length };
}

export function advancesForMonth(name: string, month: string, advances: Array<WithId<AdvanceDoc> | AdvanceDoc>) {
  return advances
    .filter((a) => String(a.name || "").toLowerCase() === String(name).toLowerCase() && String(a.month || "").slice(0, 7) === month)
    .reduce((s, a) => s + num(a.amount) - num(a.recovered), 0);
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

/** Vanilla: daily = monthly/30 × presentEq */
export function calcPayrollForMonth(args: {
  name: string;
  month: string;
  staff?: EmployeeDoc | null;
  fixedSalaries: Array<WithId<FixedSalaryDoc> | FixedSalaryDoc>;
  attendance: Array<WithId<AttendanceDoc> | AttendanceDoc>;
  advances: Array<WithId<AdvanceDoc> | AdvanceDoc>;
  incentives?: Array<WithId<IncentiveDoc> | IncentiveDoc>;
  tips?: Array<WithId<TipDoc> | TipDoc>;
  extraDeductions?: number;
}): PayrollResult {
  const monthlyFixed = fixedSalaryFor(args.name, args.fixedSalaries, args.staff);
  const stats = attendanceStatsForMonth(args.name, args.month, args.attendance);
  let earned = 0;
  const type = args.staff?.salaryType || "monthly";
  if (type === "daily" && num(args.staff?.dailyWage) > 0) {
    earned = num(args.staff?.dailyWage) * stats.presentEq;
  } else if (type === "hourly" && num(args.staff?.hourlyRate) > 0) {
    // approximate 8h day
    earned = num(args.staff?.hourlyRate) * 8 * stats.presentEq;
  } else {
    earned = (monthlyFixed / 30) * stats.presentEq;
  }
  const advances = advancesForMonth(args.name, args.month, args.advances);
  const incentives = incentivesForMonth(args.name, args.month, args.incentives || []);
  const tips = tipsForMonth(args.name, args.month, args.tips || []);
  const deductions = advances + num(args.extraDeductions);
  const net = Math.max(0, earned + incentives + tips - deductions);
  return {
    name: args.name,
    month: args.month,
    presentEquivalent: stats.presentEq,
    monthlyFixed,
    earned,
    advances,
    incentives,
    tips,
    deductions,
    net,
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
