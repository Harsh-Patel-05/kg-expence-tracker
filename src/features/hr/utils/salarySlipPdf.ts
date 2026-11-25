import type {
  AdvanceDoc,
  AttendanceDoc,
  EmployeeDoc,
  FixedSalaryDoc,
  IncentiveDoc,
  SalaryDoc,
  TipDoc
} from "../types";
import type { WithId } from "@/features/pos/hooks/useRestaurantCollection";
import {
  attendanceDatesForMonth,
  attendanceMatchesStaff,
  attendanceRowStatus,
  attendanceStatsForMonth,
  calcPayrollForMonth,
  DAYS_IN_MONTH,
  salaryDailyRate
} from "./payroll";
import { escapeHtml, printHtmlDocument } from "@/lib/printHtmlDocument";
import { inr, isoDate, num } from "@/lib/utils";

function formatMonthLongLabel(monthYYYYMM: string) {
  const key = String(monthYYYYMM || "").slice(0, 7);
  const parts = key.split("-").map(Number);
  if (!parts[0] || !parts[1]) return key || "—";
  const d = new Date(parts[0], parts[1] - 1, 1);
  return d.toLocaleDateString("hi-IN", { month: "long", year: "numeric" });
}

function formatPayModeLabel(mode?: string) {
  const m = String(mode || "cash").toLowerCase();
  if (m === "online" || m === "upi" || m === "bank") return "ऑनलाइन";
  if (m === "cash") return "नकद";
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : "नकद";
}

function advanceIsOnline(a: AdvanceDoc | Record<string, unknown>) {
  const m = String((a as any).method || (a as any).paidFrom || "cash").toLowerCase();
  return m === "online" || m === "upi" || m === "bank";
}

function formatSlipDate(iso: string) {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
  const [y, mo, day] = s.split("-").map(Number);
  const d = new Date(y, mo - 1, day);
  return d.toLocaleDateString("hi-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function attendanceStatusMark(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "present" || s === "p") {
    return { mark: "✓", label: "उपस्थित", color: "#1a7a3a", bg: "#e8f6ec" };
  }
  if (s === "absent" || s === "a") {
    return { mark: "✗", label: "अनुपस्थित", color: "#b91c1c", bg: "#fde8e8" };
  }
  if (s === "half-day" || s === "half" || s === "h") {
    return { mark: "½", label: "आधा दिन", color: "#b45309", bg: "#fff4e5" };
  }
  return { mark: "—", label: "चिह्नित नहीं", color: "#777", bg: "#f5f5f5" };
}

export function buildStaffSalarySlipHtml(args: {
  name: string;
  month: string;
  staff?: EmployeeDoc | null;
  fixedSalaries: Array<WithId<FixedSalaryDoc>>;
  attendance: Array<WithId<AttendanceDoc>>;
  advances: Array<WithId<AdvanceDoc>>;
  salaries: Array<WithId<SalaryDoc>>;
  incentives?: Array<WithId<IncentiveDoc>>;
  tips?: Array<WithId<TipDoc>>;
}) {
  const { name, month } = args;
  const staffId = (args.staff as { id?: string } | null | undefined)?.id || null;
  const s = calcPayrollForMonth({
    name,
    month,
    staff: args.staff,
    fixedSalaries: args.fixedSalaries,
    attendance: args.attendance,
    advances: args.advances,
    salaries: args.salaries,
    incentives: args.incentives,
    tips: args.tips
  });
  const stats = attendanceStatsForMonth(name, month, args.attendance, staffId);
  const monthLabel = formatMonthLongLabel(month);
  const monthKey = String(month || "").slice(0, 7);
  const advances = args.advances
    .filter(
      (a) =>
        !(a as any).isDeleted &&
        String(a.name || "").toLowerCase() === name.toLowerCase() &&
        String(a.month || a.date || "").slice(0, 7) === monthKey
    )
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const attByDate: Record<string, AttendanceDoc | Record<string, unknown>> = {};
  args.attendance.forEach((a) => {
    if (!attendanceMatchesStaff(a, name, staffId)) return;
    if (String(a.date || "").slice(0, 7) !== monthKey) return;
    attByDate[String(a.date).slice(0, 10)] = a;
  });
  const salaryRec = args.salaries.find(
    (r) =>
      String(r.name || "").toLowerCase() === name.toLowerCase() &&
      String(r.month || "").slice(0, 7) === monthKey &&
      r.status === "paid"
  );
  const payMode = salaryRec ? formatPayModeLabel(String(salaryRec.paymentMethod || "cash")) : "—";
  const payDate = salaryRec ? formatSlipDate(String(salaryRec.paidAt || isoDate())) : "—";
  const statusLabel = s.settled ? "भुगतान / बंद" : "खुला";
  const advCash = advances.filter((a) => !advanceIsOnline(a)).reduce((t, a) => t + num(a.amount), 0);
  const advOnline = advances.filter((a) => advanceIsOnline(a)).reduce((t, a) => t + num(a.amount), 0);
  const toPay = Math.round(num(s.monthEndPayable));
  const dailyAmt = Math.round(salaryDailyRate(s.monthlyFixed));
  const earnedAmt = Math.round(num(s.earned));
  const leaveDays = num(s.absent) + num(s.half) * 0.5;
  const presentLabel = `${stats.presentEq.toFixed(stats.presentEq % 1 ? 1 : 0)}/${DAYS_IN_MONTH}`;

  const advRows =
    advances
      .map(
        (a) =>
          `<tr>
            <td style="padding:6px 4px;border-bottom:1px solid #ccc;">${escapeHtml(formatSlipDate(String(a.date)))}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #ccc;">${escapeHtml(formatPayModeLabel(String((a as any).method || (a as any).paidFrom)))}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #ccc;text-align:right;">${inr(a.amount)}</td>
          </tr>`
      )
      .join("") ||
    `<tr><td colspan="3" style="padding:8px 4px;color:#555;">इस महीने कोई अग्रिम नहीं</td></tr>`;

  const monthDays = attendanceDatesForMonth(monthKey);
  const attCells = monthDays
    .map((dIso) => {
      const entry = attByDate[dIso];
      const raw = entry ? attendanceRowStatus(entry) : "";
      const info = attendanceStatusMark(String(raw));
      const dayNum = parseInt(dIso.slice(8, 10), 10);
      return `<div style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:44px;height:48px;margin:3px;border:1px solid #ccc;border-radius:6px;background:${info.bg};">
        <div style="font-size:11px;font-weight:700;color:#333;">${dayNum}</div>
        <div style="font-size:18px;font-weight:900;line-height:1;color:${info.color};" title="${escapeHtml(info.label)}">${info.mark}</div>
      </div>`;
    })
    .join("");
  const attTableRows =
    monthDays
      .map((dIso) => {
        const entry = attByDate[dIso];
        const raw = entry ? attendanceRowStatus(entry) : "";
        const info = attendanceStatusMark(String(raw));
        return `<tr>
        <td style="padding:5px 4px;border-bottom:1px solid #ddd;">${escapeHtml(formatSlipDate(dIso))}</td>
        <td style="padding:5px 4px;border-bottom:1px solid #ddd;text-align:center;font-size:18px;font-weight:900;color:${info.color};background:${info.bg};">${info.mark}</td>
        <td style="padding:5px 4px;border-bottom:1px solid #ddd;color:${info.color};font-weight:700;">${escapeHtml(info.label)}</td>
      </tr>`;
      })
      .join("") ||
    `<tr><td colspan="3" style="padding:8px 4px;color:#555;">कोई उपस्थिति दर्ज नहीं</td></tr>`;

  const carryNote =
    num(s.carryOut) > 0
      ? `<div style="margin:8px 0 0;padding:8px 10px;border:1px solid #f5c2c2;background:#fff5f5;border-radius:8px;font-size:12px;font-weight:700;color:#b91c1c;">
          अग्रिम वेतन से अधिक — शेष ${inr(Math.round(num(s.carryOut)))} अगले महीने में कैरि-फॉरवर्ड
        </div>`
      : num(s.carryIn) > 0
        ? `<div style="margin:8px 0 0;padding:8px 10px;border:1px solid #fde68a;background:#fffbeb;border-radius:8px;font-size:12px;font-weight:700;color:#92400e;">
            पिछले महीने से कैरि-फॉरवर्ड अग्रिम: ${inr(Math.round(num(s.carryIn)))}
          </div>`
        : "";

  return `
  <div class="slip" style="border:1px solid #333;padding:16px;margin:0 0 18px;background:#fff;color:#111;font-family:'Noto Sans Devanagari',Segoe UI,system-ui,sans-serif;page-break-inside:avoid;">
    <div style="text-align:center;border-bottom:2px solid #e87a3a;padding-bottom:12px;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:#e87a3a;">द किलोग्राम · वेतन पर्ची</div>
      <div style="font-size:26px;font-weight:900;margin-top:8px;color:#111;">${escapeHtml(name)}</div>
      <div style="font-size:14px;font-weight:700;margin-top:4px;color:#333;">${escapeHtml(monthLabel)} की वेतन पर्ची</div>
      <div style="font-size:12px;color:#555;margin-top:4px;">जारी: ${escapeHtml(formatSlipDate(isoDate()))} · स्थिति: ${statusLabel}</div>
      <div style="font-size:11px;color:#777;margin-top:4px;">वेतन गणना: निश्चित ${DAYS_IN_MONTH} दिन के आधार पर (महीने में 28/30/31 दिन हो — वेतन वही)</div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
      <tr>
        <td style="width:20%;padding:8px;border:1px solid #bbb;background:#f7f7f7;">
          <div style="font-size:10px;color:#555;font-weight:700;">मासिक वेतन</div>
          <div style="font-size:16px;font-weight:800;margin-top:4px;">${inr(s.monthlyFixed)}</div>
          <div style="font-size:10px;color:#555;margin-top:2px;">${DAYS_IN_MONTH} दिन · ${inr(dailyAmt)}/दिन</div>
        </td>
        <td style="width:20%;padding:8px;border:1px solid #bbb;background:#f7f7f7;">
          <div style="font-size:10px;color:#555;font-weight:700;">अर्जित वेतन</div>
          <div style="font-size:16px;font-weight:800;margin-top:4px;">${inr(earnedAmt)}</div>
          <div style="font-size:10px;color:#555;margin-top:2px;">उपस्थिति ${presentLabel} दिन · ${inr(dailyAmt)}/दिन</div>
        </td>
        <td style="width:20%;padding:8px;border:1px solid #bbb;background:#f7f7f7;">
          <div style="font-size:10px;color:#555;font-weight:700;">अग्रिम</div>
          <div style="font-size:16px;font-weight:800;margin-top:4px;">${inr(Math.round(s.advances))}</div>
          <div style="font-size:10px;color:#555;margin-top:2px;">नकद ${inr(Math.round(advCash))} · ऑनलाइन ${inr(Math.round(advOnline))}</div>
        </td>
        <td style="width:20%;padding:8px;border:1px solid #bbb;background:#f7f7f7;">
          <div style="font-size:10px;color:#555;font-weight:700;">छुट्टी कटौती</div>
          <div style="font-size:16px;font-weight:800;margin-top:4px;">${inr(Math.round(s.leaveDeduction || 0))}</div>
          <div style="font-size:10px;color:#555;margin-top:2px;">${leaveDays.toFixed(1)} दिन × ${inr(dailyAmt)}</div>
        </td>
        <td style="width:20%;padding:8px;border:1px solid #e87a3a;background:#fde8d8;">
          <div style="font-size:10px;color:#555;font-weight:700;">${s.settled ? "भुगतान राशि" : "देय राशि"}</div>
          <div style="font-size:18px;font-weight:900;margin-top:4px;color:${toPay < 0 ? "#b91c1c" : "#111"};">${inr(toPay)}</div>
        </td>
      </tr>
    </table>
    ${carryNote}

    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
      <tr>
        <td style="padding:8px;border:1px solid #bbb;"><div style="font-size:10px;color:#555;font-weight:700;">भुगतान तरीका</div><div style="font-weight:800;margin-top:3px;">${escapeHtml(s.settled ? payMode : "लंबित")}</div></td>
        <td style="padding:8px;border:1px solid #bbb;"><div style="font-size:10px;color:#555;font-weight:700;">भुगतान तिथि</div><div style="font-weight:800;margin-top:3px;">${escapeHtml(s.settled ? payDate : "—")}</div></td>
        <td style="padding:8px;border:1px solid #bbb;"><div style="font-size:10px;color:#555;font-weight:700;">उपस्थिति रिपोर्ट</div><div style="font-weight:800;margin-top:3px;"><span style="color:#1a7a3a;">✓ ${stats.present}</span> · <span style="color:#b91c1c;">✗ ${stats.absent}</span>${stats.half ? ` · ½ ${stats.half}` : ""} · <strong>${presentLabel} दिन</strong></div></td>
      </tr>
    </table>

    <div style="font-size:12px;font-weight:800;color:#e87a3a;margin:12px 0 6px;">अग्रिम — तिथि · तरीका (नकद/ऑनलाइन) · राशि</div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #333;font-size:10px;">तिथि</th>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #333;font-size:10px;">तरीका</th>
          <th style="text-align:right;padding:6px 4px;border-bottom:2px solid #333;font-size:10px;">राशि</th>
        </tr>
      </thead>
      <tbody>${advRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding:8px 4px;font-weight:800;">कुल अग्रिम (इस महीने)</td>
          <td style="padding:8px 4px;text-align:right;font-weight:800;">${inr(Math.round(s.directAdvances || 0))}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:4px 4px;font-weight:700;color:#555;">नकद कुल</td>
          <td style="padding:4px 4px;text-align:right;font-weight:700;">${inr(Math.round(advCash))}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:4px 4px;font-weight:700;color:#555;">ऑनलाइन कुल</td>
          <td style="padding:4px 4px;text-align:right;font-weight:700;">${inr(Math.round(advOnline))}</td>
        </tr>
      </tfoot>
    </table>

    <div style="font-size:12px;font-weight:800;color:#e87a3a;margin:16px 0 6px;">दिनवार उपस्थिति — ✓ उपस्थित · ✗ अनुपस्थित · कुल ${presentLabel} दिन</div>
    <div style="margin-bottom:10px;line-height:1;">${attCells || `<div style="color:#555;padding:8px 0;">कोई उपस्थिति दर्ज नहीं</div>`}</div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #333;font-size:10px;">तिथि</th>
          <th style="text-align:center;padding:6px 4px;border-bottom:2px solid #333;font-size:10px;">चिह्न</th>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #333;font-size:10px;">स्थिति</th>
        </tr>
      </thead>
      <tbody>${attTableRows}</tbody>
    </table>

    <table style="width:100%;margin-top:28px;border-collapse:collapse;">
      <tr>
        <td style="width:50%;padding:8px 12px 0 0;"><div style="border-bottom:1px solid #111;height:32px;"></div><div style="font-size:11px;color:#555;margin-top:6px;">कर्मचारी हस्ताक्षर — ${escapeHtml(name)}</div></td>
        <td style="width:50%;padding:8px 0 0 12px;"><div style="border-bottom:1px solid #111;height:32px;"></div><div style="font-size:11px;color:#555;margin-top:6px;">अधिकृत · द किलोग्राम</div></td>
      </tr>
    </table>
  </div>`;
}

export function downloadStaffSalaryPdf(args: {
  names: string[];
  month: string;
  staff: Array<WithId<EmployeeDoc>>;
  fixedSalaries: Array<WithId<FixedSalaryDoc>>;
  attendance: Array<WithId<AttendanceDoc>>;
  advances: Array<WithId<AdvanceDoc>>;
  salaries: Array<WithId<SalaryDoc>>;
  incentives?: Array<WithId<IncentiveDoc>>;
  tips?: Array<WithId<TipDoc>>;
}) {
  const monthLabel = formatMonthLongLabel(args.month);
  const slips = args.names.map((name) => {
    const emp = args.staff.find((s) => s.name.toLowerCase() === name.toLowerCase());
    return buildStaffSalarySlipHtml({ ...args, name, staff: emp });
  });
  const bodyHtml = `
    <div style="margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e87a3a;color:#111;font-family:'Noto Sans Devanagari',Segoe UI,system-ui,sans-serif;">
      <div style="font-size:18px;font-weight:900;">द किलोग्राम — ${escapeHtml(monthLabel)} वेतन पर्ची${args.names.length > 1 ? "याँ" : ""}</div>
      <div style="font-size:13px;margin-top:4px;font-weight:700;">कर्मचारी: ${escapeHtml(args.names.join(", "))}</div>
      <div style="font-size:12px;color:#555;margin-top:2px;">प्रिंट डायलॉग में Save as PDF चुनें · पॉप-अप की जरूरत नहीं</div>
    </div>
    ${slips.join("\n")}`;
  printHtmlDocument(bodyHtml, { title: `वेतन पर्ची — ${args.names.join(", ")} — ${monthLabel}` });
}
