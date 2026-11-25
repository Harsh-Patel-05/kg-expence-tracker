import { num } from "@/lib/utils";
import { isPurchasePaid } from "@/features/suppliers/utils/ledger";

export type PAPeriod = "week" | "month" | "custom";

export type PADateRange = { from: Date; to: Date; days: number };

export function getPADateRange(period: PAPeriod, customFrom?: string, customTo?: string): PADateRange | null {
  const now = new Date();
  if (period === "week") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(now);
    mon.setDate(diff);
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    return { from: mon, to: sun, days: 7 };
  }
  if (period === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to, days: to.getDate() };
  }
  if (!customFrom || !customTo) return null;
  const from = new Date(customFrom + "T00:00:00");
  const to = new Date(customTo + "T23:59:59");
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  return { from, to, days };
}

const GROCERY_KEYS = new Set([
  "vegetables",
  "kirana",
  "milk",
  "tea",
  "paneer",
  "cheese",
  "dhaniya",
  "capsicum",
  "groundnut_oil",
  "cotton_seed_oil",
  "butter",
  "salt",
  "gas",
  "staff_food"
]);
const FIXED_BILL_KEYS = new Set([
  "water_bill",
  "maintenance",
  "limbu_marcha",
  "cleaning",
  "kachara",
  "packaging",
  "kitchen",
  "shop_other",
  "utilities"
]);

export type ExpenseCategories = {
  grocery: number;
  rent: number;
  lightBill: number;
  fixedBills: number;
  salary: number;
  supplier: number;
  others: number;
};

export type CostBreakdownItem = { label: string; value: number; color: string };

const BREAKDOWN_META: Array<{ key: keyof ExpenseCategories; label: string; color: string }> = [
  { key: "grocery", label: "Grocery / Kitchen", color: "#E87A3A" },
  { key: "salary", label: "Staff Salary", color: "#C46A2E" },
  { key: "supplier", label: "Supplier Payments", color: "#E89B6D" },
  { key: "rent", label: "Rent", color: "#A04A35" },
  { key: "lightBill", label: "Light Bill", color: "#D4782E" },
  { key: "fixedBills", label: "Fixed Bills", color: "#B8552A" },
  { key: "others", label: "Others", color: "#E87A3A" }
];

export type ProfitAnalysisInput = {
  sales: Array<{ date?: string; amount?: number; total?: number }>;
  expenses: Array<{ date?: string; amount?: number; category?: string; type?: string }>;
  supplierPayments: Array<{ date?: string; amount?: number }>;
  purchases: Array<{ date?: string; price?: number; paidStatus?: string; paymentStatus?: string; status?: string }>;
  fixedSalaries: Array<{ month?: string; amount?: number }>;
  salaries: Array<{ date?: string; month?: string; amount?: number }>;
  reminders: Array<{ done?: boolean; completed?: boolean; dueDate?: string; date?: string; title?: string }>;
};

export type ProfitAnalysisResult = {
  totalSales: number;
  totalCosts: number;
  netProfit: number;
  marginPct: string;
  expCats: ExpenseCategories;
  breakdown: CostBreakdownItem[];
  weeks: Array<{ label: string; sales: number; costs: number; profit: number }>;
};

function inRange(dateStr: string | undefined, from: Date, to: Date) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

export function computeProfitAnalysis(range: PADateRange, data: ProfitAnalysisInput): ProfitAnalysisResult {
  const { from, to, days } = range;

  const totalSales = (data.sales || [])
    .filter((s) => inRange(s.date, from, to))
    .reduce((sum, s) => sum + num(s.amount || s.total || 0), 0);

  const expCats: ExpenseCategories = {
    grocery: 0,
    rent: 0,
    lightBill: 0,
    fixedBills: 0,
    salary: 0,
    supplier: 0,
    others: 0
  };

  (data.expenses || [])
    .filter((e) => inRange(e.date, from, to))
    .forEach((e) => {
      const k = String(e.category || e.type || "").toLowerCase();
      const amt = num(e.amount);
      if (k === "rent" || k === "shop_rent") expCats.rent += amt;
      else if (k === "light_bill") expCats.lightBill += amt;
      else if (GROCERY_KEYS.has(k)) expCats.grocery += amt;
      else if (FIXED_BILL_KEYS.has(k)) expCats.fixedBills += amt;
      else expCats.others += amt;
    });

  (data.supplierPayments || [])
    .filter((p) => inRange(p.date, from, to))
    .forEach((p) => {
      expCats.supplier += num(p.amount);
    });

  (data.purchases || [])
    .filter((p) => isPurchasePaid(p) && inRange(p.date, from, to))
    .forEach((p) => {
      expCats.supplier += num(p.price);
    });

  const monthsInRange = new Set<string>();
  let d = new Date(from);
  while (d <= to) {
    monthsInRange.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  (data.fixedSalaries || []).forEach((s) => {
    if (s.month && monthsInRange.has(s.month)) expCats.salary += num(s.amount);
  });
  (data.salaries || [])
    .filter((s) => inRange(s.date || (s.month ? `${s.month}-01` : undefined), from, to))
    .forEach((s) => {
      expCats.salary += num(s.amount);
    });

  const totalCosts = Object.values(expCats).reduce((a, b) => a + b, 0);
  const netProfit = totalSales - totalCosts;
  const marginPct = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : "0";

  const breakdown = BREAKDOWN_META.map((m) => ({
    label: m.label,
    value: expCats[m.key],
    color: m.color
  })).filter((x) => x.value > 0);

  const fmtShort = (dt: Date) => dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  const weeks: ProfitAnalysisResult["weeks"] = [];
  let wStart = new Date(from);
  wStart.setHours(0, 0, 0, 0);
  const dow = wStart.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  wStart.setDate(wStart.getDate() + offset);

  while (wStart <= to) {
    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 6);
    wEnd.setHours(23, 59, 59, 999);

    const wSales = (data.sales || [])
      .filter((s) => {
        const dd = new Date(s.date || "");
        return dd >= wStart && dd <= wEnd;
      })
      .reduce((s, x) => s + num(x.amount || x.total || 0), 0);

    const wCosts =
      (data.expenses || [])
        .filter((e) => {
          const dd = new Date(e.date || "");
          return dd >= wStart && dd <= wEnd;
        })
        .reduce((s, e) => s + num(e.amount), 0) +
      (data.supplierPayments || [])
        .filter((p) => {
          const dd = new Date(p.date || "");
          return dd >= wStart && dd <= wEnd;
        })
        .reduce((s, p) => s + num(p.amount), 0) +
      (data.purchases || [])
        .filter((p) => {
          if (!isPurchasePaid(p)) return false;
          const dd = new Date(p.date || "");
          return dd >= wStart && dd <= wEnd;
        })
        .reduce((s, p) => s + num(p.price), 0);

    weeks.push({
      label: `${fmtShort(wStart)} – ${fmtShort(wEnd)}`,
      sales: wSales,
      costs: wCosts,
      profit: wSales - wCosts
    });
    wStart.setDate(wStart.getDate() + 7);
  }

  return {
    totalSales,
    totalCosts,
    netProfit,
    marginPct,
    expCats,
    breakdown,
    weeks
  };
}

export type PendingBillRow = {
  id: string;
  title: string;
  subtitle: string;
  tag: "overdue" | "upcoming" | null;
  tagLabel: string;
};

export function computePendingBills(
  purchases: Array<{ id?: string; seller?: string; vendorName?: string; item?: string; date?: string; price?: number; total?: number; paidStatus?: string; paymentStatus?: string; status?: string }>,
  reminders: ProfitAnalysisInput["reminders"]
): PendingBillRow[] {
  const unpaidSup = (purchases || [])
    .filter((p) => !isPurchasePaid(p))
    .map((p, i) => {
      const due = String(p.date || "").slice(0, 10);
      const daysLeft = due ? Math.ceil((new Date(due).getTime() - Date.now()) / 86400000) : null;
      let tag: PendingBillRow["tag"] = null;
      let tagLabel = "";
      if (daysLeft !== null) {
        if (daysLeft < 0) {
          tag = "overdue";
          tagLabel = `Overdue ${Math.abs(daysLeft)}d`;
        } else {
          tag = "upcoming";
          tagLabel = `In ${daysLeft}d`;
        }
      }
      return {
        id: p.id || `p-${i}`,
        title: `${p.seller || p.vendorName || "Supplier"} — ${p.item || "Bill"}`,
        subtitle: `${due || "No date"} · ₹${num(p.price ?? p.total).toLocaleString("en-IN")}`,
        tag,
        tagLabel
      };
    });

  const pendingRem = (reminders || [])
    .filter((r) => !r.done && !r.completed)
    .map((r, i) => {
      const due = r.dueDate || r.date || "";
      const daysLeft = due ? Math.ceil((new Date(due).getTime() - Date.now()) / 86400000) : null;
      let tag: PendingBillRow["tag"] = null;
      let tagLabel = "";
      if (daysLeft !== null) {
        if (daysLeft < 0) {
          tag = "overdue";
          tagLabel = `Overdue ${Math.abs(daysLeft)}d`;
        } else {
          tag = "upcoming";
          tagLabel = `In ${daysLeft}d`;
        }
      }
      return {
        id: `r-${i}`,
        title: r.title || "Bill",
        subtitle: due || "No date",
        tag,
        tagLabel
      };
    });

  return [...unpaidSup, ...pendingRem];
}