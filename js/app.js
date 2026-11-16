/* global Chart */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Parse price from Excel cells: 120, "120", "Rs 120", "₹1,200", "200/-" */
function parseMenuPrice(value) {
  if (value == null || value === "") return NaN;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  let s = String(value).trim();
  s = s.replace(/^\u20b9\s*/i, "").replace(/^rs\.?\s*/i, "").replace(/,/g, "").replace(/\/-?\s*$/i, "").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeExcelRow(r) {
  const o = {};
  for (const k of Object.keys(r || {})) o[String(k).trim()] = r[k];
  return o;
}

function pickMenuName(r) {
  const keys = [
    "name",
    "Name",
    "NAME",
    "item",
    "Item",
    "ITEM",
    "dish",
    "Dish",
    "menu",
    "Menu",
    "Item Name",
    "Menu Item",
    "Product"
  ];
  for (const k of keys) {
    if (r[k] != null && String(r[k]).trim()) return String(r[k]).trim();
  }
  const first = Object.keys(r).find((k) => {
    const v = r[k];
    return typeof v === "string" && String(v).trim() && Number.isNaN(parseMenuPrice(v));
  });
  return first ? String(r[first]).trim() : "";
}

function pickMenuPrice(r) {
  const keys = [
    "price",
    "Price",
    "PRICE",
    "rate",
    "Rate",
    "RATE",
    "mrp",
    "MRP",
    "amount",
    "Amount",
    "AMOUNT",
    "rs",
    "Rs",
    "RS",
    "Cost",
    "cost"
  ];
  for (const k of keys) {
    if (r[k] === undefined || r[k] === "") continue;
    const p = parseMenuPrice(r[k]);
    if (Number.isFinite(p) && p >= 0) return p;
  }
  for (const k of Object.keys(r)) {
    if (!/price|rate|mrp|amount|rs|cost|amt|inr|rupee/i.test(String(k))) continue;
    const p = parseMenuPrice(r[k]);
    if (Number.isFinite(p) && p >= 0 && p <= 999999) return p;
  }
  return NaN;
}

function pickMenuCategory(r) {
  const keys = ["category", "Category", "CATEGORY", "cat", "Cat", "Type", "type"];
  for (const k of keys) {
    if (r[k] != null && String(r[k]).trim()) return String(r[k]).trim();
  }
  return "General";
}

function prepLabel(prep, lang) {
  const p = String(prep || "regular");
  if (lang === "hi") {
    if (p === "swaminarayan") return "स्वामिनारायण";
    return "रेग";
  }
  if (p === "swaminarayan") return "Swaminarayan";
  return "Regular";
}

function deriveBaseAndVariant(name) {
  const raw = String(name || "").trim();
  // match: "(500 gms)" or "500 gms" or "1 kg" at end
  const m =
    raw.match(/\((\s*\d+(?:\.\d+)?\s*(?:kg|g|gm|gms)\s*)\)\s*$/i) ||
    raw.match(/(?:-|–|—)\s*(\d+(?:\.\d+)?\s*(?:kg|g|gm|gms))\s*$/i) ||
    raw.match(/\s(\d+(?:\.\d+)?\s*(?:kg|g|gm|gms))\s*$/i);
  if (!m) return { base: raw, variant: "" };
  const variant = String(m[1] || "").trim().replace(/\s+/g, " ");
  const base = raw
    .replace(m[0], "")
    .trim()
    .replace(/\s+/g, " ");
  return { base: base || raw, variant };
}

function variantToGrams(variant) {
  const s = String(variant || "").trim().toLowerCase();
  const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|gm|gms)\b/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  if (unit === "kg") return Math.round(n * 1000);
  return Math.round(n);
}

function formatVariantLabel(variant) {
  const g = variantToGrams(variant);
  if (g == null) return String(variant || "Default").trim() || "Default";
  if (g >= 1000 && g % 1000 === 0) return `${g / 1000} kg`;
  return `${g} g`;
}

function menuInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "KG";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function normalizeKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function money(v) {
  try {
    if (window.KG?.money?.formatINR) return window.KG.money.formatINR(v);
  } catch (_) {}
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(num(v));
}

function animateNumber(el, target, formatter, durationMs = 900) {
  if (!el) return;
  const to = num(target);
  const from = 0;
  const start = performance.now();
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // Cancel any previous animation on this element
  if (el.__raf) cancelAnimationFrame(el.__raf);

  const tick = (now) => {
    const t = Math.min(1, (now - start) / durationMs);
    const v = from + (to - from) * easeOutCubic(t);
    el.textContent = formatter ? formatter(v) : String(Math.round(v));
    if (t < 1) el.__raf = requestAnimationFrame(tick);
  };

  el.__raf = requestAnimationFrame(tick);
}

/** Format a Date using local calendar day (avoids UTC off-by-one in IST). */
function localISODate(d) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDay(iso) {
  const s = String(iso || "").slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

function todayISO() {
  return localISODate(new Date());
}
window.todayISO = todayISO;

function monthISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function byDateDesc(a, b) {
  return new Date(b.date || b.month) - new Date(a.date || a.month);
}

function isoAddDays(iso, deltaDays) {
  const d = parseLocalDay(iso);
  d.setDate(d.getDate() + deltaDays);
  return localISODate(d);
}

function startOfRangeISO(range) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "week") {
    const day = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - day);
    return localISODate(d);
  }
  if (range === "month") {
    d.setDate(1);
    return localISODate(d);
  }
  if (range === "year") {
    d.setMonth(0, 1);
    return localISODate(d);
  }
  return "0000-01-01";
}

function withinRange(dateISO, range) {
  const start = startOfRangeISO(range);
  const x = String(dateISO || "").slice(0, 10);
  if (!x) return false;
  return x >= start;
}

function dateInPeriod(dateISO, fromISO, toISO) {
  const x = String(dateISO || "").slice(0, 10);
  if (!x) return false;
  return x >= fromISO && x <= toISO;
}

function resolvePeriodRange(period) {
  const toISO = todayISO();
  const p = String(period || "");
  if (p.startsWith("cal-")) {
    const key = p.slice(4);
    const parts = key.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    if (y && m >= 1 && m <= 12) {
      const fromISO = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
      let endISO = localISODate(new Date(y, m, 0));
      if (endISO > toISO) endISO = toISO;
      if (fromISO > toISO) {
        return { fromISO: toISO, toISO, period: p, hint: "This month" };
      }
      const hint = parseLocalDay(fromISO).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      return { fromISO, toISO: endISO, period: p, hint };
    }
  }
  if (period === "today") {
    return { fromISO: toISO, toISO, period: "today", hint: "Today" };
  }
  if (period === "d7" || period === "7d") {
    return { fromISO: isoAddDays(toISO, -6), toISO, period: "d7", hint: "Last 7 days" };
  }
  if (period === "w2" || period === "2w") {
    return { fromISO: isoAddDays(toISO, -13), toISO, period: "w2", hint: "Last 2 weeks" };
  }
  if (period === "w3" || period === "3w") {
    return { fromISO: isoAddDays(toISO, -20), toISO, period: "w3", hint: "Last 3 weeks" };
  }
  if (period === "d30" || period === "30d") {
    return { fromISO: isoAddDays(toISO, -29), toISO, period: "d30", hint: "Last 30 days" };
  }
  if (period === "week") {
    return { fromISO: startOfRangeISO("week"), toISO, period: "week", hint: "This week" };
  }
  if (period === "month") {
    return { fromISO: startOfRangeISO("month"), toISO, period: "month", hint: "This month" };
  }
  if (period === "m2" || period === "2m") {
    const from = parseLocalDay(startOfRangeISO("month"));
    from.setMonth(from.getMonth() - 1);
    return { fromISO: localISODate(from), toISO, period: "m2", hint: "Last 2 months" };
  }
  if (period === "m3" || period === "3m") {
    const from = parseLocalDay(startOfRangeISO("month"));
    from.setMonth(from.getMonth() - 2);
    return { fromISO: localISODate(from), toISO, period: "m3", hint: "Last 3 months" };
  }
  if (period === "m6" || period === "6m") {
    const from = parseLocalDay(startOfRangeISO("month"));
    from.setMonth(from.getMonth() - 5);
    return { fromISO: localISODate(from), toISO, period: "m6", hint: "Last 6 months" };
  }
  if (period === "year") {
    return { fromISO: startOfRangeISO("year"), toISO, period: "year", hint: "This year" };
  }
  return { fromISO: startOfRangeISO("month"), toISO, period: "month", hint: "This month" };
}

function previousPeriodRange(fromISO, toISO) {
  const from = parseLocalDay(fromISO);
  const to = parseLocalDay(toISO);
  const days = Math.max(1, Math.round((to - from) / (24 * 3600 * 1000)) + 1);
  const prevTo = isoAddDays(fromISO, -1);
  const prevFrom = isoAddDays(prevTo, -(days - 1));
  return { fromISO: prevFrom, toISO: prevTo };
}

function deltaPct(curr, prev) {
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  if (Math.abs(prev) < 0.0001) {
    if (Math.abs(curr) < 0.0001) return 0;
    return curr > 0 ? 100 : -100;
  }
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function setDeltaEl(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  if (pct === null || pct === undefined || Number.isNaN(pct)) {
    el.textContent = "—";
    el.classList.remove("down", "flat");
    return;
  }
  const rounded = Math.round(pct * 10) / 10;
  const arrow = rounded > 0 ? "↑" : rounded < 0 ? "↓" : "→";
  el.textContent = `${arrow} ${Math.abs(rounded).toFixed(1)}%`;
  el.classList.toggle("down", rounded < 0);
  el.classList.toggle("flat", rounded === 0);
  if (rounded > 0) el.classList.remove("down", "flat");
}

function drawSparkline(canvasId, values, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const data = (values || []).map((v) => num(v));
  if (data.length < 2) return;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 3;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color || "rgba(91, 192, 235, 0.95)";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function lastNDaySeries(n, mapper) {
  const to = todayISO();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(mapper(isoAddDays(to, -i)));
  }
  return out;
}

function ordersInRange(fromISO, toISO) {
  return (state.orders || []).filter((o) => o?.date && dateInPeriod(o.date, fromISO, toISO));
}

function orderCountInRange(fromISO, toISO) {
  return ordersInRange(fromISO, toISO).length;
}

function paymentSplitInRange(fromISO, toISO) {
  let cash = 0;
  let upi = 0;
  let swiggy = 0;
  let zomato = 0;
  state.sales.forEach((s) => {
    if (!s?.date || !dateInPeriod(s.date, fromISO, toISO)) return;
    const a = saleAmounts(s);
    cash += a.cash;
    swiggy += a.swiggy;
    zomato += a.zomato;
    if (a.legacyOnline > 0 && a.swiggy === 0 && a.zomato === 0 && a.otherOnline === 0) upi += a.legacyOnline;
    else upi += a.otherOnline;
  });
  return { cash, upi, swiggy, zomato };
}

function formatPeriodRangeLabel(fromISO, toISO) {
  const f = parseLocalDay(fromISO);
  const t = parseLocalDay(toISO);
  if (fromISO === toISO) {
    return f.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
  }
  const a = f.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  const b = t.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `${a} – ${b}`;
}

function buildDayBuckets(fromISO, toISO) {
  const fromDate = parseLocalDay(fromISO);
  const toDate = parseLocalDay(toISO);
  const daysSpan = Math.max(1, Math.round((toDate - fromDate) / (24 * 3600 * 1000)) + 1);
  const buckets = [];
  for (let i = 0; i < daysSpan; i++) {
    const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + i);
    buckets.push({
      key: localISODate(d),
      label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    });
  }
  return buckets;
}

function buildMonthBuckets(fromISO, toISO) {
  const fromDate = parseLocalDay(fromISO);
  const toDate = parseLocalDay(toISO);
  fromDate.setDate(1);
  toDate.setDate(1);
  const buckets = [];
  const cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
  while (cur <= end) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
    buckets.push({
      key,
      label: cur.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return buckets;
}

function buildTrendBuckets(period, fromISO, toISO) {
  // Today / short windows: last 7 days so the line chart is readable; KPIs still use selected period
  if (period === "today" || period === "d7") {
    return buildDayBuckets(isoAddDays(toISO, -6), toISO);
  }
  if (period === "year" || period === "m2" || period === "m3" || period === "m6") {
    return buildMonthBuckets(fromISO, toISO);
  }
  return buildDayBuckets(fromISO, toISO);
}

function ensureDashboardMonthChips() {
  const host = document.getElementById("dashboardMonthChips");
  if (!host) return;
  const active =
    document.querySelector("#dashboardPeriodFilter .period-chip.active")?.dataset.period || "month";
  const now = parseLocalDay(todayISO());
  const chips = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const period = `cal-${key}`;
    const label = d.toLocaleDateString("en-IN", { month: "short" });
    chips.push(
      `<button type="button" class="period-chip${active === period ? " active" : ""}" data-period="${period}" onclick="setDashboardPeriod('${period}')">${label}</button>`
    );
  }
  host.innerHTML = chips.join("");
}

function expenseTotalOnDay(dateISO) {
  const d = String(dateISO || "").slice(0, 10);
  let total = 0;
  state.expenses.forEach((e) => {
    if (e.status === "paid" && String(e.date || "").slice(0, 10) === d) total += num(e.amount);
  });
  state.supplierPayments.forEach((p) => {
    if (String(p.date || "").slice(0, 10) === d) total += num(p.amount);
  });
  state.purchases.forEach((p) => {
    if (p.paidStatus === "paid" && String(p.date || "").slice(0, 10) === d) total += num(p.price);
  });
  state.salaries.forEach((s) => {
    if (s.status === "paid" && String(s.paidAt || "").slice(0, 10) === d) total += payableForSalaryNonNegative(s);
  });
  return total;
}

function salesTotalOnDay(dateISO) {
  const d = String(dateISO || "").slice(0, 10);
  return state.sales
    .filter((s) => String(s.date || "").slice(0, 10) === d)
    .reduce((sum, s) => sum + saleAmounts(s).total, 0);
}

function expenseTotalInMonth(monthKey) {
  let total = 0;
  state.expenses.forEach((e) => {
    if (e.status === "paid" && String(e.date || "").slice(0, 7) === monthKey) total += num(e.amount);
  });
  state.supplierPayments.forEach((p) => {
    if (String(p.date || "").slice(0, 7) === monthKey) total += num(p.amount);
  });
  state.purchases.forEach((p) => {
    if (p.paidStatus === "paid" && String(p.date || "").slice(0, 7) === monthKey) total += num(p.price);
  });
  state.salaries.forEach((s) => {
    if (s.status === "paid" && String(s.paidAt || "").slice(0, 7) === monthKey) total += payableForSalaryNonNegative(s);
  });
  return total;
}

function salesTotalInMonth(monthKey) {
  return state.sales
    .filter((s) => String(s.date || "").slice(0, 7) === monthKey)
    .reduce((sum, s) => sum + saleAmounts(s).total, 0);
}

function getDashboardPeriodRange() {
  const period = document.querySelector("#dashboardPeriodFilter .period-chip.active")?.dataset.period || "month";
  return resolvePeriodRange(period);
}

function syncPeriodChips(containerId, period) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.querySelectorAll(".period-chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.period === period);
  });
}

window.setDashboardPeriod = function (period) {
  ensureDashboardMonthChips();
  syncPeriodChips("dashboardPeriodFilter", period);
  renderDashboard();
};

window.setAnalyticsPeriod = function (period) {
  const sel = document.getElementById("analyticsRange");
  if (sel) sel.value = period;
  syncPeriodChips("analyticsPeriodFilter", period);
  renderAnalytics();
};

function daysUntil(iso) {
  const now = new Date();
  const a = parseLocalDay(localISODate(now));
  const b = parseLocalDay(iso);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

const state = {
  suppliers: [],
  staff: [],
  sales: [],
  purchases: [],
  menuItems: [],
  orders: [],
  supplierPayments: [],
  expenses: [],
  attendance: [],
  salaries: [],
  advances: [],
  inventory: [],
  inventoryMovements: [],
  stockLots: [],
  recurringExpenses: [],
  fixedSalaries: [],
  reminders: [],
  balanceTransfers: [],
  dailyClosings: [],
  documents: []
};

let api = null;
let loadingCount = 0;
let supplierTab = "manage";
let staffTab = "add";
let activeSection = "dashboard";

let posSalesInterval = null;

let salesOverviewChartRef = null;
let expenseBreakdownChartRef = null;
let salesExpenseChartRef = null;
let onlinePayoutChartRef = null;
let swiggySalesChartRef = null;
let zomatoSalesChartRef = null;
let paymentMixChartRef = null;
let cashOnlineMonthlyChartRef = null;
let listPeriod = { sales: "month", expenses: "month", purchases: "month" };
let methodChartRef = null;
let categoryExpenseChartRef = null;
let expenseItemMixChartRef = null;
let expenseItemTrendChartRef = null;
let expenseAnalyticsPeriod = "month";
let anCharts = {
  revExpProfit: null,
  expenseBreakdown: null,
  salesBreakdown: null,
  salaryMonthly: null,
  supplierPayments: null,
  profitTrend: null
};

let tempSupplierItems = [];
let editSupplierState = { id: null, name: "", items: [] };

// POS state (in-memory)
let posCart = []; // [{menuItemId,id,name,price,qty,note}]
let posTickets = []; // [{id,status,createdAt,cart,note,payMode,payCash,payOnline}]
let posActiveTicketId = "";

function loadPosTickets() {
  try {
    const raw = localStorage.getItem("kg_pos_tickets_v1");
    const arr = raw ? JSON.parse(raw) : [];
    posTickets = Array.isArray(arr) ? arr : [];
  } catch {
    posTickets = [];
  }
}

function savePosTickets() {
  try {
    localStorage.setItem("kg_pos_tickets_v1", JSON.stringify(posTickets.slice(0, 50)));
  } catch {}
}

function ticketSummary(t) {
  const cart = Array.isArray(t.cart) ? t.cart : [];
  const count = cart.reduce((s, it) => s + num(it.qty), 0);
  const total = cart.reduce((s, it) => s + num(it.price) * num(it.qty), 0);
  return { count, total };
}

function renderPosTickets() {
  const bar = document.getElementById("posTicketsBar");
  const row = document.getElementById("posTicketsRow");
  const cnt = document.getElementById("posTicketsCount");
  if (!bar || !row || !cnt) return;
  if (!posTickets.length) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "block";
  cnt.textContent = String(posTickets.length);
  row.innerHTML = posTickets
    .slice()
    .sort((a, b) => num(b.createdAt) - num(a.createdAt))
    .map((t) => {
      const { count, total } = ticketSummary(t);
      const active = t.id === posActiveTicketId;
      const st = String(t.status || "pending");
      const cls = `posTicket ${st === "preparing" ? "preparing" : ""} ${active ? "active" : ""}`;
      const label = st === "preparing" ? "Preparing" : "Pending";
      return `<div class="${cls}" role="button" tabindex="0" data-ticket-id="${escapeHtml(String(t.id))}">
        <span class="posTicketDot" aria-hidden="true"></span>
        <span>#${escapeHtml(String(t.id).slice(-4))}</span>
        <span class="posTicketMeta">${escapeHtml(label)}</span>
        <span class="posTicketMeta">${count} items</span>
        <span class="posTicketMeta">${escapeHtml(money(total))}</span>
      </div>`;
    })
    .join("");
}

// Make ticket chips reliably clickable (no inline onclick)
if (!window.__kgPosTicketClickBound) {
  window.__kgPosTicketClickBound = true;
  document.addEventListener("click", (e) => {
    const el = e.target && e.target.closest ? e.target.closest(".posTicket[data-ticket-id]") : null;
    if (!el) return;
    const id = el.getAttribute("data-ticket-id");
    if (!id) return;
    if (typeof window.posOpenTicket === "function") window.posOpenTicket(id);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target && e.target.closest ? e.target.closest(".posTicket[data-ticket-id]") : null;
    if (!el) return;
    e.preventDefault();
    const id = el.getAttribute("data-ticket-id");
    if (!id) return;
    if (typeof window.posOpenTicket === "function") window.posOpenTicket(id);
  });
}

window.posNewTicket = function () {
  posActiveTicketId = "";
  posCart = [];
  const note = document.getElementById("posOrderNote");
  if (note) note.value = "";
  const adj = document.getElementById("posAdjust");
  if (adj) adj.value = "0";
  renderPosCart();
  renderPosPayment();
  renderPosTickets();
};

window.posClearTickets = function () {
  if (!confirm("Clear all pending/preparing tickets?")) return;
  posTickets = [];
  posActiveTicketId = "";
  savePosTickets();
  renderPosTickets();
  toast("Tickets cleared", "success");
};

window.posOpenTicket = function (id) {
  const t = posTickets.find((x) => x.id === id);
  if (!t) return;
  posActiveTicketId = id;
  posCart = Array.isArray(t.cart) ? t.cart : [];
  const note = document.getElementById("posOrderNote");
  if (note) note.value = String(t.note || "");
  const adj = document.getElementById("posAdjust");
  if (adj) adj.value = String(num(t.adjust));
  const modeSel = document.getElementById("posPayMode");
  if (modeSel) modeSel.value = String(t.payMode || "cash");
  const cashEl = document.getElementById("posPayCash");
  const onEl = document.getElementById("posPayOnline");
  if (cashEl) cashEl.value = String(t.payCash || 0);
  if (onEl) onEl.value = String(t.payOnline || 0);
  renderPosCart();
  renderPosPayment();
  renderPosTickets();
};

function saveActiveTicketSnapshot(status) {
  if (!posCart.length) return null;
  const now = Date.now();
  const payMode = document.getElementById("posPayMode")?.value || "cash";
  const payCash = num(document.getElementById("posPayCash")?.value);
  const payOnline = num(document.getElementById("posPayOnline")?.value);
  const note = (document.getElementById("posOrderNote")?.value || "").trim();
  const adjust = num(document.getElementById("posAdjust")?.value);
  const snap = {
    id: posActiveTicketId || `t${now}`,
    status: status || "pending",
    createdAt: now,
    cart: posCart.map((x) => ({ ...x })),
    note,
    adjust,
    payMode,
    payCash,
    payOnline
  };
  // upsert
  posTickets = posTickets.filter((t) => t.id !== snap.id);
  posTickets.unshift(snap);
  posActiveTicketId = snap.id;
  savePosTickets();
  renderPosTickets();
  return snap;
}

function removeTicket(id) {
  if (!id) return;
  posTickets = posTickets.filter((t) => t.id !== id);
  if (posActiveTicketId === id) posActiveTicketId = "";
  savePosTickets();
  renderPosTickets();
}
let menuEditId = null;
let menuImageDataUrl = "";
let posActiveCategory = "";

function setLoading(on, message) {
  loadingCount += on ? 1 : -1;
  const el = document.getElementById("appLoading");
  if (el) el.classList.toggle("active", loadingCount > 0);
  document.body.classList.toggle("app-is-loading", loadingCount > 0);
  const msgEl = document.getElementById("appLoadingText");
  if (msgEl && message) msgEl.textContent = message;
  else if (msgEl && !on && loadingCount <= 0) msgEl.textContent = "Loading…";
}

function toast(message, type = "info", durationMs = 3000) {
  const wrap = document.getElementById("toastRoot");
  if (!wrap) return alert(message);
  const div = document.createElement("div");
  div.className = `toast toast-${type}`;
  div.textContent = message;
  wrap.appendChild(div);
  setTimeout(() => {
    div.classList.add("toast-out");
    setTimeout(() => div.remove(), 300);
  }, Math.max(1200, durationMs));
}

function showCelebrate(totalText) {
  const ov = document.getElementById("celebrateOverlay");
  const sub = document.getElementById("celebrateSub");
  const wrap = document.getElementById("confettiWrap");
  if (!ov || !wrap) return;
  if (sub) sub.textContent = totalText ? `Total: ${totalText}` : "Saved successfully";

  // confetti
  wrap.innerHTML = "";
  const colors = ["#E87A3A", "#D4782E", "#E89B6D", "#F5C4A8", "#A04A35", "#7A3A2A"];
  const n = 42;
  for (let i = 0; i < n; i++) {
    const el = document.createElement("i");
    const left = Math.random() * 100;
    const delay = Math.random() * 0.35;
    const dur = 1.05 + Math.random() * 0.7;
    const w = 7 + Math.random() * 8;
    const h = 10 + Math.random() * 14;
    el.style.left = `${left}%`;
    el.style.background = colors[i % colors.length];
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.animationDelay = `${delay}s`;
    el.style.animationDuration = `${dur}s`;
    el.style.opacity = String(0.75 + Math.random() * 0.25);
    wrap.appendChild(el);
  }

  ov.classList.add("show");
  clearTimeout(ov.__t);
  ov.__t = setTimeout(() => {
    ov.classList.remove("show");
  }, 1200);
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** English → Hindi for KOT / menu (uses public translation API; needs internet). */
const __enHiTranslateCache = new Map();
const __EN_HI_CACHE_MAX = 400;

function looksLikeLatinMenuName(text) {
  return /[A-Za-z]/.test(String(text || ""));
}

function looksMostlyDevanagari(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  return /[\u0900-\u097F]/.test(s) && !/[A-Za-z]/.test(s);
}

async function translateEnToHi(text) {
  const q0 = String(text || "").trim();
  if (!q0) return "";
  if (looksMostlyDevanagari(q0)) return q0;
  if (!looksLikeLatinMenuName(q0)) return q0;

  const q = q0.slice(0, 450);
  const key = q.toLowerCase();
  if (__enHiTranslateCache.has(key)) return __enHiTranslateCache.get(key);

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|hi`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error("translate failed");
    const data = await res.json();
    const out = String(data?.responseData?.translatedText || "").trim();
    if (!out || /^MYMEMORY WARNING/i.test(out)) throw new Error("no translation");
    if (__enHiTranslateCache.size >= __EN_HI_CACHE_MAX) __enHiTranslateCache.clear();
    __enHiTranslateCache.set(key, out);
    return out;
  } catch {
    return "";
  }
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function sidebarCollapsed() {
  try {
    return false; // Always show sidebar by default
  } catch {
    return false;
  }
}

function setSidebarCollapsed(v) {
  const on = !!v;
  document.body.classList.toggle("sidebar-collapsed", on);
  try {
    localStorage.setItem("kg_sidebar_collapsed", on ? "1" : "0");
  } catch {}
  applySidebarButtonText();
  // Charts need a resize after sidebar width animates
  setTimeout(() => window.resizeDashboardCharts?.(), 280);
}

window.resizeDashboardCharts = function () {
  try {
    salesExpenseChartRef?.resize?.();
    onlinePayoutChartRef?.resize?.();
    swiggySalesChartRef?.resize?.();
    zomatoSalesChartRef?.resize?.();
    salesOverviewChartRef?.resize?.();
    expenseBreakdownChartRef?.resize?.();
    paymentMixChartRef?.resize?.();
    cashOnlineMonthlyChartRef?.resize?.();
    expenseItemMixChartRef?.resize?.();
    expenseItemTrendChartRef?.resize?.();
  } catch (e) {
    console.warn(e);
  }
};

function applySidebarButtonText() {
  const el = document.getElementById("posSidebarBtnText");
  if (!el) return;
  el.textContent = document.body.classList.contains("sidebar-collapsed") ? "Expand" : "Collapse";
}

window.toggleSidebar = function () {
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
};

function isMobileSidebarLayout() {
  try {
    return window.matchMedia("(max-width: 900px)").matches;
  } catch {
    return false;
  }
}

window.closeAppSidebar = function () {
  document.body.classList.remove("sidebar-open");
  setTimeout(() => window.resizeDashboardCharts?.(), 280);
};

window.toggleAppSidebar = function () {
  if (isMobileSidebarLayout()) {
    document.body.classList.toggle("sidebar-open");
    setTimeout(() => window.resizeDashboardCharts?.(), 280);
    return;
  }
  toggleSidebar();
};

async function withErr(fn) {
  setLoading(true);
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    await fn();
    toast("Saved successfully", "ok");
  } catch (e) {
    console.error(e);
    toast(e?.message ? `Error: ${e.message}` : "Error occurred", "error");
  } finally {
    setLoading(false);
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}

function safeRun(label, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`Render failed (${label}):`, e);
  }
}

async function fetchList(label, fn, fallback = []) {
  try {
    const res = await fn();
    return Array.isArray(res) ? res : Array.isArray(res?.items) ? res.items : fallback;
  } catch (e) {
    console.error(`Load failed (${label}):`, e);
    return fallback;
  }
}

function supplierNames() {
  return state.suppliers.map((s) => (typeof s === "string" ? s : s.name));
}

function supplierByName(name) {
  return state.suppliers.find((s) => (typeof s === "string" ? s === name : s?.name === name)) || null;
}

function supplierItemsFor(name) {
  const sup = supplierByName(name);
  const items = sup && typeof sup === "object" && Array.isArray(sup.items) ? sup.items : [];
  return items
    .map((it) => ({ name: String(it?.name || "").trim(), rate: num(it?.rate) }))
    .filter((it) => it.name);
}

function staffNames() {
  return state.staff.map((s) => (typeof s === "string" ? s : s.name));
}

function fixedSalaryFor(name) {
  const items = state.fixedSalaries.filter((x) => x && x.name === name);
  if (!items.length) return 0;
  items.sort((a, b) => String(b.joinDate || "").localeCompare(String(a.joinDate || "")));
  return num(items[0].amount);
}

/** Salary is always calculated on a fixed 30-day month, not calendar days. */
function salaryAttendanceDays() {
  return num(typeof SALARY_CONFIG !== "undefined" && SALARY_CONFIG?.DAYS_IN_MONTH) || 30;
}

function salaryDailyRate(monthly) {
  const days = salaryAttendanceDays();
  return days > 0 ? num(monthly) / days : 0;
}

function salaryLeaveDaysFromStats(stats) {
  return num(stats?.absent) + num(stats?.half) * 0.5;
}

function salaryLeaveDeduction(monthly, stats) {
  const daily = salaryDailyRate(monthly);
  const leaveDays = salaryLeaveDaysFromStats(stats);
  return Math.min(num(monthly), daily * leaveDays);
}

function salaryEarnedFromAttendance(monthly, stats) {
  return Math.max(0, num(monthly) - salaryLeaveDeduction(monthly, stats));
}

function attendanceStatsForMonth(name, month) {
  const m = String(month || "").slice(0, 7);
  const rows = state.attendance.filter((a) => a && a.name === name && String(a.date || "").slice(0, 7) === m);
  const present = rows.filter((r) => r.status === "present").length;
  const half = rows.filter((r) => r.status === "half-day").length;
  const absent = rows.filter((r) => r.status === "absent").length;
  const marked = rows.length;
  const presentEquivalent = present + half * 0.5;
  const pct = marked > 0 ? (presentEquivalent / marked) * 100 : 0;
  return { present, half, absent, marked, presentEquivalent, pct };
}

function attMonthValue() {
  const m = document.getElementById("attMonth")?.value;
  if (m) return String(m).slice(0, 7);
  const d = document.getElementById("attDate")?.value || todayISO();
  return String(d).slice(0, 7);
}

function syncAttMonthFromDate() {
  const month = attMonthValue();
  const attMonth = document.getElementById("attMonth");
  if (attMonth && attMonth.value !== month) attMonth.value = month;
}

function attendanceDatesForMonth(month) {
  const m = String(month || monthISO()).slice(0, 7);
  const parts = m.split("-").map((x) => parseInt(x, 10));
  const y = parts[0];
  const mo = parts[1];
  if (!y || !mo) return [];
  const lastDay = new Date(y, mo, 0).getDate();
  const cur = monthISO();
  const today = todayISO();
  let maxDay = lastDay;
  if (m > cur) return [];
  if (m === cur) maxDay = Math.min(lastDay, parseInt(today.slice(8, 10), 10));
  const out = [];
  for (let d = 1; d <= maxDay; d++) out.push(`${m}-${String(d).padStart(2, "0")}`);
  return out;
}

function attendanceDaySummary(date) {
  const names = staffNames();
  const d = String(date || "").slice(0, 10);
  if (!names.length) return { staff: 0, marked: 0, presentEq: 0 };
  let marked = 0;
  let presentEq = 0;
  names.forEach((name) => {
    const entry = getAttendanceEntryFor(d, name);
    if (!entry) return;
    marked++;
    const st = String(entry.status || "");
    if (st === "present") presentEq += 1;
    else if (st === "half-day") presentEq += 0.5;
  });
  return { staff: names.length, marked, presentEq };
}

function attendanceDayStripClass(date, selectedDate) {
  const sum = attendanceDaySummary(date);
  if (date === selectedDate) return "att-day att-day--selected";
  if (!sum.marked) return "att-day att-day--empty";
  if (sum.marked < sum.staff) return "att-day att-day--partial";
  return "att-day att-day--done";
}

function renderAttendanceDayStrip() {
  const strip = document.getElementById("attDayStrip");
  if (!strip) return;
  const month = attMonthValue();
  const days = attendanceDatesForMonth(month);
  const selected = document.getElementById("attDate")?.value || days[days.length - 1] || todayISO();
  if (!days.length) {
    strip.innerHTML = `<div class="muted">No dates available for this month yet.</div>`;
    return;
  }
  strip.innerHTML = days
    .map((iso) => {
      const dayNum = parseInt(iso.slice(8, 10), 10);
      const sum = attendanceDaySummary(iso);
      const sub = sum.marked ? `${sum.marked}/${sum.staff}` : "—";
      const cls = attendanceDayStripClass(iso, selected);
      return `<button type="button" class="${cls}" onclick="selectAttendanceDate('${iso}')">${dayNum}<small>${sub}</small></button>`;
    })
    .join("");
}

function renderAttendanceMonthSummary() {
  const el = document.getElementById("attMonthSummary");
  if (!el) return;
  const month = attMonthValue();
  const date = document.getElementById("attDate")?.value || todayISO();
  const daySum = attendanceDaySummary(date);
  const savedDays = new Set(
    state.attendance.filter((a) => a?.date && String(a.date).slice(0, 7) === month).map((a) => String(a.date).slice(0, 10))
  ).size;
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  el.innerHTML =
    `<strong>${dateLabel}</strong> — ${daySum.marked}/${daySum.staff} staff saved` +
    (daySum.presentEq > 0 ? `, ${daySum.presentEq} present-day(s) on this date.` : ".") +
    ` Month: <strong>${savedDays}</strong> date(s) with saved attendance.`;
}

function renderAttendanceMonthUi() {
  syncAttMonthFromDate();
  renderAttendanceDayStrip();
  renderAttendanceMonthSummary();
  renderAttendanceChecklist();
}

window.selectAttendanceDate = function (iso) {
  const el = document.getElementById("attDate");
  if (el) el.value = String(iso || "").slice(0, 10);
  renderAttendanceMonthUi();
};

window.onAttMonthChange = function () {
  const month = attMonthValue();
  const days = attendanceDatesForMonth(month);
  const attDate = document.getElementById("attDate");
  if (!attDate) return renderAttendanceMonthUi();
  const cur = String(attDate.value || "").slice(0, 10);
  if (!cur.startsWith(month) && days.length) attDate.value = days[days.length - 1];
  else if (!days.length) attDate.value = `${month}-01`;
  renderAttendanceMonthUi();
};

window.onAttDateChange = function () {
  syncAttMonthFromDate();
  renderAttendanceMonthUi();
};

window.shiftAttendanceDate = function (delta) {
  const days = attendanceDatesForMonth(attMonthValue());
  const cur = document.getElementById("attDate")?.value || "";
  const i = days.indexOf(cur);
  const next = i < 0 ? (delta > 0 ? 0 : days.length - 1) : i + delta;
  if (next >= 0 && next < days.length) selectAttendanceDate(days[next]);
  else toast(delta > 0 ? "No later day in this month" : "No earlier day", "info");
};

window.copyAttendanceFromPrevDay = function () {
  const date = document.getElementById("attDate")?.value || todayISO();
  const days = attendanceDatesForMonth(attMonthValue());
  const i = days.indexOf(date);
  if (i <= 0) return toast("No previous day in this month", "info");
  const prev = days[i - 1];
  const list = document.getElementById("attendanceChecklist");
  if (!list) return;
  list.querySelectorAll("select[data-att-name]").forEach((sel) => {
    const name = sel.getAttribute("data-att-name") || "";
    const entry = getAttendanceEntryFor(prev, name);
    sel.value = entry ? String(entry.status || "") : "";
  });
  toast(`Copied from ${prev} — click Save to store for ${date}`, "info");
};

function calcSalaryForMonth(name, month) {
  const monthly = fixedSalaryFor(name);
  const stats = attendanceStatsForMonth(name, month);
  const daily = salaryDailyRate(monthly);
  const leaveDays = salaryLeaveDaysFromStats(stats);
  const leaveDeduction = salaryLeaveDeduction(monthly, stats);
  const earned = salaryEarnedFromAttendance(monthly, stats);
  const directAdv = directAdvancesFor(name, month);
  const carryIn = carryoverIntoMonth(name, month);
  const adv = directAdv + carryIn;
  const payable = earned - adv;
  const monthEndPayable = earned - adv;
  const settled = isSalaryMonthSettled(name, month);
  return {
    monthly,
    daily,
    salaryDays: salaryAttendanceDays(),
    earned,
    adv,
    directAdv,
    carryIn,
    payable,
    stats,
    leaveDays,
    leaveDeduction,
    monthEndPayable,
    settled
  };
}

function fillSelect(id, names, placeholder) {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = "";
  if (placeholder) {
    const p = document.createElement("option");
    p.value = "";
    p.textContent = placeholder;
    select.appendChild(p);
  }
  names.forEach((name) => {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    select.appendChild(o);
  });
}

function fillItemSelectForSupplier() {
  const seller = document.getElementById("purchaseSellerSelect")?.value || "";
  const itemSelect = document.getElementById("purchaseItemSelect");
  if (!itemSelect) return;
  const items = supplierItemsFor(seller);
  itemSelect.innerHTML = "";
  const p = document.createElement("option");
  p.value = "";
  p.textContent = items.length ? "Select Item" : "No items (add in Supplier Management)";
  itemSelect.appendChild(p);
  items.forEach((it) => {
    const o = document.createElement("option");
    o.value = it.name;
    o.textContent = `${it.name}${it.rate > 0 ? ` (Rs ${it.rate})` : ""}`;
    o.dataset.rate = String(it.rate || 0);
    itemSelect.appendChild(o);
  });
}
window.fillItemSelectForSupplier = fillItemSelectForSupplier;

function recalcPurchaseAmount() {
  const qty = num(document.getElementById("purchaseQty")?.value);
  const rate = num(document.getElementById("purchaseRate")?.value);
  const amountEl = document.getElementById("purchasePrice");
  if (!amountEl) return;
  if (qty > 0 && rate > 0) {
    amountEl.value = String(Math.round(qty * rate * 100) / 100);
  } else if (rate > 0 && !(qty > 0)) {
    amountEl.value = String(rate);
  } else if (!(qty > 0) && !(rate > 0)) {
    amountEl.value = "";
  }
  syncPurchaseBillTotalPreview();
}

function syncPurchaseBillTotalPreview() {
  const totalEl = document.getElementById("purchaseTotalAmount");
  if (!totalEl) return;
  const listTotal = tempPurchaseItems.reduce((s, x) => s + num(x.price), 0);
  const currentLine = num(document.getElementById("purchasePrice")?.value);
  const preview = listTotal + (currentLine > 0 ? currentLine : 0);
  totalEl.value = preview > 0 ? String(Math.round(preview)) : "";
}

window.recalcPurchaseAmount = recalcPurchaseAmount;

function onPurchaseItemChanged() {
  const itemSelect = document.getElementById("purchaseItemSelect");
  const rateEl = document.getElementById("purchaseRate");
  if (!itemSelect || !rateEl) return;
  const opt = itemSelect.options[itemSelect.selectedIndex];
  const rate = num(opt?.dataset?.rate);
  if (rate > 0) rateEl.value = String(rate);
  recalcPurchaseAmount();
}
window.onPurchaseItemChanged = onPurchaseItemChanged;

function saleAmounts(s) {
  // New format
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
    // Keep backward compatibility: if older records used `onlineAmount`, include it.
    const legacyOnline = num(s.onlineAmount);
    
    // For new records, onlineAmount should NOT be added to individual amounts
    // For old records, onlineAmount is the only online amount
    let online;
    if (legacyOnline > 0 && (swiggy === 0 && zomato === 0 && otherOnline === 0)) {
      // Old record: only has onlineAmount
      online = legacyOnline;
    } else {
      // New record: use individual amounts
      online = swiggy + zomato + otherOnline;
    }
    
    // For total calculation: use saved total or calculate
    const total = s.totalAmount !== undefined ? num(s.totalAmount) : cash + online;
    // Retail = cash + UPI/other online + bank transfers, excluding Swiggy/Zomato.
    // Do NOT add legacy `onlineAmount` when breakdown fields exist — addSale saves both
    // `otherOnlineAmount` and `onlineAmount` (duplicate), which was inflating retail (e.g. 18k vs 25k).
    const hasOnlineBreakdown = swiggy > 0 || zomato > 0 || otherOnline > 0;
    const retailLegacyOnly = !hasOnlineBreakdown && legacyOnline > 0 ? legacyOnline : 0;
    const retail = cash + otherOnline + retailLegacyOnly;
    return { cash, online, total, swiggy, zomato, otherOnline, legacyOnline, retail };
  }
  // Legacy format: { amount, method }
  const amt = num(s?.amount);
  const m = String(s?.method || "").toLowerCase();
  const cash = m === "cash" ? amt : 0;
  const online = m && m !== "cash" ? amt : 0;
  const retail = cash + online;
  return { cash, online, total: amt, swiggy: 0, zomato: 0, otherOnline: 0, legacyOnline: online, retail };
}

function slugifyExpenseCategory(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

const DEFAULT_EXPENSE_CATEGORIES = {
  kitchen: [
    { id: "paneer", label: "Paneer" },
    { id: "cheese", label: "Cheese" },
    { id: "dhaniya", label: "Dhaniya" },
    { id: "capsicum", label: "Capsicum" },
    { id: "groundnut_oil", label: "Groundnut oil" },
    { id: "cotton_seed_oil", label: "Cotton seed oil" },
    { id: "vegetables", label: "Vegetables" },
    { id: "butter", label: "Butter" },
    { id: "salt", label: "Salt" },
    { id: "staff_food", label: "Staffs food" }
  ],
  fixed: [
    { id: "shop_rent", label: "Shop rent" },
    { id: "maintenance", label: "Maintenance" },
    { id: "limbu_marcha", label: "Limbu marcha bill" },
    { id: "light_bill", label: "Light bill" },
    { id: "water_bill", label: "Water bill" }
  ]
};

function loadCustomExpenseCategories() {
  try {
    const raw = localStorage.getItem("kg_expense_categories_v1");
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return { kitchen: [], fixed: [] };
    return {
      kitchen: Array.isArray(parsed.kitchen) ? parsed.kitchen : [],
      fixed: Array.isArray(parsed.fixed) ? parsed.fixed : []
    };
  } catch {
    return { kitchen: [], fixed: [] };
  }
}

function saveCustomExpenseCategories(data) {
  try {
    localStorage.setItem("kg_expense_categories_v1", JSON.stringify(data || { kitchen: [], fixed: [] }));
  } catch (_) {}
}

function getExpenseCategoriesForGroup(group) {
  const g = group === "fixed" ? "fixed" : "kitchen";
  const custom = loadCustomExpenseCategories();
  const base = DEFAULT_EXPENSE_CATEGORIES[g] || [];
  const extras = (custom[g] || [])
    .map((x) => ({
      id: String(x.id || slugifyExpenseCategory(x.label || "")).trim(),
      label: String(x.label || x.id || "").trim()
    }))
    .filter((x) => x.id && x.label);
  const seen = new Set(base.map((x) => x.id));
  const merged = [...base];
  extras.forEach((x) => {
    if (seen.has(x.id)) return;
    seen.add(x.id);
    merged.push(x);
  });
  return merged;
}

function allExpenseCategoryLabels() {
  const map = {
    rent: "Rent",
    shop_rent: "Shop rent",
    utilities: "Utilities",
    water_bill: "Water bill",
    misc: "Other",
    vegetables: "Vegetables",
    kirana: "Kirana / grocery",
    milk: "Milk / dairy",
    tea: "Tea / chai",
    limbu_marcha: "Limbu marcha bill",
    gas: "Gas",
    packaging: "Packaging",
    cleaning: "Cleaning",
    light_bill: "Light bill",
    maintenance: "Maintenance",
    kachara: "Kachara bill",
    staff_food: "Staffs food",
    kitchen: "Kitchen / supplies",
    shop_other: "Shop / unexpected",
    paneer: "Paneer",
    cheese: "Cheese",
    dhaniya: "Dhaniya",
    capsicum: "Capsicum",
    groundnut_oil: "Groundnut oil",
    cotton_seed_oil: "Cotton seed oil",
    butter: "Butter",
    salt: "Salt"
  };
  ["kitchen", "fixed"].forEach((g) => {
    getExpenseCategoriesForGroup(g).forEach((c) => {
      map[c.id] = c.label;
    });
  });
  return map;
}

function expenseCategoryLabel(cat) {
  const k = String(cat || "").toLowerCase();
  const map = allExpenseCategoryLabels();
  if (map[k]) return map[k];
  if (!k) return "Expense";
  return k
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function refreshBillCategorySelect(preserveValue) {
  const groupEl = document.getElementById("billExpenseGroup");
  const typeEl = document.getElementById("billType");
  if (!typeEl) return;
  const group = groupEl?.value || "kitchen";
  const cats = getExpenseCategoriesForGroup(group);
  const prev = preserveValue != null ? String(preserveValue) : String(typeEl.value || "");
  typeEl.innerHTML = cats
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`)
    .join("");
  if (prev && cats.some((c) => c.id === prev)) typeEl.value = prev;
  else if (cats[0]) typeEl.value = cats[0].id;
}

window.onExpenseGroupChanged = function () {
  refreshBillCategorySelect("");
};

window.addCustomExpenseCategory = function () {
  const groupEl = document.getElementById("billExpenseGroup");
  const group = groupEl?.value === "fixed" ? "fixed" : "kitchen";
  const label = String(prompt(`New ${group === "fixed" ? "fixed cost" : "kitchen"} category name:`) || "").trim();
  if (!label) return;
  let id = slugifyExpenseCategory(label);
  if (!id) return toast("Enter a valid name", "error");
  const existing = getExpenseCategoriesForGroup(group);
  if (existing.some((c) => c.id === id || c.label.toLowerCase() === label.toLowerCase())) {
    refreshBillCategorySelect(id);
    toast("Category already exists", "info");
    return;
  }
  const other = getExpenseCategoriesForGroup(group === "fixed" ? "kitchen" : "fixed");
  if (other.some((c) => c.id === id) || allExpenseCategoryLabels()[id]) {
    id = `${id}_${group === "fixed" ? "fixed" : "kit"}`;
  }
  const custom = loadCustomExpenseCategories();
  custom[group] = [...(custom[group] || []), { id, label }];
  saveCustomExpenseCategories(custom);
  refreshBillCategorySelect(id);
  toast(`Added “${label}”`, "ok");
}

function prevMonthISO(month) {
  const [y, m] = String(month || "").slice(0, 7).split("-").map(Number);
  if (!y || !m) return "";
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function directAdvancesFor(name, month) {
  return (state.advances || [])
    .filter((x) => x.name === name && x.month === month)
    .reduce((sum, x) => sum + num(x.amount), 0);
}

function isSalaryMonthSettled(name, month) {
  return (state.salaries || []).some(
    (s) => s.name === name && String(s.month || "").slice(0, 7) === String(month).slice(0, 7) && s.status === "paid"
  );
}

/** Excess advance after salary+leave for a month (no recursive carry). */
function monthAdvanceDeficit(name, month) {
  const monthly = fixedSalaryFor(name);
  const stats = attendanceStatsForMonth(name, month);
  const leaveDeduction = salaryLeaveDeduction(monthly, stats);
  const payableBase = salaryEarnedFromAttendance(monthly, stats);
  const adv = directAdvancesFor(name, month);
  return Math.max(0, adv - payableBase);
}

/**
 * Advances for a month = advances recorded that month
 * + automatic carryover from previous unsettled months (when advance > salary).
 * Once a month is marked paid (full salary), it is closed and does not carry forward.
 */
function salaryAdvanceFor(name, month, depth) {
  const d = depth == null ? 0 : depth;
  if (d > 18) return directAdvancesFor(name, month);
  const direct = directAdvancesFor(name, month);
  const prev = prevMonthISO(month);
  if (!prev) return direct;
  if (isSalaryMonthSettled(name, prev)) return direct;
  const prevTotalAdv = salaryAdvanceFor(name, prev, d + 1);
  const monthly = fixedSalaryFor(name);
  const stats = attendanceStatsForMonth(name, prev);
  const payableBase = salaryEarnedFromAttendance(monthly, stats);
  const carry = Math.max(0, prevTotalAdv - payableBase);
  return direct + carry;
}

function carryoverIntoMonth(name, month) {
  return Math.max(0, salaryAdvanceFor(name, month) - directAdvancesFor(name, month));
}

function payableForSalary(sal) {
  // Display-level payable; can be negative if advances exceed salary amount
  return num(sal.amount) - salaryAdvanceFor(sal.name, sal.month);
}

function payableForSalaryNonNegative(sal) {
  return Math.max(0, payableForSalary(sal));
}

function balanceDataSnapshot() {
  return {
    sales: state.sales,
    purchases: state.purchases,
    expenses: state.expenses,
    salaries: state.salaries,
    advances: state.advances,
    supplierPayments: state.supplierPayments,
    balanceTransfers: state.balanceTransfers
  };
}

function calcTotals() {
  const bm = window.balanceMath;
  const salesAmounts = state.sales.map((s) => ({ sale: s, amounts: saleAmounts(s) }));

  const totalRevenue = salesAmounts.reduce((sum, { amounts }) => sum + amounts.total, 0);
  const totalSales = state.sales.length;
  const onlineSales = salesAmounts.reduce((sum, { amounts }) => sum + amounts.swiggy + amounts.zomato, 0);
  const retailSales = salesAmounts.reduce((sum, { amounts }) => sum + num(amounts.retail), 0);

  const paidSupplier = state.purchases
    .filter((p) => isPurchasePaid(p))
    .reduce((sum, p) => sum + num(p.price), 0);
  const paidBills = state.expenses
    .filter((e) => e.status === "paid")
    .reduce((sum, e) => sum + num(e.amount), 0);
  const paidStaff = state.salaries
    .filter((s) => s.status === "paid")
    .reduce((sum, s) => sum + Math.max(0, payableForSalary(s)), 0);

  const totalExpenses = paidSupplier + paidBills + paidStaff;
  const unpaidBills = totalSupplierOutstanding();

  const balances = bm
    ? bm.computeBalances(balanceDataSnapshot())
    : { cashBalance: 0, bankBalance: 0 };
  const cashBalance = balances.cashBalance;
  const bankBalance = balances.bankBalance;
  const totalBalance = cashBalance + bankBalance;
  const netProfit = totalRevenue - totalExpenses;

  return {
    cashBalance,
    bankBalance,
    totalBalance,
    totalRevenue,
    totalSales,
    onlineSales,
    retailSales,
    unpaidBills,
    netProfit,
    totalExpenses,
    breakdown: { staff: paidStaff, supplier: paidSupplier, rent: 0, others: 0, bills: paidBills }
  };
}

function calcPeriodTotals(fromISO, toISO) {
  const inRange = (d) => dateInPeriod(d, fromISO, toISO);

  const salesAmounts = state.sales
    .filter((s) => s?.date && inRange(s.date))
    .map((s) => saleAmounts(s));

  const totalRevenue = salesAmounts.reduce((sum, amounts) => sum + amounts.total, 0);
  const onlineSales = salesAmounts.reduce((sum, amounts) => sum + amounts.swiggy + amounts.zomato, 0);
  const retailSales = salesAmounts.reduce((sum, amounts) => sum + num(amounts.retail), 0);
  const cashSales = salesAmounts.reduce((sum, amounts) => sum + amounts.cash, 0);
  const upiOnline = salesAmounts.reduce((sum, amounts) => {
    if (amounts.legacyOnline > 0 && amounts.swiggy === 0 && amounts.zomato === 0 && amounts.otherOnline === 0) {
      return sum + amounts.legacyOnline;
    }
    return sum + amounts.otherOnline;
  }, 0);

  const paidBills = state.expenses
    .filter((e) => e.status === "paid" && inRange(e.date))
    .reduce((sum, e) => sum + num(e.amount), 0);
  const supplierPaid = state.supplierPayments
    .filter((p) => p?.date && inRange(p.date))
    .reduce((sum, p) => sum + num(p.amount), 0);
  const paidPurchases = state.purchases
    .filter((p) => isPurchasePaid(p) && inRange(p.date))
    .reduce((sum, p) => sum + num(p.price), 0);
  const paidStaff = state.salaries
    .filter((s) => s.status === "paid" && s.paidAt && inRange(s.paidAt))
    .reduce((sum, s) => sum + payableForSalaryNonNegative(s), 0);

  const cogs = paidPurchases + supplierPaid;
  const totalExpenses = paidBills + supplierPaid + paidPurchases + paidStaff;
  const grossProfit = totalRevenue - cogs;
  const netProfit = totalRevenue - totalExpenses;
  const orderCount = orderCountInRange(fromISO, toISO);
  const orderRevenue = ordersInRange(fromISO, toISO).reduce((sum, o) => sum + num(o.total), 0);
  const salesCount = salesAmounts.length;
  const aov =
    orderCount > 0 ? orderRevenue / orderCount : salesCount > 0 ? totalRevenue / salesCount : 0;

  return {
    totalRevenue,
    onlineSales,
    retailSales,
    cashSales,
    upiOnline,
    totalExpenses,
    grossProfit,
    netProfit,
    orderCount,
    aov,
    cogs,
    salesCount
  };
}

function renderDashboard() {
  try {
    window.KG?.liveSales?.refreshNetMargin?.();
  } catch (_) {}
  ensureDashboardMonthChips();
  const balances = calcTotals();
  const period = getDashboardPeriodRange();
  const t = calcPeriodTotals(period.fromISO, period.toISO);
  const periodLabel = formatPeriodRangeLabel(period.fromISO, period.toISO);

  const elToday = document.getElementById("todayLabel");
  if (elToday) {
    elToday.textContent = new Date().toLocaleString("en-IN", {
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  const labelEl = document.getElementById("dashboardPeriodLabel");
  if (labelEl) {
    labelEl.textContent =
      period.period === "today" ? "Key metrics for today" : `${period.hint} · ${periodLabel}`;
  }

  const cashEl = document.getElementById("kpiCashBalance");
  const bankEl = document.getElementById("kpiBankBalance");
  const totalBalEl = document.getElementById("kpiTotalBalance");
  const revEl = document.getElementById("kpiTotalRevenue");
  const profitEl = document.getElementById("kpiNetProfit");
  const profitCard = document.getElementById("netProfitCard");
  const onlineSalesEl = document.getElementById("kpiOnlineSales");
  const retailSalesEl = document.getElementById("kpiRetailSales");
  const expensesEl = document.getElementById("kpiTotalExpenses");
  const upiEl = document.getElementById("kpiUpiOnline");
  const cashHint = document.getElementById("kpiCashHint");
  const bankHint = document.getElementById("kpiBankHint");
  const grossHint = document.getElementById("kpiGrossHint");
  const onlineHint = document.getElementById("kpiOnlineHint");
  const totalBalHint = document.getElementById("kpiTotalBalanceHint");
  const netPosCard = document.getElementById("netPositionCard");

  const unpaidSupplier = totalSupplierOutstanding();
  const unpaidExpenses = (state.expenses || [])
    .filter((e) => e.status === "unpaid")
    .reduce((sum, e) => sum + num(e.amount), 0);
  const pendingTotal = unpaidSupplier + unpaidExpenses;
  const netPosition = balances.cashBalance + balances.bankBalance - pendingTotal;

  if (cashEl) animateNumber(cashEl, balances.cashBalance, (v) => money(v), 950);
  if (bankEl) animateNumber(bankEl, balances.bankBalance, (v) => money(v), 950);
  if (totalBalEl) animateNumber(totalBalEl, netPosition, (v) => money(v), 950);
  if (revEl) animateNumber(revEl, t.totalRevenue, (v) => money(v), 950);
  if (expensesEl) animateNumber(expensesEl, t.totalExpenses, (v) => money(v), 950);
  if (cashHint) cashHint.textContent = "Physical cash";
  if (bankHint) bankHint.textContent = "Bank account";
  if (totalBalHint) {
    totalBalHint.textContent =
      netPosition >= 0
        ? `In surplus · Cash+Bank ${money(balances.totalBalance)} − pending ${money(pendingTotal)}`
        : `Shortfall · Cash+Bank ${money(balances.totalBalance)} − pending ${money(pendingTotal)}`;
  }
  if (netPosCard) netPosCard.classList.toggle("negative", netPosition < 0);

  if (profitEl && profitCard) {
    profitCard.classList.toggle("negative", t.netProfit < 0);
    animateNumber(profitEl, t.netProfit, (v) => money(v), 1050);
  }
  if (grossHint) {
    grossHint.textContent = `Gross ${money(t.grossProfit)} · ${
      t.netProfit >= 0 ? "profit" : "loss"
    } this period`;
  }

  if (onlineSalesEl) animateNumber(onlineSalesEl, t.onlineSales, (v) => money(v), 950);
  if (retailSalesEl) animateNumber(retailSalesEl, t.retailSales, (v) => money(v), 950);
  if (upiEl) animateNumber(upiEl, t.upiOnline, (v) => money(v), 950);
  if (onlineHint) onlineHint.textContent = `Swiggy+Zomato ${money(t.onlineSales)} · Cash ${money(t.cashSales)}`;

  const pendingEl = document.getElementById("kpiPendingBills");
  const pendingHint = document.getElementById("kpiPendingHint");
  if (pendingEl) animateNumber(pendingEl, pendingTotal, (v) => money(v), 950);
  if (pendingHint) pendingHint.textContent = `Supplier ${money(unpaidSupplier)} · Expenses ${money(unpaidExpenses)}`;

  const marginEl = document.getElementById("kpiMarginPct");
  const marginHint = document.getElementById("kpiMarginHint");
  const marginPct = t.totalRevenue > 0 ? (t.netProfit / t.totalRevenue) * 100 : 0;
  if (marginEl) marginEl.textContent = `${marginPct >= 0 ? "" : "−"}${Math.abs(marginPct).toFixed(1)}%`;
  if (marginHint) marginHint.textContent = "Profit ÷ sales";

  drawSparkline("sparkSales", lastNDaySeries(7, salesTotalOnDay), "rgba(99, 102, 241, 0.95)");
  drawSparkline(
    "sparkProfit",
    lastNDaySeries(7, (d) => salesTotalOnDay(d) - expenseTotalOnDay(d)),
    "rgba(22, 199, 132, 0.95)"
  );
  drawSparkline("sparkExpenses", lastNDaySeries(7, expenseTotalOnDay), "rgba(239, 68, 68, 0.9)");

  const trendNote = document.getElementById("dashTrendChartNote");
  if (trendNote) {
    if (period.period === "today") trendNote.textContent = "Last 7 days trend · KPI cards show today only";
    else if (period.period === "year") trendNote.textContent = "Monthly sales, expenses & profit this year";
    else trendNote.textContent = `Revenue · expenses · profit · ${period.hint}`;
  }

  safeRun("sales expense trend", renderSalesExpenseTrendChart);
  safeRun("payment mix chart", renderPaymentMixChart);
  safeRun("cash online monthly", renderCashOnlineMonthlyChart);
  safeRun("online payout trend", renderOnlinePayoutTrendChart);
  safeRun("sales overview chart", renderSalesOverviewChart);
  safeRun("expense breakdown chart", renderExpenseBreakdownChart);
  safeRun("recent transactions", renderRecentTransactions);
  safeRun("upcoming payments", renderUpcomingPayments);
  safeRun("stock alerts", renderStockAlerts);
  safeRun("reminders widget", renderDashReminders);
  safeRun("best sellers", renderDashBestSellers);
  safeRun("staff snapshot", renderDashStaffSnapshot);
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

function renderDashReminders() {
  const statsEl = document.getElementById("dashReminderStats");
  const listEl = document.getElementById("dashRemindersList");
  if (!statsEl && !listEl) return;
  const today = todayISO();
  const items = (state.reminders || []).filter((r) => !r.done && !r.completed);
  let overdue = 0;
  let dueToday = 0;
  let upcoming = 0;
  const rows = items
    .map((r) => {
      const due = String(r.dueDate || "").slice(0, 10);
      const d = due ? daysUntil(due) : 999;
      if (d < 0) overdue++;
      else if (d === 0) dueToday++;
      else upcoming++;
      return { r, due, d };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);

  if (statsEl) {
    statsEl.innerHTML = `
      <span class="dpro-chip">Today ${dueToday}</span>
      <span class="dpro-chip warn">Upcoming ${upcoming}</span>
      <span class="dpro-chip bad">Overdue ${overdue}</span>`;
  }
  if (listEl) {
    listEl.innerHTML =
      rows
        .map(({ r, due, d }) => {
          const tag = d < 0 ? `${Math.abs(d)}d late` : d === 0 ? "Today" : `${d}d`;
          return `<div class="row"><div><strong>${escapeHtml(r.title || "Reminder")}</strong><div class="muted" style="font-size:12px">${escapeHtml(due || "No date")}</div></div><span class="pill">${tag}</span></div>`;
        })
        .join("") || `<div class="muted">No open reminders.</div>`;
  }
}

function renderDashBestSellers() {
  const el = document.getElementById("dashBestSellers");
  if (!el) return;
  const { fromISO, toISO } = getDashboardPeriodRange();
  const map = new Map();
  ordersInRange(fromISO, toISO).forEach((o) => {
    (Array.isArray(o.items) ? o.items : []).forEach((it) => {
      const name = String(it.name || "Item").trim() || "Item";
      const qty = Math.max(0, num(it.qty));
      const revenue = qty * num(it.price);
      const cur = map.get(name) || { name, qty: 0, revenue: 0 };
      cur.qty += qty;
      cur.revenue += revenue;
      map.set(name, cur);
    });
  });
  const ranked = [...map.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 6);
  const maxQty = ranked[0]?.qty || 1;
  el.innerHTML =
    ranked
      .map((x) => {
        const pct = Math.max(6, Math.round((x.qty / maxQty) * 100));
        return `<div class="dpro-seller"><div class="dpro-seller-top"><span>${escapeHtml(x.name)}</span><span>${x.qty} · ${money(x.revenue)}</span></div><div class="dpro-bar"><span style="width:${pct}%"></span></div></div>`;
      })
      .join("") || `<div class="muted">No POS orders in this period.</div>`;
}

function renderDashStaffSnapshot() {
  const el = document.getElementById("dashStaffSnapshot");
  if (!el) return;
  const att = attendanceDaySummary(todayISO());
  const absent = Math.max(0, att.staff - att.presentEq);
  el.innerHTML = `<div class="dpro-staff-grid">
    <div class="dpro-staff-stat"><strong>${att.presentEq}</strong><span>Present</span></div>
    <div class="dpro-staff-stat"><strong>${absent}</strong><span>Absent / unmarked</span></div>
    <div class="dpro-staff-stat"><strong>${att.marked}</strong><span>Marked today</span></div>
    <div class="dpro-staff-stat"><strong>${att.staff}</strong><span>Team size</span></div>
  </div>`;
}

function renderSalesExpenseTrendChart() {
  const canvas = document.getElementById("salesExpenseTrendChart");
  if (!canvas || typeof Chart === "undefined") return;
  if (salesExpenseChartRef) salesExpenseChartRef.destroy();

  const period = getDashboardPeriodRange();
  const buckets = buildTrendBuckets(period.period, period.fromISO, period.toISO);
  const isMonthMode = ["year", "m2", "m3", "m6"].includes(period.period);

  const sales = buckets.map((b) => (isMonthMode ? salesTotalInMonth(b.key) : salesTotalOnDay(b.key)));
  const expenses = buckets.map((b) => (isMonthMode ? expenseTotalInMonth(b.key) : expenseTotalOnDay(b.key)));
  const profit = sales.map((s, i) => s - expenses[i]);

  const ctx = canvas.getContext("2d");
  const h = canvas.parentElement?.clientHeight || 320;
  const revFill = ctx.createLinearGradient(0, 0, 0, h);
  revFill.addColorStop(0, "rgba(232, 122, 58, 0.45)");
  revFill.addColorStop(0.55, "rgba(232, 122, 58, 0.14)");
  revFill.addColorStop(1, "rgba(232, 122, 58, 0)");

  const expFill = ctx.createLinearGradient(0, 0, 0, h);
  expFill.addColorStop(0, "rgba(160, 74, 53, 0.32)");
  expFill.addColorStop(1, "rgba(160, 74, 53, 0)");

  const ink = "#FDE8D8";
  const muted = "rgba(253, 232, 216, 0.62)";
  const grid = "rgba(253, 232, 216, 0.1)";
  const showPts = buckets.length <= 16;

  salesExpenseChartRef = new Chart(canvas, {
    type: "line",
    data: {
      labels: buckets.map((b) => b.label),
      datasets: [
        {
          label: "Revenue",
          data: sales,
          borderColor: "#FDE8D8",
          backgroundColor: revFill,
          fill: true,
          tension: 0.42,
          borderWidth: 3,
          pointRadius: showPts ? 3.5 : 0,
          pointHoverRadius: 6,
          pointBackgroundColor: "#E87A3A",
          pointBorderColor: "#FDE8D8",
          pointBorderWidth: 2,
          pointHoverBackgroundColor: "#FDE8D8",
          pointHoverBorderColor: "#E87A3A",
          order: 2
        },
        {
          label: "Expenses",
          data: expenses,
          borderColor: "#A04A35",
          backgroundColor: expFill,
          fill: true,
          tension: 0.42,
          borderWidth: 2.4,
          pointRadius: showPts ? 2.5 : 0,
          pointHoverRadius: 5,
          pointBackgroundColor: "#5C2A1F",
          pointBorderColor: "#A04A35",
          pointBorderWidth: 1.5,
          order: 3
        },
        {
          label: "Profit",
          data: profit,
          borderColor: "#C46A2E",
          backgroundColor: "transparent",
          fill: false,
          tension: 0.38,
          borderWidth: 2.6,
          borderDash: [7, 5],
          pointRadius: showPts ? 3 : 0,
          pointHoverRadius: 6,
          pointBackgroundColor: "#C46A2E",
          pointBorderColor: "#5C2A1F",
          pointBorderWidth: 2,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      animation: { duration: 780, easing: "easeOutQuart" },
      layout: { padding: { top: 4, right: 6, bottom: 2, left: 2 } },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            color: ink,
            font: { family: "Plus Jakarta Sans", size: 12, weight: "650" },
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 8,
            padding: 16
          }
        },
        tooltip: {
          backgroundColor: "rgba(92, 42, 31, 0.94)",
          titleColor: "#FDE8D8",
          bodyColor: "#FDE8D8",
          borderColor: "rgba(232, 122, 58, 0.55)",
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          boxPadding: 6,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${money(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: muted,
            maxRotation: 0,
            autoSkipPadding: 10,
            font: { family: "Plus Jakarta Sans", size: 11, weight: "600" }
          },
          grid: { color: grid, drawBorder: false },
          border: { display: false }
        },
        y: {
          ticks: {
            color: muted,
            font: { family: "Plus Jakarta Sans", size: 11, weight: "600" },
            callback: (v) => {
              const n = Number(v);
              if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k`;
              return n;
            }
          },
          grid: {
            color: (ctx) => (ctx.tick.value === 0 ? "rgba(253, 232, 216, 0.35)" : grid),
            drawBorder: false,
            lineWidth: (ctx) => (ctx.tick.value === 0 ? 1.5 : 1)
          },
          border: { display: false },
          beginAtZero: false
        }
      }
    }
  });
}

function renderPaymentMixChart() {
  const canvas = document.getElementById("paymentMixChart");
  if (!canvas || typeof Chart === "undefined") return;
  if (paymentMixChartRef) paymentMixChartRef.destroy();

  const { fromISO, toISO } = getDashboardPeriodRange();
  const split = paymentSplitInRange(fromISO, toISO);
  const note = document.getElementById("paymentMixNote");
  const total = split.cash + split.upi + split.swiggy + split.zomato;
  if (note) {
    note.textContent = total > 0 ? `Period total ${money(total)}` : "No sales in this period";
  }
  const c = chartThemeColors();

  paymentMixChartRef = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Cash", "UPI / Online", "Swiggy", "Zomato"],
      datasets: [
        {
          data: [split.cash, split.upi, split.swiggy, split.zomato],
          backgroundColor: ["#E87A3A", "#FDE8D8", "#A04A35", "#C46A2E"],
          borderWidth: 0,
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      animation: { duration: 650, easing: "easeOutQuart" },
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: c.text, font: { family: "Plus Jakarta Sans", size: 11, weight: "600" }, usePointStyle: true, boxWidth: 8 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${money(ctx.parsed)}`
          }
        }
      }
    }
  });
}

function renderCashOnlineMonthlyChart() {
  const canvas = document.getElementById("cashOnlineMonthlyChart");
  if (!canvas || typeof Chart === "undefined") return;
  if (cashOnlineMonthlyChartRef) {
    try {
      cashOnlineMonthlyChartRef.destroy();
    } catch (_) {}
    cashOnlineMonthlyChartRef = null;
  }

  const range = resolvePeriodRange("m6");
  const buckets = buildMonthBuckets(range.fromISO, range.toISO);
  const cashSeries = [];
  const onlineSeries = [];
  buckets.forEach((b) => {
    const fromISO = `${b.key}-01`;
    const [y, m] = b.key.split("-").map(Number);
    const last = localISODate(new Date(y, m, 0));
    const split = paymentSplitInRange(fromISO, last);
    cashSeries.push(split.cash);
    onlineSeries.push(split.upi + split.swiggy + split.zomato);
  });

  const note = document.getElementById("cashOnlineMonthlyNote");
  if (note) {
    const tc = cashSeries.reduce((a, b) => a + b, 0);
    const to = onlineSeries.reduce((a, b) => a + b, 0);
    note.textContent = `Last 6 months · Cash ${money(tc)} · Online ${money(to)} · Balances stay continuous month to month`;
  }

  const c = chartThemeColors();
  cashOnlineMonthlyChartRef = new Chart(canvas, {
    type: "bar",
    data: {
      labels: buckets.map((b) => b.label),
      datasets: [
        { label: "Cash received", data: cashSeries, backgroundColor: "#E87A3A", borderRadius: 6 },
        { label: "Online received", data: onlineSeries, backgroundColor: "#C46A2E", borderRadius: 6 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650, easing: "easeOutQuart" },
      scales: {
        x: { ticks: { color: c.text, font: { size: 11, weight: "600" } }, grid: { display: false } },
        y: {
          ticks: { color: c.muted || c.text, callback: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v) },
          grid: { color: c.grid || "rgba(148,163,184,.15)" }
        }
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: c.text, font: { family: "Plus Jakarta Sans", size: 11, weight: "600" }, usePointStyle: true, boxWidth: 8 }
        },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}` } }
      }
    }
  });
}

window.setOnlinePayoutPeriod = function (period) {
  const p = period === "month" ? "month" : "week";
  syncPeriodChips("onlinePayoutPeriodFilter", p);
  renderOnlinePayoutTrendChart();
};

function onlineChannelOnDay(dateISO) {
  const d = String(dateISO || "").slice(0, 10);
  let swiggy = 0;
  let zomato = 0;
  state.sales.forEach((s) => {
    if (String(s.date || "").slice(0, 10) !== d) return;
    const a = saleAmounts(s);
    swiggy += a.swiggy;
    zomato += a.zomato;
  });
  return { swiggy, zomato };
}

function mondayOfWeekISO(iso) {
  const d = parseLocalDay(String(iso || "").slice(0, 10) || todayISO());
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return localISODate(d);
}

function buildWeekBuckets(weekCount = 8) {
  const thisMon = mondayOfWeekISO(todayISO());
  const buckets = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const from = isoAddDays(thisMon, -7 * i);
    const to = isoAddDays(from, 6);
    const fromD = parseLocalDay(from);
    const toD = parseLocalDay(to);
    const sameMonth = fromD.getMonth() === toD.getMonth();
    const label = sameMonth
      ? `${fromD.toLocaleDateString("en-IN", { day: "2-digit" })}–${toD.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short"
        })}`
      : `${fromD.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}–${toD.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short"
        })}`;
    buckets.push({ key: from, from, to, label });
  }
  return buckets;
}

function onlineChannelInRange(fromISO, toISO) {
  let swiggy = 0;
  let zomato = 0;
  state.sales.forEach((s) => {
    const d = String(s.date || "").slice(0, 10);
    if (!d || d < fromISO || d > toISO) return;
    const a = saleAmounts(s);
    swiggy += a.swiggy;
    zomato += a.zomato;
  });
  return { swiggy, zomato };
}

function renderOnlinePayoutTrendChart() {
  const canvas = document.getElementById("onlinePayoutTrendChart");
  if (!canvas || canvas.hidden || typeof Chart === "undefined") return;
  if (onlinePayoutChartRef) onlinePayoutChartRef.destroy();
  if (swiggySalesChartRef) {
    swiggySalesChartRef.destroy();
    swiggySalesChartRef = null;
  }
  if (zomatoSalesChartRef) {
    zomatoSalesChartRef.destroy();
    zomatoSalesChartRef = null;
  }

  // Weekly buckets — platform sales are usually entered once per week
  const buckets = buildWeekBuckets(8);
  const swiggy = buckets.map((b) => onlineChannelInRange(b.from, b.to).swiggy);
  const zomato = buckets.map((b) => onlineChannelInRange(b.from, b.to).zomato);
  const totalS = swiggy.reduce((a, b) => a + b, 0);
  const totalZ = zomato.reduce((a, b) => a + b, 0);
  const ink = "#FDE8D8";
  const muted = "rgba(253, 232, 216, 0.62)";
  const grid = "rgba(253, 232, 216, 0.1)";
  const note = document.getElementById("onlinePayoutChartNote");
  if (note) {
    note.textContent = `Weekly · Swiggy ${money(totalS)} · Zomato ${money(totalZ)}`;
  }

  onlinePayoutChartRef = new Chart(canvas, {
    type: "bar",
    data: {
      labels: buckets.map((b) => b.label),
      datasets: [
        {
          label: "Swiggy",
          data: swiggy,
          backgroundColor: "rgba(160, 74, 53, 0.9)",
          hoverBackgroundColor: "#A04A35",
          borderRadius: 10,
          maxBarThickness: 22,
          borderSkipped: false
        },
        {
          label: "Zomato",
          data: zomato,
          backgroundColor: "rgba(232, 122, 58, 0.92)",
          hoverBackgroundColor: "#E87A3A",
          borderRadius: 10,
          maxBarThickness: 22,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      animation: { duration: 700, easing: "easeOutQuart" },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            color: ink,
            font: { family: "Plus Jakarta Sans", size: 12, weight: "650" },
            usePointStyle: true,
            boxWidth: 8
          }
        },
        tooltip: {
          backgroundColor: "rgba(92, 42, 31, 0.94)",
          titleColor: "#FDE8D8",
          bodyColor: "#FDE8D8",
          borderColor: "rgba(232, 122, 58, 0.55)",
          borderWidth: 1,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}`,
            footer: (items) => {
              const sum = items.reduce((a, it) => a + (Number(it.parsed.y) || 0), 0);
              return `Week total: ${money(sum)}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: muted, maxRotation: 0, font: { size: 11, weight: "600" } },
          grid: { display: false },
          border: { display: false }
        },
        y: {
          ticks: {
            color: muted,
            font: { size: 11, weight: "600" },
            callback: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)
          },
          grid: { color: grid, drawBorder: false },
          border: { display: false },
          beginAtZero: true
        }
      }
    }
  });
}

function renderSalesOverviewChart() {
  const canvas = document.getElementById("salesOverviewChart");
  if (!canvas || canvas.hidden || typeof Chart === "undefined") return;
  if (salesOverviewChartRef) salesOverviewChartRef.destroy();

  const { fromISO, toISO } = getDashboardPeriodRange();
  const days = buildDayBuckets(fromISO, toISO);
  const idx = new Map(days.map((d, i) => [d.key, i]));
  const cash = new Array(days.length).fill(0);
  const swiggy = new Array(days.length).fill(0);
  const zomato = new Array(days.length).fill(0);
  const otherOnline = new Array(days.length).fill(0);

  const salesAmounts = state.sales.map((s) => ({ sale: s, amounts: saleAmounts(s) }));

  salesAmounts.forEach(({ sale, amounts }) => {
    if (!sale.date) return;
    const i = idx.get(String(sale.date).slice(0, 10));
    if (i === undefined) return;

    cash[i] += amounts.cash;
    swiggy[i] += amounts.swiggy;
    zomato[i] += amounts.zomato;
    if (amounts.legacyOnline > 0 && amounts.swiggy === 0 && amounts.zomato === 0 && amounts.otherOnline === 0) {
      otherOnline[i] += amounts.legacyOnline;
    } else {
      otherOnline[i] += amounts.otherOnline;
    }
  });

  salesOverviewChartRef = new Chart(canvas, {
    type: "bar",
    data: {
      labels: days.map((d) => d.label),
      datasets: [
        { label: "Cash", data: cash, backgroundColor: "rgba(232, 122, 58, 0.9)", borderRadius: 10 },
        { label: "Swiggy", data: swiggy, backgroundColor: "rgba(160, 74, 53, 0.88)", borderRadius: 10 },
        { label: "Zomato", data: zomato, backgroundColor: "rgba(253, 232, 216, 0.88)", borderRadius: 10 },
        { label: "Other Online", data: otherOnline, backgroundColor: "rgba(196, 106, 46, 0.85)", borderRadius: 10 }
      ]
    },
    options: (() => {
      const c = chartThemeColors();
      return {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: "easeOutQuart" },
        plugins: { legend: { labels: { color: c.text, font: { family: "Plus Jakarta Sans", size: 12 } } } },
        scales: {
          x: { ticks: { color: c.muted }, grid: { color: c.grid } },
          y: { ticks: { color: c.muted }, grid: { color: c.grid } }
        }
      };
    })()
  });
}

function renderExpenseBreakdownChart() {
  const canvas = document.getElementById("expenseBreakdownChart");
  if (!canvas || typeof Chart === "undefined") return;
  if (expenseBreakdownChartRef) expenseBreakdownChartRef.destroy();

  const { fromISO, toISO } = getDashboardPeriodRange();
  const inRange = (d) => dateInPeriod(d, fromISO, toISO);

  const staff = state.salaries
    .filter((s) => s.status === "paid" && s.paidAt && inRange(s.paidAt))
    .reduce((sum, s) => sum + payableForSalaryNonNegative(s), 0);
  const supplier =
    state.supplierPayments.filter((p) => p?.date && inRange(p.date)).reduce((sum, p) => sum + num(p.amount), 0) +
    state.purchases
      .filter((p) => isPurchasePaid(p) && inRange(p.date))
      .reduce((sum, p) => sum + num(p.price), 0);
  const billsByCategory = {};
  state.expenses
    .filter((e) => e.status === "paid" && inRange(e.date))
    .forEach((e) => {
      const k = String(e.category || e.type || "others").toLowerCase();
      billsByCategory[k] = (billsByCategory[k] || 0) + num(e.amount);
    });
  const dailyKeys = [
    "vegetables",
    "kirana",
    "milk",
    "tea",
    "limbu_marcha",
    "gas",
    "packaging",
    "cleaning",
    "light_bill",
    "maintenance",
    "kachara",
    "misc",
    "staff_food",
    "kitchen",
    "shop_other",
    "paneer",
    "cheese",
    "dhaniya",
    "capsicum",
    "groundnut_oil",
    "cotton_seed_oil",
    "butter",
    "salt"
  ];
  const rent = (billsByCategory.rent || 0) + (billsByCategory.shop_rent || 0);
  const utilities = (billsByCategory.utilities || 0) + (billsByCategory.water_bill || 0);
  const daily = dailyKeys.reduce((s, k) => s + (billsByCategory[k] || 0), 0);
  const others = Object.entries(billsByCategory)
    .filter(([k]) => !["rent", "shop_rent", "utilities", "water_bill", ...dailyKeys].includes(k))
    .reduce((sum, [, v]) => sum + num(v), 0);

  expenseBreakdownChartRef = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Staff", "Supplier", "Rent", "Utilities", "Daily expenses", "Others"],
      datasets: [
        {
          data: [staff, supplier, rent, utilities, daily, others],
          backgroundColor: ["#E87A3A", "#D4782E", "#E89B6D", "#F5C4A8", "#A04A35", "#7A3A2A"],
          borderWidth: 0,
          hoverOffset: 4
        }
      ]
    },
    options: (() => {
      const c = chartThemeColors();
      return {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "58%",
        animation: { duration: 650, easing: "easeOutQuart" },
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: c.text, font: { family: "Plus Jakarta Sans", size: 11, weight: "600" }, usePointStyle: true, boxWidth: 8 }
          }
        }
      };
    })()
  });
}

function renderRecentTransactions() {
  const el = document.getElementById("recentTransactionsList");
  if (!el) return;

  const { fromISO, toISO } = getDashboardPeriodRange();
  const inRange = (d) => dateInPeriod(d, fromISO, toISO);

  const tx = [];
  state.sales.forEach((s) => {
    if (!inRange(s.date)) return;
    const a = saleAmounts(s);
    tx.push({ kind: "Sale", date: s.date || "", amount: a.total, status: "in" });
  });
  (state.orders || []).forEach((o) => {
    if (!inRange(o.date)) return;
    tx.push({ kind: "POS order", date: o.date || "", amount: num(o.total), status: "order" });
  });
  state.purchases.forEach((p) => {
    if (!inRange(p.date)) return;
    tx.push({ kind: "Supplier Bill", date: p.date || "", amount: num(p.price), status: p.paidStatus });
  });
  state.expenses.forEach((e) => {
    if (!inRange(e.date)) return;
    tx.push({ kind: "Expense", date: e.date || "", amount: num(e.amount), status: e.status });
  });
  state.salaries.forEach((s) => {
    const d = s.paidAt || (s.month ? `${s.month}-01` : "");
    if (!inRange(d)) return;
    tx.push({ kind: "Salary", date: d, amount: payableForSalaryNonNegative(s), status: s.status });
  });

  const recent = tx
    .filter((x) => x.date)
    .sort(byDateDesc)
    .slice(0, 10);

  el.innerHTML =
    recent
      .map((x) => {
        const pill = x.status ? `<span class="pill">${escapeHtml(String(x.status))}</span>` : "";
        return `<div class="dpro-tl-item"><div><div class="dpro-tl-kind">${escapeHtml(x.kind)} ${pill}</div><div class="dpro-tl-meta">${escapeHtml(String(x.date))}</div></div><div><strong>${money(x.amount)}</strong></div></div>`;
      })
      .join("") || `<div class="muted">No transactions yet.</div>`;
}

function renderUpcomingPayments() {
  const el = document.getElementById("upcomingPaymentsList");
  if (!el) return;

  const items = [];

  // Reminders
  state.reminders.forEach((r) => {
    const dueDate = String(r.dueDate || "").slice(0, 10);
    if (!dueDate) return;
    items.push({ kind: "Reminder", title: r.title || "Payment due", dueDate });
  });

  // Unpaid supplier bills (treat as due now)
  state.purchases
    .filter((p) => !isPurchasePaid(p))
    .forEach((p) => {
      items.push({
        kind: "Supplier Due",
        title: `${p.seller || "Supplier"} — ${p.item || "Bill"}`,
        dueDate: String(p.date || todayISO()).slice(0, 10),
        amount: num(p.price)
      });
    });

  // Unpaid expenses (treat as due now)
  state.expenses
    .filter((e) => e.status === "unpaid")
    .forEach((e) => {
      items.push({
        kind: "Expense Due",
        title: `${e.category || e.type || "Expense"}${e.note ? ` — ${e.note}` : ""}`,
        dueDate: String(e.date || todayISO()).slice(0, 10),
        amount: num(e.amount)
      });
    });

  // Unpaid salary entries (treat salary month end as due date)
  state.salaries
    .filter((s) => s.status === "unpaid" && s.month)
    .forEach((s) => {
      const [y, m] = String(s.month).split("-").map(Number);
      const last = localISODate(new Date(y, m, 0));
      items.push({
        kind: "Salary Due",
        title: `${s.name || "Staff"} salary`,
        dueDate: last,
        amount: payableForSalaryNonNegative(s)
      });
    });

  const sorted = items.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 8);

  el.innerHTML =
    sorted
      .map((x) => {
        const left = `${x.kind}: <strong>${x.title}</strong>`;
        const d = daysUntil(x.dueDate);
        const right = `${d >= 0 ? `${d}d` : `${Math.abs(d)}d late`} ${x.amount ? `• ${money(x.amount)}` : ""}`;
        return `<div class="row"><div>${left}</div><div>${right}</div></div>`;
      })
      .join("") || `<div class="muted">No upcoming payments.</div>`;
}

function maybeNotifyReminders() {
  const t = todayISO();
  const seenKey = `kg_reminder_toast_${t}`;
  let seen = {};
  try {
    seen = JSON.parse(sessionStorage.getItem(seenKey) || "{}") || {};
  } catch (_) {
    seen = {};
  }
  state.reminders.forEach((r) => {
    const due = String(r.dueDate || "").slice(0, 10);
    const before = Math.max(0, Math.floor(num(r.notifyBeforeDays)));
    if (!due) return;
    const notifyDate = isoAddDays(due, -before);
    if (notifyDate !== t) return;
    const id = String(r.id || `${r.title}|${due}`);
    if (seen[id]) return;
    seen[id] = 1;
    toast(`Reminder: ${r.title || "Payment due"} in ${before} day(s)`, "info", 3000);
  });
  try {
    sessionStorage.setItem(seenKey, JSON.stringify(seen));
  } catch (_) {}
  renderNotifCenter();
}

function collectNotifItems() {
  const items = [];
  const t = todayISO();
  (state.reminders || []).forEach((r) => {
    const due = String(r.dueDate || "").slice(0, 10);
    if (!due) return;
    const d = daysUntil(due);
    const before = Math.max(0, Math.floor(num(r.notifyBeforeDays)));
    const urgent = d <= before;
    items.push({
      kind: "reminder",
      title: r.title || "Reminder",
      sub: d < 0 ? `${Math.abs(d)}d overdue · due ${due}` : `Due ${due} · ${d}d left`,
      sort: d,
      urgent: urgent || d <= 3
    });
  });
  const stock = window.KgPhase2?.stockAlerts?.({
    inventory: state.inventory,
    lots: state.stockLots,
    today: t,
    warnDays: 3
  }) || [];
  stock.forEach((a) => {
    items.push({
      kind: a.kind || "stock",
      title: a.text,
      sub: "Inventory alert",
      sort: a.sort ?? 0,
      urgent: true
    });
  });
  return items.sort((a, b) => a.sort - b.sort).slice(0, 12);
}

function renderNotifCenter() {
  const list = document.getElementById("notifList");
  const badge = document.getElementById("notifBadge");
  if (!list) return;
  const items = collectNotifItems();
  if (badge) {
    if (items.length) {
      badge.hidden = false;
      badge.textContent = String(items.length > 9 ? "9+" : items.length);
    } else {
      badge.hidden = true;
    }
  }
  list.innerHTML =
    items
      .map(
        (it) =>
          `<div class="notif-item"><div class="notif-item-title">${escapeHtml(it.title)}</div><div class="notif-item-sub">${escapeHtml(it.sub)} · ${escapeHtml(it.kind)}</div></div>`
      )
      .join("") || `<div class="notif-empty">No reminders right now</div>`;
}

window.toggleNotifPanel = function (ev) {
  ev?.stopPropagation?.();
  const panel = document.getElementById("notifPanel");
  if (!panel) return;
  const open = panel.hasAttribute("hidden");
  if (open) {
    renderNotifCenter();
    panel.removeAttribute("hidden");
  } else {
    panel.setAttribute("hidden", "");
  }
  if (window.lucide?.createIcons) window.lucide.createIcons();
};

window.closeNotifPanel = function () {
  document.getElementById("notifPanel")?.setAttribute("hidden", "");
};

document.addEventListener("click", (e) => {
  const wrap = document.querySelector(".notif-wrap");
  if (!wrap) return;
  if (!wrap.contains(e.target)) window.closeNotifPanel?.();
});

function transferInRange(dateISO, range, fromId, toId) {
  const d = String(dateISO || "").slice(0, 10);
  if (!d) return false;
  if (range === "today") return d === todayISO();
  if (range === "week" || range === "month") return withinRange(d, range);
  if (range === "custom") {
    const from = document.getElementById(fromId)?.value || "";
    const to = document.getElementById(toId)?.value || "";
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }
  return true;
}

function syncBtHistoryRangeInputs(rangeId, fromId, toId) {
  const range = document.getElementById(rangeId)?.value || "month";
  const fromEl = document.getElementById(fromId);
  const toEl = document.getElementById(toId);
  if (!fromEl || !toEl) return;
  const show = range === "custom";
  fromEl.style.display = show ? "block" : "none";
  toEl.style.display = show ? "block" : "none";
  if (show) {
    if (!fromEl.value) fromEl.value = isoAddDays(todayISO(), -30);
    if (!toEl.value) toEl.value = todayISO();
  }
}

function accountLabel(acct) {
  const a = String(acct || "").toLowerCase();
  return a === "bank" ? "Bank" : "Cash";
}

window.onBtAccountChange = function () {
  const from = document.getElementById("btFromAccount")?.value || "cash";
  const toSel = document.getElementById("btToAccount");
  if (!toSel) return;
  toSel.value = from === "cash" ? "bank" : "cash";
  renderBalanceTransferForm();
};

function renderBalanceTransferForm() {
  const t = calcTotals();
  const cashEl = document.getElementById("btAvailCash");
  const bankEl = document.getElementById("btAvailBank");
  if (cashEl) cashEl.textContent = money(t.cashBalance);
  if (bankEl) bankEl.textContent = money(t.bankBalance);
}

function renderBalanceTransferHistory() {
  const table = document.getElementById("btHistoryTable");
  if (!table) return;
  syncBtHistoryRangeInputs("btHistoryRange", "btHistoryFrom", "btHistoryTo");
  const range = document.getElementById("btHistoryRange")?.value || "month";
  const rows = [...state.balanceTransfers]
    .filter((r) => transferInRange(r.date, range, "btHistoryFrom", "btHistoryTo"))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  table.innerHTML = `<div class="table-row"><strong>Date</strong><strong>From</strong><strong>To</strong><strong>Amount</strong><strong>Notes</strong><strong></strong></div>`;
  if (!rows.length) {
    table.innerHTML += `<div class="muted">No transfers in this period.</div>`;
    return;
  }
  rows.forEach((r) => {
    table.innerHTML += `<div class="table-row">
      <div>${String(r.date || "").slice(0, 10)}</div>
      <div>${accountLabel(r.fromAccount)}</div>
      <div>${accountLabel(r.toAccount)}</div>
      <div>${money(r.amount)}</div>
      <div>${r.notes || "—"}</div>
      <div><button type="button" class="warn btn-sm" onclick="removeBalanceTransfer('${r.id}')">Delete</button></div>
    </div>`;
  });
}

window.renderAnalyticsTransferHistory = function () {
  const table = document.getElementById("anBtHistoryTable");
  if (!table) return;
  syncBtHistoryRangeInputs("anBtRange", "anBtFrom", "anBtTo");
  const range = document.getElementById("anBtRange")?.value || "month";
  const rows = [...state.balanceTransfers]
    .filter((r) => transferInRange(r.date, range, "anBtFrom", "anBtTo"))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  table.innerHTML = `<div class="table-row"><strong>Date</strong><strong>From</strong><strong>To</strong><strong>Amount</strong><strong>Notes</strong></div>`;
  if (!rows.length) {
    table.innerHTML += `<div class="muted">No balance transfers in this period.</div>`;
    return;
  }
  rows.forEach((r) => {
    table.innerHTML += `<div class="table-row">
      <div>${String(r.date || "").slice(0, 10)}</div>
      <div>${accountLabel(r.fromAccount)}</div>
      <div>${accountLabel(r.toAccount)}</div>
      <div>${money(r.amount)}</div>
      <div>${r.notes || "—"}</div>
    </div>`;
  });
};

window.addBalanceTransfer = function () {
  const fromAccount = document.getElementById("btFromAccount")?.value || "cash";
  const toAccount = document.getElementById("btToAccount")?.value || "bank";
  const amount = num(document.getElementById("btAmount")?.value);
  const date = document.getElementById("btDate")?.value || todayISO();
  const notes = (document.getElementById("btNotes")?.value || "").trim();

  if (fromAccount === toAccount) return toast("Cannot transfer to the same account", "error");
  if (!(amount > 0)) return toast("Amount must be greater than zero", "error");
  if (!api?.balanceTransfers?.create) return toast("Balance transfer API not ready", "error");

  const t = calcTotals();
  const available = fromAccount === "cash" ? t.cashBalance : t.bankBalance;
  if (amount > available + 0.009) {
    return toast(`Insufficient ${fromAccount} balance. Available: ${money(available)}`, "error");
  }

  withErr(async () => {
    await api.balanceTransfers.create({ date, fromAccount, toAccount, amount, notes });
    document.getElementById("btAmount").value = "";
    document.getElementById("btNotes").value = "";
    await loadAll();
    renderBalanceTransferForm();
    renderBalanceTransferHistory();
  });
};

window.removeBalanceTransfer = function (id) {
  if (!id) return;
  if (!confirm("Delete this transfer? Balances will be reversed automatically.")) return;
  if (!api?.balanceTransfers?.remove) return toast("Delete not supported", "error");
  withErr(async () => {
    await api.balanceTransfers.remove(id);
    await loadAll();
    renderBalanceTransferForm();
    renderBalanceTransferHistory();
    window.renderAnalyticsTransferHistory?.();
    toast("Transfer deleted", "ok");
  });
};

function suggestedOpeningCash(dateISO) {
  const d = String(dateISO || "").slice(0, 10);
  const prev = isoAddDays(d, -1);
  const prevClose = state.dailyClosings.find((c) => String(c.date || "").slice(0, 10) === prev);
  if (prevClose) return num(prevClose.actualCashCounted);
  return 0;
}

function dailyClosingForDate(dateISO) {
  const d = String(dateISO || "").slice(0, 10);
  return state.dailyClosings.find((c) => String(c.date || "").slice(0, 10) === d) || null;
}

function computeDailyClosingFigures(dateISO, openingCash) {
  const bm = window.balanceMath;
  const snap = balanceDataSnapshot();
  const sales = bm ? bm.cashSalesOnDate(snap, dateISO) : 0;
  const expenses = bm ? bm.cashExpensesOnDate(snap, dateISO) : 0;
  const xfer = bm ? bm.transfersOnDate(snap, dateISO) : { cashToBank: 0, bankToCash: 0 };
  const opening = num(openingCash);
  const expected = opening + sales - expenses - xfer.cashToBank + xfer.bankToCash;
  return {
    openingCash: opening,
    cashSales: sales,
    cashExpenses: expenses,
    cashDepositedToBank: xfer.cashToBank,
    cashFromBank: xfer.bankToCash,
    expectedCash: expected
  };
}

window.refreshDailyClosingPreview = function () {
  const date = document.getElementById("dcDate")?.value || todayISO();
  const openingEl = document.getElementById("dcOpeningCash");
  if (openingEl && !openingEl.dataset.touched) {
    const suggested = suggestedOpeningCash(date);
    if (suggested > 0 || !openingEl.value) openingEl.value = suggested ? String(suggested) : "";
  }
  const opening = num(openingEl?.value);
  const fig = computeDailyClosingFigures(date, opening);
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = money(v);
  };
  set("dcPreviewOpening", fig.openingCash);
  set("dcPreviewSales", fig.cashSales);
  set("dcPreviewExpenses", fig.cashExpenses);
  set("dcPreviewDeposited", fig.cashDepositedToBank);
  set("dcPreviewFromBank", fig.cashFromBank);
  set("dcPreviewExpected", fig.expectedCash);

  const actual = num(document.getElementById("dcActualCash")?.value);
  const diff = actual - fig.expectedCash;
  const diffEl = document.getElementById("dcDifference");
  if (diffEl) {
    diffEl.value = money(diff);
    diffEl.style.color = diff < 0 ? "var(--expense)" : diff > 0 ? "var(--primary)" : "var(--text-primary)";
  }
};

window.closeDay = function () {
  const date = document.getElementById("dcDate")?.value || todayISO();
  if (dailyClosingForDate(date)) return toast("This day is already closed. Delete the record to re-close.", "error");

  const opening = num(document.getElementById("dcOpeningCash")?.value);
  const actual = num(document.getElementById("dcActualCash")?.value);
  const reason = (document.getElementById("dcReason")?.value || "").trim();
  const fig = computeDailyClosingFigures(date, opening);
  const difference = actual - fig.expectedCash;

  if (!(actual >= 0) || !document.getElementById("dcActualCash")?.value) return toast("Enter actual cash counted", "error");
  if (Math.abs(difference) > 0.009 && !reason) return toast("Enter a reason for the cash difference", "error");
  if (!api?.dailyClosings?.create) return toast("Daily closing API not ready", "error");

  withErr(async () => {
    await api.dailyClosings.create({
      date: String(date).slice(0, 10),
      openingCash: fig.openingCash,
      cashSales: fig.cashSales,
      cashExpenses: fig.cashExpenses,
      cashDepositedToBank: fig.cashDepositedToBank,
      cashFromBank: fig.cashFromBank,
      expectedCash: fig.expectedCash,
      actualCashCounted: actual,
      difference,
      reason,
      closedAt: new Date().toISOString()
    });
    document.getElementById("dcActualCash").value = "";
    document.getElementById("dcReason").value = "";
    const openingEl = document.getElementById("dcOpeningCash");
    if (openingEl) delete openingEl.dataset.touched;
    await loadAll();
    refreshDailyClosingPreview();
  });
};

function renderDailyClosingHistory() {
  const el = document.getElementById("dcHistoryList");
  if (!el) return;
  el.innerHTML = [...state.dailyClosings]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .map((c) => {
      const d = String(c.date || "").slice(0, 10);
      const diff = num(c.difference);
      return `<div class="row" style="grid-template-columns:1fr auto;">
        <div>
          <strong>${d}</strong>
          <span class="pill">Expected ${money(c.expectedCash)}</span>
          <span class="pill">Actual ${money(c.actualCashCounted)}</span>
          <span class="pill">Diff ${money(diff)}</span>
          ${c.reason ? `<span class="muted"> — ${c.reason}</span>` : ""}
        </div>
        <button type="button" class="warn btn-sm" onclick="removeDailyClosing('${c.id}')">Delete</button>
      </div>`;
    })
    .join("") || `<div class="muted">No daily closings yet.</div>`;
}

window.removeDailyClosing = function (id) {
  if (!id || !confirm("Delete this daily closing record?")) return;
  if (!api?.dailyClosings?.remove) return toast("Delete not supported", "error");
  withErr(async () => {
    await api.dailyClosings.remove(id);
    await loadAll();
    refreshDailyClosingPreview();
    toast("Closing record deleted", "ok");
  });
};

// -----------------------------
// CRUD actions
// -----------------------------

window.showSection = function (sectionName) {
  if (window.KgAuth && !window.KgAuth.canAccessSection(sectionName)) {
    toast("Your role cannot open this section", "error");
    return;
  }
  activeSection = sectionName;
  closeAppSidebar();
  document.querySelectorAll(".dashboard-section").forEach((section) => {
    section.classList.remove("active");
    section.setAttribute("hidden", "");
    section.style.display = "none";
  });
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  const targetSection = document.getElementById(`${sectionName}-section`);
  const targetNav = document.querySelector(`.nav-item[data-section="${sectionName}"], .nav-item[onclick="showSection('${sectionName}')"]`);
  if (targetSection) {
    targetSection.classList.add("active");
    targetSection.removeAttribute("hidden");
    targetSection.style.display = targetSection.classList.contains("dashboard-pro") ? "flex" : "block";
  }
  if (targetNav) targetNav.classList.add("active");
  try {
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  } catch (_) {
    window.scrollTo(0, 0);
  }
  if (sectionName === "expenses") {
    window.onBillPaidStatusChanged?.();
    refreshBillCategorySelect();
    renderRecurringExpenses();
    renderExpenseItemAnalytics();
  }
  if (sectionName === "documents") {
    renderDocuments();
  }
  if (sectionName === "analytics") {
    window.renderAnalytics?.();
    window.renderAnalyticsTransferHistory?.();
    renderStockAlerts();
  }
  if (sectionName === "balance-transfer") {
    renderBalanceTransferForm();
    renderBalanceTransferHistory();
  }
  if (sectionName === "daily-closing") {
    refreshDailyClosingPreview();
    renderDailyClosingHistory();
  }
  if (sectionName === "staff") window.showStaffTab?.(staffTab);
  if (sectionName === "menu") {
    refreshMenu();
  }
  if (sectionName === "inventory") {
    fillInventoryMoveSelect();
    renderInventory();
    renderStockLots();
    renderStockAlerts();
    renderInventoryMovements();
  }
  if (sectionName === "reminders") {
    renderReminders();
  }
  if (sectionName === "profit-analysis") {
    renderProfitAnalysis();
  }
  if (sectionName === "dashboard") {
    try {
      window.KG?.liveSales?.bindOnce?.();
      window.KG?.liveSales?.onDashboardEnter?.();
    } catch (e) {
      console.warn(e);
    }
  } else {
    try {
      window.KG?.liveSales?.onDashboardLeave?.();
    } catch (_) {}
  }
  if (sectionName === "pos") {
    if (window.__sidebarBeforePos == null) {
      window.__sidebarBeforePos = document.body.classList.contains("sidebar-collapsed");
    }
    document.body.classList.add("pos-mode");
    setSidebarCollapsed(true);
    applySidebarButtonText();
    try {
      window.KG?.posUI?.mount?.();
      window.KG?.pos?.onEnter?.();
    } catch (e) {
      console.warn(e);
      // Fallback to legacy POS helpers if upgrade modules fail
      loadPosTickets();
      refreshMenuForPos().then(() => syncKilogramMenuInBackground());
      renderPosCart();
      renderPosPayment();
      renderPosCategoryChips();
      renderPosTickets();
    }
  } else {
    document.body.classList.remove("pos-mode");
    if (window.__sidebarBeforePos != null) {
      setSidebarCollapsed(!!window.__sidebarBeforePos);
      window.__sidebarBeforePos = null;
    }
  }
};

window.showSupplierTab = function (tab) {
  supplierTab = tab || "manage";
  document.querySelectorAll("#supplier-section .tabPanel").forEach((p) => p.classList.remove("active"));
  const active = document.getElementById(`supplierTab-${supplierTab}`);
  if (active) active.classList.add("active");

  document.querySelectorAll("#supplier-section .tabBtn").forEach((b) => b.classList.remove("active"));
  const btn = document.querySelector(`#supplier-section .tabBtn[data-sup-tab="${supplierTab}"]`);
  if (btn) btn.classList.add("active");

  // Ensure derived views refresh when opening those tabs
  if (supplierTab === "bills") onPurchasePaidStatusChanged();
  if (supplierTab === "pay") renderSupplierRemaining();
  if (supplierTab === "history") window.renderSupplierHistory?.();
};

window.showStaffTab = function (tab) {
  staffTab = tab || "add";
  document.querySelectorAll("#staff-section .tabPanel").forEach((p) => p.classList.remove("active"));
  const active = document.getElementById(`staffTab-${staffTab}`);
  if (active) active.classList.add("active");

  document.querySelectorAll("#staff-section .tabBtn").forEach((b) => b.classList.remove("active"));
  const btn = document.querySelector(`#staff-section .tabBtn[data-staff-tab="${staffTab}"]`);
  if (btn) btn.classList.add("active");
  if (staffTab === "attendance") {
    const attMonth = document.getElementById("attMonth");
    if (attMonth && !attMonth.value) attMonth.value = monthISO();
    const attDate = document.getElementById("attDate");
    if (attDate && !attDate.value) attDate.value = todayISO();
    renderAttendanceMonthUi();
  }
  if (staffTab === "salary") window.renderSalaryOverview?.();
};

window.addSale = function () {
  // Check if API is available
  if (!window.api) {
    toast('Firebase not connected. Please refresh the page.', 'error');
    return;
  }
  
  const date = document.getElementById("saleDate")?.value || todayISO();
  const cashAmount = num(document.getElementById("saleCashAmount")?.value);
  const swiggyAmount = num(document.getElementById("saleSwiggyAmount")?.value);
  const zomatoAmount = num(document.getElementById("saleZomatoAmount")?.value);
  const otherOnlineAmount = num(document.getElementById("saleOtherOnlineAmount")?.value);
  const onlineAmount = swiggyAmount + zomatoAmount + otherOnlineAmount;
  const notes = (document.getElementById("saleNote")?.value || "").trim();
  const totalAmount = cashAmount + onlineAmount;
  // Manual sales form — POS bills auto-post with source:"pos"
  
  // Allow saving if at least one field has value
  if (!(totalAmount > 0)) return toast("Enter cash, Swiggy, Zomato, or Other Online amount", "error");
  
  withErr(async () => {
    await api.sales.create({ 
      date, 
      cashAmount, 
      swiggyAmount, 
      zomatoAmount, 
      otherOnlineAmount,
      onlineAmount, 
      totalAmount, 
      notes,
      method: 'mixed',
      source: 'manual'
    });
    
    // Clear all fields
    if (document.getElementById("saleCashAmount")) document.getElementById("saleCashAmount").value = "";
    if (document.getElementById("saleSwiggyAmount")) document.getElementById("saleSwiggyAmount").value = "";
    if (document.getElementById("saleZomatoAmount")) document.getElementById("saleZomatoAmount").value = "";
    if (document.getElementById("saleOtherOnlineAmount")) document.getElementById("saleOtherOnlineAmount").value = "";
    if (document.getElementById("saleNote")) document.getElementById("saleNote").value = "";
    
    await loadAll();
  });
};

// -----------------------------
// Menu Management
// -----------------------------

window.resetMenuForm = function () {
  menuEditId = null;
  menuImageDataUrl = "";
  const ids = ["menuName", "menuNameHi", "menuPrice", "menuCategory", "menuAvailable", "menuRecipe"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === "menuAvailable") el.value = "true";
    else el.value = "";
  });
  const fileEl = document.getElementById("menuImageFile");
  if (fileEl) fileEl.value = "";
  const prev = document.getElementById("menuImagePreview");
  if (prev) prev.src = "assets/the-kilogram-logo.png";
};

window.refreshMenu = async function () {
  try {
    api = window.api;
    if (!api?.menuItems?.list) return;
    setLoading(true);
    const res = await api.menuItems.list();
    state.menuItems = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);
    renderMenuFilters();
    renderMenuList();
  } catch (e) {
    console.error(e);
    toast(e.message || "Failed to load menu", "error");
  } finally {
    setLoading(false);
  }
};

function renderMenuFilters() {
  const catSel = document.getElementById("menuCategoryFilter");
  if (!catSel) return;
  const cats = uniq(state.menuItems.map((m) => m.category || "General")).sort((a, b) => String(a).localeCompare(String(b)));
  const current = catSel.value || "";
  catSel.innerHTML = `<option value="">All</option>` + cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  catSel.value = cats.includes(current) ? current : "";

  const posCat = document.getElementById("posCategory");
  if (posCat) {
    const cur = posCat.value || "";
    posCat.innerHTML = `<option value="">All</option>` + cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    posCat.value = cats.includes(cur) ? cur : "";
  }
}

window.renderMenuList = function () {
  const wrap = document.getElementById("menuList");
  if (!wrap) return;

  const q = (document.getElementById("menuSearch")?.value || "").trim().toLowerCase();
  const cat = document.getElementById("menuCategoryFilter")?.value || "";

  let items = Array.isArray(state.menuItems) ? [...state.menuItems] : [];
  if (cat) items = items.filter((m) => String(m.category || "") === cat);
  if (q) items = items.filter((m) => String(m.name || "").toLowerCase().includes(q));
  items.sort((a, b) => String(a.category || "").localeCompare(String(b.category || "")) || String(a.name || "").localeCompare(String(b.name || "")));

  if (!items.length) {
    wrap.innerHTML = `<div class="muted" style="padding: 10px;">No items</div>`;
    return;
  }

  wrap.innerHTML = items
    .map((m) => {
      const badge = m.available ? `<span class="pill" style="background: rgba(79, 70, 229,0.12); border:1px solid rgba(79, 70, 229,0.25); color:var(--primary);">Available</span>`
        : `<span class="pill" style="background: rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.25); color:#fecaca;">Unavailable</span>`;
      return `
        <div class="row">
          <div style="display:flex; gap: 12px; align-items:center;">
            <img src="${escapeHtml(m.imageUrl || "assets/the-kilogram-logo.png")}" style="width:52px;height:52px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,0.06);" onerror="this.src='assets/the-kilogram-logo.png'"/>
            <div>
              <div style="display:flex; gap: 10px; align-items:center; flex-wrap:wrap;">
                <div style="font-weight:900;">${escapeHtml(m.name)}</div>
                ${badge}
              </div>
              ${m.nameHi ? `<div class="muted" style="font-size: 12px; margin-top:2px;">${escapeHtml(m.nameHi)}</div>` : ""}
              <div class="muted" style="font-size: 12px;">${escapeHtml(m.category || "General")} • ${money(m.price)}</div>
            </div>
          </div>
          <div style="display:flex; gap: 10px; align-items:center; justify-content:flex-end; flex-wrap:wrap;">
            <button class="btn btn-secondary" onclick="toggleMenuAvailable('${m.id}', ${m.available ? "false" : "true"})">${m.available ? "Mark Unavailable" : "Mark Available"}</button>
            <button class="btn btn-secondary" onclick="editMenuItem('${m.id}')">Edit</button>
            <button class="warn" onclick="deleteMenuItem('${m.id}')">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");
};

window.editMenuItem = function (id) {
  const m = state.menuItems.find((x) => x.id === id);
  if (!m) return;
  menuEditId = id;
  document.getElementById("menuName").value = m.name || "";
  const nameHiEl = document.getElementById("menuNameHi");
  if (nameHiEl) nameHiEl.value = m.nameHi || "";
  document.getElementById("menuPrice").value = num(m.price);
  document.getElementById("menuCategory").value = m.category || "";
  menuImageDataUrl = String(m.imageUrl || "");
  const prev = document.getElementById("menuImagePreview");
  if (prev) prev.src = menuImageDataUrl || "assets/the-kilogram-logo.png";
  const fileEl = document.getElementById("menuImageFile");
  if (fileEl) fileEl.value = "";
  document.getElementById("menuAvailable").value = m.available ? "true" : "false";
  const recipeEl = document.getElementById("menuRecipe");
  if (recipeEl) {
    recipeEl.value =
      window.KgPhase2?.formatRecipe?.(m.recipe) || m.recipeText || "";
  }
  toast("Editing item. Update fields and click Save.", "info");
};

window.onMenuImagePicked = async function (event) {
  try {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Please select an image file", "error");
    if (file.size > 2.5 * 1024 * 1024) return toast("Image too large (max ~2.5MB)", "error");

    // Compress + resize before saving (faster uploads + smaller DB writes)
    const dataUrl = await (async () => {
      const readAsDataURL = (f) =>
        new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ""));
          r.onerror = () => reject(new Error("Failed to read file"));
          r.readAsDataURL(f);
        });

      const url = await readAsDataURL(file);
      let img = null;
      try {
        img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error("Failed to decode image"));
          i.src = url;
        });
      } catch (e) {
        // Some formats (e.g. HEIC) may not decode in some browsers.
        // Fall back to the original DataURL (still subject to size limits).
        toast("Image format not supported for compression. Saving original (may be slower).", "info");
        return url;
      }

      const maxW = 720;
      const maxH = 480;
      let w = img.width || maxW;
      let h = img.height || maxH;
      const scale = Math.min(1, maxW / w, maxH / h);
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return url;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);

      // Prefer JPEG for speed/size unless PNG with transparency is needed (rare for menu photos)
      const out = canvas.toDataURL("image/jpeg", 0.72);
      return out;
    })();

    // Guard: if still huge, warn and keep anyway
    if (dataUrl.length > 600_000) {
      toast("Image is still large. Consider smaller photo for faster save.", "info");
    }

    menuImageDataUrl = dataUrl;
    const prev = document.getElementById("menuImagePreview");
    if (prev) prev.src = menuImageDataUrl;
  } catch (e) {
    console.error(e);
    toast(e.message || "Failed to load image", "error");
  }
};

window.toggleMenuAvailable = async function (id, available) {
  try {
    setLoading(true);
    await api.menuItems.update(id, { available: !!available });
    await refreshMenu();
    await refreshMenuForPos();
  } catch (e) {
    console.error(e);
    toast(e.message || "Failed to update item", "error");
  } finally {
    setLoading(false);
  }
};

window.saveMenuItem = async function () {
  try {
    api = window.api;
    if (!api?.menuItems) throw new Error("Menu API not ready");

    const name = (document.getElementById("menuName")?.value || "").trim();
    const price = num(document.getElementById("menuPrice")?.value);
    const category = (document.getElementById("menuCategory")?.value || "").trim() || "General";
    const available = (document.getElementById("menuAvailable")?.value || "true") === "true";
    const imageUrl = String(menuImageDataUrl || "");
    const isFirebaseMode = !!window.__firebaseReady && !window.__firebaseInitError;
    // Firestore document size limit is ~1MB. Base64 grows quickly, so keep a safe margin.
    const maxLen = isFirebaseMode ? 850_000 : 1_200_000;
    if (imageUrl && imageUrl.length > maxLen) {
      return toast(
        isFirebaseMode
          ? "Image too large for Firebase. Use a smaller photo (try screenshot or lower-res)."
          : "Image too large. Please pick a smaller image (faster save).",
        "error"
      );
    }

    if (!name) return toast("Enter name", "error");
    if (!(price >= 0)) return toast("Enter valid price", "error");

    let nameHi = (document.getElementById("menuNameHi")?.value || "").trim();
    if (!nameHi && name && looksLikeLatinMenuName(name)) {
      toast("Translating name to Hindi…", "info");
      const auto = await translateEnToHi(name);
      if (auto) nameHi = auto;
    }

    setLoading(true);
    const recipe = window.KgPhase2?.parseRecipe?.(document.getElementById("menuRecipe")?.value) || [];
    const payload = { name, nameHi, price, category, imageUrl, available, recipe, recipeText: window.KgPhase2?.formatRecipe?.(recipe) || "" };
    if (menuEditId) await api.menuItems.update(menuEditId, payload);
    else await api.menuItems.create(payload);

    window.resetMenuForm();
    await refreshMenu();
    await refreshMenuForPos();
    toast("Saved", "success");
  } catch (e) {
    console.error(e);
    toast(e.message || "Failed to save item", "error");
  } finally {
    setLoading(false);
  }
};

window.menuAutoFillHindiFromEnglish = async function () {
  try {
    const name = (document.getElementById("menuName")?.value || "").trim();
    if (!name) return toast("Enter English name first", "error");
    if (!looksLikeLatinMenuName(name)) return toast("Name already looks non-English; edit Hindi field manually if needed", "info");
    setLoading(true);
    toast("Translating…", "info");
    const hi = await translateEnToHi(name);
    const el = document.getElementById("menuNameHi");
    if (hi && el) {
      el.value = hi;
      toast("Hindi filled — review and save", "success");
    } else {
      toast("Could not translate (check internet or try again)", "error");
    }
  } catch (e) {
    console.error(e);
    toast(e.message || "Translation failed", "error");
  } finally {
    setLoading(false);
  }
};

/** One-click: save Hindi for every menu row that is missing `nameHi` (uses internet; throttled). */
window.backfillAllMenuHindi = async function () {
  if (!confirm("Fill Hindi names for all items missing Hindi? Uses internet and may take a few minutes.")) return;
  try {
    api = window.api;
    if (!api?.menuItems?.list || !api.menuItems.update) throw new Error("Menu API not ready");
    setLoading(true);
    const list = await api.menuItems.list();
    const items = Array.isArray(list) ? list : [];
    let n = 0;
    for (const m of items) {
      const id = m.id || m._id;
      const nm = String(m.name || "").trim();
      const hi = String(m.nameHi || "").trim();
      if (!id || !nm || hi) continue;
      if (!looksLikeLatinMenuName(nm)) continue;
      const auto = await translateEnToHi(nm);
      if (auto) {
        await api.menuItems.update(id, { nameHi: auto });
        n += 1;
      }
      await new Promise((r) => setTimeout(r, 450));
    }
    await refreshMenu();
    await refreshMenuForPos();
    toast(n ? `Updated Hindi for ${n} item(s)` : "Nothing to update (or translation failed)", n ? "success" : "info");
  } catch (e) {
    console.error(e);
    toast(e.message || "Backfill failed", "error");
  } finally {
    setLoading(false);
  }
};

window.deleteMenuItem = async function (id) {
  if (!confirm("Delete this menu item?")) return;
  try {
    setLoading(true);
    await api.menuItems.remove(id);
    await refreshMenu();
    await refreshMenuForPos();
    toast("Deleted", "success");
  } catch (e) {
    console.error(e);
    toast(e.message || "Failed to delete", "error");
  } finally {
    setLoading(false);
  }
};

window.importMenuExcel = async function () {
  try {
    const file = document.getElementById("menuExcelFile")?.files?.[0];
    if (!file) return toast("Select an Excel or CSV file", "error");
    if (!window.XLSX) return toast("Excel library not loaded", "error");

    setLoading(true);
    const buf = await file.arrayBuffer();
    const isCsv = /\.csv$/i.test(file.name || "");
    const wb = isCsv
      ? window.XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string" })
      : window.XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) throw new Error("No sheet found");
    const rawRows = window.XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });

    const items = [];
    const skipped = [];
    for (const raw of rawRows) {
      const r = normalizeExcelRow(raw);
      const name = pickMenuName(r);
      const price = pickMenuPrice(r);
      const category = pickMenuCategory(r);
      const nameHi = String(r.nameHi || r.NameHi || r["Hindi name"] || r["Hindi Name"] || r.name_hi || "").trim();
      const imageUrl = String(r.imageUrl || r.ImageUrl || r.image || r.Image || "").trim();
      const available = String(r.available || r.Available || "true").toLowerCase() !== "false";
      if (!name) {
        skipped.push("empty name row");
        continue;
      }
      if (!Number.isFinite(price) || price < 0) {
        skipped.push(`${name}: bad price`);
        continue;
      }
      items.push({ name, nameHi, price, category, imageUrl, available });
    }

    if (!items.length) {
      toast(
        "No valid rows. Use columns like name + price (or Rate, MRP, Rs, Amount). Prices: 120, Rs 120, ₹1,200",
        "error"
      );
      return;
    }

    if (api.menuItems.bulkCreate) {
      const next = await api.menuItems.bulkCreate(items);
      if (Array.isArray(next) && next.length) state.menuItems = next;
    } else {
      for (const it of items) await api.menuItems.create(it);
    }

    await refreshMenu();
    await refreshMenuForPos();
    const extra =
      skipped.length > 0 ? ` (${skipped.length} row(s) skipped — check names/prices)` : "";
    toast(`Imported ${items.length} item(s)${extra}`, "success");
  } catch (e) {
    console.error(e);
    toast(e.message || "Import failed", "error");
  } finally {
    setLoading(false);
  }
};

const KILOGRAM_MENU_SYNC_VERSION = "2026-05-25-v2";

function kilogramMenuSeedRows() {
  const seed = Array.isArray(window.KILOGRAM_MENU_SEED) ? window.KILOGRAM_MENU_SEED : [];
  return seed
    .map((it) => ({
      name: String(it.name || "").trim(),
      nameHi: String(it.nameHi || "").trim(),
      price: num(it.price),
      category: String(it.category || "General").trim(),
      imageUrl: String(it.imageUrl || "").trim(),
      available: it.available !== false,
    }))
    .filter((it) => it.name && Number.isFinite(it.price) && it.price >= 0);
}

function menuHasKilogramCategories(items) {
  const cats = new Set((items || []).map((m) => String(m.category || "").trim()));
  return cats.has("Chinese") && cats.has("Punjabi") && cats.has("Snacks");
}

function shouldAutoSyncKilogramMenu(items) {
  const rows = kilogramMenuSeedRows();
  if (!rows.length) return false;
  if (!Array.isArray(items) || !items.length) return true;
  if (!menuHasKilogramCategories(items)) return true;
  try {
    return localStorage.getItem("kg_kilogram_menu_sync_version") !== KILOGRAM_MENU_SYNC_VERSION;
  } catch {
    return true;
  }
}

let __kgMenuSyncPromise = null;

async function syncKilogramMenuToDb({ silent = false } = {}) {
  if (__kgMenuSyncPromise) return __kgMenuSyncPromise;

  const items = kilogramMenuSeedRows();
  if (!items.length) {
    if (!silent) toast("Kilogram menu file missing — refresh the page", "error");
    return false;
  }
  api = window.api;
  if (!api?.menuItems?.bulkCreate && !api?.menuItems?.create) {
    if (!silent) toast("Menu API not ready", "error");
    return false;
  }

  __kgMenuSyncPromise = (async () => {
  if (!silent) setLoading(true, "Uploading menu…");
  try {
    if (api.menuItems.bulkCreate) {
      const next = await api.menuItems.bulkCreate(items);
      if (Array.isArray(next) && next.length) state.menuItems = next;
    } else {
      for (const it of items) await api.menuItems.create(it);
    }
    try {
      localStorage.setItem("kg_kilogram_menu_sync_version", KILOGRAM_MENU_SYNC_VERSION);
    } catch {}
    const res = await api.menuItems.list();
    state.menuItems = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);
    renderMenuFilters();
    renderPosCategoryChips();
    renderPosMenu();
    if (!silent) toast(`Loaded ${items.length} Kilogram menu items`, "success");
    return true;
  } catch (e) {
    console.error(e);
    if (!silent) toast(e.message || "Failed to load Kilogram menu", "error");
    return false;
  } finally {
    if (!silent) setLoading(false);
  }
  })();

  try {
    return await __kgMenuSyncPromise;
  } finally {
    __kgMenuSyncPromise = null;
  }
}

let __kgMenuBgSyncDone = false;

function syncKilogramMenuInBackground() {
  if (__kgMenuBgSyncDone || __kgMenuSyncPromise) return;
  if (!shouldAutoSyncKilogramMenu(state.menuItems)) return;
  __kgMenuBgSyncDone = true;
  void syncKilogramMenuToDb({ silent: true })
    .then((ok) => {
      if (ok) toast("Kilogram menu ready — Snacks, Chinese, Mains, Punjabi", "ok");
    })
    .catch((e) => console.error(e))
    .finally(() => {
      __kgMenuBgSyncDone = false;
    });
}

/** Load full takeaway menu from constants/kilogramMenuSeed.js (The Kilogram website). */
window.loadKilogramOfficialMenu = async function () {
  const rows = kilogramMenuSeedRows();
  if (!rows.length) return toast("Kilogram menu data not loaded — refresh the page", "error");
  const msg =
    `Load ${rows.length} items from The Kilogram website menu?\n\n` +
    "Sections: Snacks, Chinese, Mains (bhaji/pulao), Punjabi, Beverages.\n" +
    "Existing items with the same name will be updated.";
  if (!confirm(msg)) return;
  try {
    localStorage.removeItem("kg_kilogram_menu_sync_version");
  } catch {}
  await syncKilogramMenuToDb({ silent: false });
  await refreshMenu();
  await refreshMenuForPos();
};

window.clearAllMenuItems = async function () {
  if (!confirm("Delete ALL menu items? This cannot be undone. Type OK in the next prompt.")) return;
  const ok = window.prompt('Type DELETE to confirm clearing the entire menu:');
  if (String(ok || "").trim() !== "DELETE") {
    toast("Cancelled", "error");
    return;
  }
  try {
    api = window.api;
    if (!api?.menuItems?.removeAll) throw new Error("Clear menu is not supported in this mode");
    setLoading(true);
    await api.menuItems.removeAll();
    await refreshMenu();
    await refreshMenuForPos();
    toast("All menu items removed", "success");
  } catch (e) {
    console.error(e);
    toast(e.message || "Failed to clear menu", "error");
  } finally {
    setLoading(false);
  }
};

// -----------------------------
// POS Billing
// -----------------------------

window.refreshMenuForPos = async function () {
  try {
    api = window.api;
    if (!api?.menuItems?.list) return;
    const res = await api.menuItems.list();
    state.menuItems = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);
    renderMenuFilters();
    renderPosCategoryChips();
    renderPosMenu();
  } catch (e) {
    console.error(e);
  }
};

window.renderPosMenu = function () {
  const wrap = document.getElementById("posMenuGrid");
  if (!wrap) return;

  const q = (document.getElementById("posSearch")?.value || "").trim().toLowerCase();
  const cat = posActiveCategory || "";

  let items = Array.isArray(state.menuItems) ? [...state.menuItems] : [];
  if (cat && cat !== "__favs") {
    items = items.filter((m) => String(m.category || "") === cat);
  }
  if (q) items = items.filter((m) => String(m.name || "").toLowerCase().includes(q));

  if (cat === "__favs") {
    const counts = window.__posFavCounts;
    if (counts && counts.size) {
      items.sort((a, b) => {
        const ka = favKeyFromMenuItem(a);
        const kb = favKeyFromMenuItem(b);
        const ca = counts.get(ka) || 0;
        const cb = counts.get(kb) || 0;
        if (cb !== ca) return cb - ca;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
      // show top favourites (still filtered by search if q was provided)
      items = items.slice(0, 32);
    } else {
      // no history yet
      wrap.innerHTML = `<div class="muted" style="padding: 10px;">No favourites yet.</div>`;
      return;
    }
  }

  // Group variants only when we can detect a real size (500g/1kg etc).
  // If no variant is detected, keep items separate (prevents "Default Default").
  const groups = new Map(); // key -> { baseName, category, imageUrl, rows: [...] }
  for (const m of items) {
    const { base, variant } = deriveBaseAndVariant(m.name);
    const catKey = String(m.category || "General");
    const key = variant
      ? `${catKey}@@${base.toLowerCase()}`
      : `${catKey}@@${String(m.name || "").trim().toLowerCase()}@@${String(m.id)}`;
    const g = groups.get(key) || {
      baseName: variant ? base : String(m.name || "").trim(),
      category: catKey,
      imageUrl: String(m.imageUrl || ""),
      rows: []
    };
    g.rows.push({
      id: String(m.id),
      name: String(m.name || ""),
      nameHi: String(m.nameHi || ""),
      price: num(m.price),
      available: !!m.available,
      variant
    });
    // prefer an image if group doesn't have one yet
    if (!g.imageUrl && m.imageUrl) g.imageUrl = String(m.imageUrl);
    groups.set(key, g);
  }

  const sorted = Array.from(groups.values()).sort((a, b) => a.baseName.localeCompare(b.baseName));
  window.__posVariantSel = window.__posVariantSel || {}; // { [groupKey]: selectedVariantId }

  wrap.innerHTML = sorted
    .map((g) => {
      const rows = g.rows.sort((a, b) => {
        // sort by weight (grams) so 500g comes before 1kg
        const ag = variantToGrams(a.variant);
        const bg = variantToGrams(b.variant);
        if (ag != null && bg != null && ag !== bg) return ag - bg;
        return String(a.variant || "").localeCompare(String(b.variant || ""));
      });
      const groupKey = `${normalizeKey(g.category)}@@${normalizeKey(g.baseName)}`;
      const savedSel = window.__posVariantSel[groupKey];
      const selected =
        (savedSel && rows.find((r) => String(r.id) === String(savedSel))) ||
        rows.find((r) => r.available) ||
        rows[0];
      const disabledAll = rows.every((r) => !r.available);

      const variantUi =
        rows.length <= 1
          ? ``
          : `<div class="pos-variant-row">
              ${rows
                .map((r) => {
                  const label = r.variant ? formatVariantLabel(r.variant) : "Default";
                  const on = String(r.id) === String(selected?.id);
                  const dis = !r.available;
                  return `<button type="button" class="pos-variant-chip ${on ? "active" : ""}" ${dis ? "disabled" : ""} data-vg="${escapeHtml(groupKey)}" data-vid="${escapeHtml(String(r.id))}">${escapeHtml(label)}</button>`;
                })
                .join("")}
            </div>`;

      return `
        <div class="pos-item${disabledAll ? " disabled" : ""}" ${(!selected?.available) ? "aria-disabled='true'" : ""} data-add-id="${(!selected?.available) ? "" : escapeHtml(String(selected?.id || ""))}">
          <div class="pos-item-media">
            ${g.imageUrl
              ? `<img src="${escapeHtml(g.imageUrl)}" alt="${escapeHtml(g.baseName)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`
              : ``}
            <div class="pos-item-initial" aria-hidden="true" style="${g.imageUrl ? 'display:none' : ''}">${escapeHtml(menuInitials(g.baseName))}</div>
          </div>
          <div class="pos-item-body">
            <div class="pos-item-name">${escapeHtml(g.baseName)}</div>
            <div class="pos-item-price">${money(selected?.price || 0)}</div>
            ${rows.length > 1 ? variantUi : ""}
          </div>
        </div>
      `;
    })
    .join("");
};

window.posSelectVariant = function (groupKey, variantId) {
  window.__posVariantSel = window.__posVariantSel || {};
  window.__posVariantSel[String(groupKey)] = String(variantId);
  renderPosMenu();
};

// One-time event delegation: clicking a card adds selected variant.
// Clicking a variant chip only selects variant.
if (!window.__posMenuClickBound) {
  window.__posMenuClickBound = true;
  document.addEventListener("click", (e) => {
    const grid = document.getElementById("posMenuGrid");
    if (!grid) return;
    if (!grid.contains(e.target)) return;

    // Variant selection
    const chip = e.target.closest && e.target.closest(".pos-variant-chip");
    if (chip) {
      const groupKey = chip.getAttribute("data-vg") || "";
      const variantId = chip.getAttribute("data-vid") || "";
      if (groupKey && variantId) window.posSelectVariant(groupKey, variantId);
      return;
    }

    if (e.target.closest && e.target.closest(".pos-variant-row")) return;
    const card = e.target.closest && e.target.closest(".pos-item");
    if (!card) return;
    const id = card.getAttribute("data-add-id") || "";
    if (!id) return;
    window.posAddToCart(id);
  });
}

function renderPosCategoryChips() {
  const wrap = document.getElementById("posCategoryChips");
  if (!wrap) return;

  const preset = Array.isArray(window.POS_MENU_CATEGORIES) ? window.POS_MENU_CATEGORIES : [];
  const inMenu = uniq(state.menuItems.map((m) => m.category || "General"));
  const ordered = [];
  for (const p of preset) {
    if (p.id === "all" || p.id === "__favs") ordered.push(p);
    else if (inMenu.includes(p.id)) ordered.push(p);
  }
  for (const c of inMenu.sort((a, b) => String(a).localeCompare(String(b)))) {
    if (!ordered.some((p) => p.id === c)) ordered.push({ id: c, label: c, icon: "" });
  }

  wrap.innerHTML = ordered
    .map((p) => {
      const active =
        (p.id === "all" && !posActiveCategory) ||
        (p.id !== "all" && posActiveCategory === p.id);
      const catArg = p.id === "all" ? "" : p.id === "__favs" ? "__favs" : p.id;
      const label = p.icon ? `${p.icon} ${p.label}` : p.label;
      return `<div class="pos-chip ${active ? "active" : ""}" onclick="posSetCategory('${escapeHtml(catArg)}')">${escapeHtml(label)}</div>`;
    })
    .join("");
}

window.posSetCategory = function (cat) {
  posActiveCategory = String(cat || "");
  renderPosCategoryChips();
  renderPosMenu();
};

function favKeyFromOrderItem(it) {
  const id = String(it?.menuItemId || "").trim();
  if (id) return `id:${id}`;
  const name = String(it?.name || "").trim().toLowerCase();
  const price = num(it?.price);
  return `np:${name}@@${price}`;
}

function favKeyFromMenuItem(m) {
  const id = String(m?.id || "").trim();
  if (id) return `id:${id}`;
  const name = String(m?.name || "").trim().toLowerCase();
  const price = num(m?.price);
  return `np:${name}@@${price}`;
}

window.posRefreshFavourites = async function () {
  try {
    api = window.api;
    if (!api?.orders?.list) return;
    const orders = await api.orders.list();
    const list = Array.isArray(orders) ? orders : [];
    const counts = new Map();
    for (const o of list) {
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const k = favKeyFromOrderItem(it);
        counts.set(k, (counts.get(k) || 0) + Math.max(1, Math.floor(num(it.qty) || 1)));
      }
    }
    window.__posFavCounts = counts;
  } catch (e) {
    console.error(e);
  }
};

/** One row per dish: merge by name + price (handles id type mismatches & duplicate menu docs). */
function mergePosCartDuplicates() {
  const map = new Map();
  for (const it of posCart) {
    const prep = String(it.prep || "regular").trim().toLowerCase();
    const np = `${String(it.name || "").trim().toLowerCase()}@@${num(it.price)}@@${prep}`;
    const cur = map.get(np);
    if (cur) {
      cur.qty = num(cur.qty) + num(it.qty);
      const id = String(it.menuItemId || "").trim();
      if (id && !String(cur.menuItemId || "").trim()) cur.menuItemId = id;
    } else {
      map.set(np, {
        menuItemId: String(it.menuItemId ?? "").trim(),
        name: it.name,
        price: num(it.price),
        qty: num(it.qty),
        prep
      });
    }
  }
  posCart = Array.from(map.values());
}

window.posAddToCart = function (menuItemId) {
  const idKey = String(menuItemId ?? "").trim();
  const m = state.menuItems.find((x) => String(x.id) === idKey);
  if (!m || !m.available) return;
  posCart.push({ menuItemId: idKey, name: m.name, nameHi: m.nameHi || "", price: num(m.price), qty: 1, prep: "regular" });
  mergePosCartDuplicates();
  renderPosCart();
};

window.posClearCart = function () {
  posCart = [];
  const note = document.getElementById("posOrderNote");
  if (note) note.value = "";
  const adj = document.getElementById("posAdjust");
  if (adj) adj.value = "0";
  posActiveTicketId = "";
  renderPosCart();
  renderPosPayment();
  renderPosTickets();
};

function posTotals() {
  const subtotal = posCart.reduce((s, it) => s + num(it.price) * num(it.qty), 0);
  const adjust = num(document.getElementById("posAdjust")?.value);
  const total = Math.max(0, subtotal + adjust);
  return { subtotal, tax: 0, adjust, total };
}

window.renderPosCart = function () {
  const list = document.getElementById("posCartList");
  if (!list) return;

  mergePosCartDuplicates();

  const count = posCart.reduce((s, it) => s + num(it.qty), 0);
  const countEl = document.getElementById("posCartCount");
  if (countEl) countEl.textContent = `${count} item${count === 1 ? "" : "s"}`;

  if (!posCart.length) {
    list.innerHTML = `<div class="pos-cart-empty">Cart is empty</div>`;
  } else {
    list.innerHTML = posCart
      .map((it, idx) => {
        const line = num(it.price) * num(it.qty);
        const prep = String(it.prep || "regular").toLowerCase();
        return `
          <div class="pos-cart-row">
            <div class="pos-cart-head">
              <div class="pos-cart-title">${escapeHtml(it.name)}</div>
              <div class="pos-qty">
                <button type="button" onclick="posDecQty(${idx})">−</button>
                <div class="pill">${num(it.qty)}</div>
                <button type="button" onclick="posIncQty(${idx})">+</button>
              </div>
            </div>
            <div class="pos-cart-meta">
              <div class="pos-prep-row">
                <button type="button" class="pos-prep-btn ${prep === "regular" ? "active" : ""}" onclick="posSetPrep(${idx}, 'regular')">Regular</button>
                <button type="button" class="pos-prep-btn ${prep === "swaminarayan" ? "active" : ""}" onclick="posSetPrep(${idx}, 'swaminarayan')">Swaminarayan</button>
              </div>
              <div class="pos-small pos-cart-sub">${money(it.price)} × ${num(it.qty)} = <b>${money(line)}</b></div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  const { subtotal, adjust, total } = posTotals();
  const subEl = document.getElementById("posSubtotal");
  const totEl = document.getElementById("posTotal");
  if (subEl) subEl.textContent = money(subtotal);
  if (totEl) totEl.textContent = money(total);

  renderPosPayment();
};

window.posIncQty = function (idx) {
  const it = posCart[idx];
  if (!it) return;
  it.qty = Math.max(1, num(it.qty) + 1);
  renderPosCart();
};

window.posDecQty = function (idx) {
  const it = posCart[idx];
  if (!it) return;
  it.qty = Math.max(0, num(it.qty) - 1);
  if (it.qty <= 0) posCart.splice(idx, 1);
  renderPosCart();
};

window.posSetPrep = function (idx, prep) {
  const it = posCart[idx];
  if (!it) return;
  it.prep = String(prep || "regular").toLowerCase();
  mergePosCartDuplicates();
  renderPosCart();
};

window.renderPosPayment = function () {
  const mode = document.getElementById("posPayMode")?.value || "cash";
  const splitWrap = document.getElementById("posPaySplit");
  if (splitWrap) splitWrap.style.display = mode === "split" ? "block" : "none";

  const { total } = posTotals();
  const hint = document.getElementById("posPayHint");

  if (mode === "cash") {
    if (hint) hint.textContent = `Will record: Cash = ${money(total)}, Online = Rs 0`;
    return;
  }
  if (mode === "online") {
    if (hint) hint.textContent = `Will record: Cash = Rs 0, Online = ${money(total)}`;
    return;
  }

  // split
  const cash = Math.max(0, num(document.getElementById("posPayCash")?.value));
  const online = Math.max(0, num(document.getElementById("posPayOnline")?.value));
  const diff = (cash + online) - total;
  if (!hint) return;
  if (Math.abs(diff) <= 0.01) hint.textContent = `OK: Cash + Online matches total (${money(total)})`;
  else hint.textContent = `Fix split: Cash + Online must equal ${money(total)} (currently ${money(cash + online)})`;
};

function formatPrintDateTime(d = new Date()) {
  const date = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  const time = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
  return { date, time, full: `${date} · ${time}` };
}

function buildPrintHtml(title, linesHtml, totalsHtml, footerHtml, opts = {}) {
  const kind = opts.kind || "bill"; // kot | bill
  const { date, time } = formatPrintDateTime();
  const note = String(document.getElementById("posOrderNote")?.value || "").trim();
  const subtitle =
    kind === "kot"
      ? "Kitchen Order Ticket"
      : "Customer Bill";

  return `
    <div class="slip">
      <div class="slip-brand">The Kilogram</div>
      <div class="slip-sub">${escapeHtml(subtitle)}</div>
      <div class="slip-meta">
        <div><span>Date</span><b>${escapeHtml(date)}</b></div>
        <div><span>Time</span><b>${escapeHtml(time)}</b></div>
      </div>
      <div class="slip-rule"></div>
      <div class="slip-title">${escapeHtml(title)}</div>
      <div class="slip-lines">${linesHtml}</div>
      ${
        totalsHtml
          ? `<div class="slip-rule"></div><div class="slip-totals">${totalsHtml}</div>`
          : ""
      }
      ${
        note
          ? `<div class="slip-rule"></div><div class="slip-note"><b>Note:</b> ${escapeHtml(note)}</div>`
          : ""
      }
      ${footerHtml || ""}
    </div>
  `;
}

function doPrint(html, docTitle = "The Kilogram") {
  // Prefer a clean popup so the app topbar / sidebar never appear on the slip.
  try {
    const w = window.open("", "_blank", "noopener,noreferrer,width=420,height=720");
    if (w && w.document) {
      w.document.open();
      w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docTitle)}</title>
  <style>
    @page { margin: 8mm; size: auto; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: "Noto Sans Devanagari", "Nirmala UI", Mangal, Arial, sans-serif;
    }
    .slip {
      width: 100%;
      max-width: 320px;
      margin: 0 auto;
      padding: 8px 4px 16px;
    }
    .slip-brand {
      text-align: center;
      font-weight: 900;
      font-size: 20px;
      letter-spacing: -0.02em;
    }
    .slip-sub {
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #333;
    }
    .slip-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 10px;
      font-size: 12px;
    }
    .slip-meta span { display:block; color:#666; font-size:10px; font-weight:600; }
    .slip-meta b { font-weight: 800; }
    .slip-rule {
      border: none;
      border-top: 1px dashed #999;
      margin: 10px 0;
    }
    .slip-title {
      text-align: center;
      font-size: 13px;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .slip-lines { display: grid; gap: 8px; }
    .slip-line {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 13px;
      align-items: flex-start;
    }
    .slip-line .name { font-weight: 800; line-height: 1.25; }
    .slip-line .prep { font-size: 11px; color: #444; font-weight: 600; margin-top: 2px; }
    .slip-line .qty, .slip-line .amt { font-weight: 900; white-space: nowrap; }
    .slip-totals { display: grid; gap: 4px; font-size: 13px; }
    .slip-totals .row { display:flex; justify-content:space-between; gap:10px; }
    .slip-totals .row.big { font-size: 15px; font-weight: 900; margin-top: 4px; }
    .slip-note { font-size: 12px; line-height: 1.35; }
    .slip-footer {
      text-align: center;
      font-size: 12px;
      margin-top: 12px;
      font-weight: 700;
    }
    @media print {
      html, body { background: #fff; }
      .slip { max-width: 100%; }
    }
  </style>
</head>
<body>
  ${html}
  <script>
    window.onload = function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 120);
    };
  <\/script>
</body>
</html>`);
      w.document.close();
      return;
    }
  } catch (e) {
    console.warn("Print popup blocked, falling back", e);
  }

  // Fallback: same-page print (CSS hides chrome)
  const area = document.getElementById("printArea");
  if (!area) return;
  document.body.classList.add("printing-slip");
  area.innerHTML = html;
  window.print();
  setTimeout(() => {
    area.innerHTML = "";
    document.body.classList.remove("printing-slip");
  }, 600);
}

window.posPrintKOT = async function () {
  if (!posCart.length) return toast("Cart is empty", "error");
  const lang = "hi"; // always Hindi KOT
  setLoading(true);
  try {
    const kotHelpers = { prepLabel, translateEnToHi, escapeHtml };

    if (window.ThermalPrinter?.isConnected()) {
      await window.ThermalPrinter.printKOTFromCart(posCart, kotHelpers);
      toast("KOT sent to thermal printer (Hindi)", "success");
      return;
    }

    if (window.ThermalPrinter?.isSupported()) {
      const re = await window.ThermalPrinter.tryReconnectSaved();
      if (re && window.ThermalPrinter.isConnected()) {
        await window.ThermalPrinter.printKOTFromCart(posCart, kotHelpers);
        toast("KOT sent to thermal printer (Hindi)", "success");
        return;
      }
    }

    const lineParts = await Promise.all(
      posCart.map(async (it) => {
        const prep = prepLabel(it.prep, lang);
        let title = String(it.nameHi || "").trim();
        if (!title && String(it.name || "").trim()) {
          title = (await translateEnToHi(String(it.name).trim())) || String(it.name || "");
        }
        if (!title) title = String(it.name || "");
        return `<div class="slip-line">
          <div>
            <div class="name">${escapeHtml(title)}</div>
            <div class="prep">${escapeHtml(prep)}</div>
          </div>
          <div class="qty">× ${num(it.qty)}</div>
        </div>`;
      })
    );
    doPrint(
      buildPrintHtml("किचन ऑर्डर (KOT)", lineParts.join(""), "", `<div class="slip-footer">तत्काल तैयार करें · Thank you</div>`, {
        kind: "kot"
      }),
      "KOT · The Kilogram"
    );
    if (window.ThermalPrinter?.isSupported()) {
      toast("No printer connected — used browser print. Tap Connect thermal printer for Bluetooth.", "info");
    }
  } catch (e) {
    console.error(e);
    toast(e.message || "KOT print failed", "error");
  } finally {
    setLoading(false);
  }
};

window.posPrintBill = function () {
  if (!posCart.length) return toast("Cart is empty", "error");
  const { subtotal, tax, total } = posTotals();
  const mode = document.getElementById("posPayMode")?.value || "cash";
  let cash = 0;
  let online = 0;
  if (mode === "cash") cash = total;
  else if (mode === "online") online = total;
  else {
    cash = Math.max(0, num(document.getElementById("posPayCash")?.value));
    online = Math.max(0, num(document.getElementById("posPayOnline")?.value));
  }

  const lines = posCart
    .map(
      (it) => `<div class="slip-line">
      <div>
        <div class="name">${escapeHtml(it.name)}</div>
        <div class="prep">${escapeHtml(prepLabel(it.prep, "en"))} · Qty ${num(it.qty)}</div>
      </div>
      <div class="amt">${money(num(it.price) * num(it.qty))}</div>
    </div>`
    )
    .join("");

  const totals = `
    <div class="row"><span>Subtotal</span><b>${money(subtotal)}</b></div>
    <div class="row big"><span>Total</span><b>${money(total)}</b></div>
    <div class="row" style="margin-top:6px;font-size:12px;"><span>Cash</span><b>${money(cash)}</b></div>
    <div class="row" style="font-size:12px;"><span>Online</span><b>${money(online)}</b></div>
  `;

  doPrint(
    buildPrintHtml("Bill", lines, totals, `<div class="slip-footer">Thank you · Visit again</div>`, { kind: "bill" }),
    "Bill · The Kilogram"
  );
};

window.posAddCustomItem = function () {
  const nameEl = document.getElementById("posCustomName");
  const priceEl = document.getElementById("posCustomPrice");
  const name = String(nameEl?.value || "").trim();
  const price = num(priceEl?.value);
  if (!name) return toast("Enter item name", "error");
  if (!(price >= 0)) return toast("Enter valid price", "error");
  posCart.push({
    menuItemId: `custom:${Date.now()}`,
    name,
    nameHi: "",
    price,
    qty: 1,
    prep: "regular"
  });
  mergePosCartDuplicates();
  renderPosCart();
  if (nameEl) nameEl.value = "";
  if (priceEl) priceEl.value = "";
  toast("Added to cart", "success");
};

window.posCustomFillPau = function () {
  const nameEl = document.getElementById("posCustomName");
  if (nameEl) nameEl.value = "Pau Extra";
  const priceEl = document.getElementById("posCustomPrice");
  if (priceEl && !String(priceEl.value || "").trim()) priceEl.value = "0";
};

window.posGenerateBill = async function () {
  if (!posCart.length) return toast("Cart is empty", "error");
  try {
    api = window.api;
    if (!api?.orders?.create) throw new Error("Orders API not ready");

    const { subtotal, tax, adjust, total } = posTotals();
    const mode = document.getElementById("posPayMode")?.value || "cash";
    let cash = 0;
    let online = 0;
    if (mode === "cash") cash = total;
    else if (mode === "online") online = total;
    else {
      cash = Math.max(0, num(document.getElementById("posPayCash")?.value));
      online = Math.max(0, num(document.getElementById("posPayOnline")?.value));
      if (Math.abs((cash + online) - total) > 0.01) return toast("Payment split mismatch", "error");
    }

    if (!confirm(`Generate bill for ${money(total)}?`)) return;

    setLoading(true);
    const noteTxt = (document.getElementById("posOrderNote")?.value || "").trim();
    const notes =
      Math.abs(num(adjust)) > 0.01
        ? `${noteTxt}${noteTxt ? "\n" : ""}Adjustment: ${money(adjust)}`
        : noteTxt;
    const payload = {
      date: todayISO(),
      items: posCart.map((it) => ({
        menuItemId: it.menuItemId,
        name: it.name,
        price: num(it.price),
        qty: Math.max(1, Math.floor(num(it.qty))),
        note: prepLabel(it.prep, "en")
      })),
      notes,
      subtotal,
      tax,
      total,
      payment: { cash, online }
    };
    const createdOrder = await api.orders.create(payload);
    const orderId =
      typeof createdOrder === "string"
        ? createdOrder
        : String(createdOrder?.id || createdOrder?._id || "").trim();

    // Link POS to Sales ledger so Cash / Bank / KPIs stay in sync
    const itemSummary = posCart
      .map((it) => `${it.name}×${Math.max(1, Math.floor(num(it.qty)))}`)
      .join(", ");
    const saleNotes = [`POS bill`, itemSummary, notes].filter(Boolean).join(" — ").slice(0, 500);
    if (api.sales?.create) {
      await api.sales.create({
        date: todayISO(),
        cashAmount: cash,
        swiggyAmount: 0,
        zomatoAmount: 0,
        otherOnlineAmount: online,
        onlineAmount: online,
        totalAmount: total,
        notes: saleNotes,
        method: mode === "online" ? "online" : mode === "split" ? "mixed" : "cash",
        source: "pos",
        orderId: orderId || undefined
      });
    }

    // Auto-deduct inventory from menu recipes
    let stockNote = "";
    try {
      if (window.KgPhase2?.deductRecipeForCart && api.inventory?.adjust) {
        const result = await window.KgPhase2.deductRecipeForCart({
          cart: posCart,
          menuItems: state.menuItems,
          inventory: state.inventory,
          today: todayISO(),
          adjustFn: (id, body) => api.inventory.adjust(id, body)
        });
        if (result.deducted) stockNote = ` · stock −${result.deducted} item(s)`;
        if (result.missing?.length) {
          toast(`Recipe missing stock item: ${result.missing.join(", ")}`, "info");
        }
      }
    } catch (stockErr) {
      console.warn(stockErr);
      toast(stockErr.message || "Stock deduct failed (sale still saved)", "error");
    }

    await posLoadTodayTotals();
    try {
      await loadAll();
    } catch (_) {}
    posRefreshFavourites();
    toast(`Order saved · sales updated${stockNote}`, "success");
    showCelebrate(money(total));
    if (posActiveTicketId) removeTicket(posActiveTicketId);
    posClearCart();
  } catch (e) {
    console.error(e);
    toast(e.message || "Failed to generate bill", "error");
  } finally {
    setLoading(false);
  }
};

window.posHoldOrder = function () {
  if (!posCart.length) {
    toast("Cart is empty", "error");
    return;
  }
  saveActiveTicketSnapshot("pending");
  posCart = [];
  const note = document.getElementById("posOrderNote");
  if (note) note.value = "";
  const adj = document.getElementById("posAdjust");
  if (adj) adj.value = "0";
  posActiveTicketId = "";
  renderPosCart();
  renderPosPayment();
  toast("Order moved to pending", "success");
};

window.posLoadTodayTotals = async function () {
  try {
    api = window.api;
    if (!api?.orders?.list) return;
    const metaEl = document.getElementById("posTodaySalesMeta");
    const cashEl = document.getElementById("posTodaySalesCash");
    const onEl = document.getElementById("posTodaySalesOnline");
    const totEl = document.getElementById("posTodaySalesTotal");
    if (!cashEl || !onEl || !totEl || !metaEl) return;

    const date = todayISO();
    let orders = [];
    try {
      orders = await api.orders.list({ date });
    } catch {
      orders = await api.orders.list();
    }
    orders = Array.isArray(orders) ? orders : [];
    const today = orders.filter((o) => String(o.date || "").slice(0, 10) === date);

    const cash = today.reduce((s, o) => s + num(o.payment?.cash), 0);
    const online = today.reduce((s, o) => s + num(o.payment?.online), 0);
    const total = today.reduce((s, o) => s + num(o.total), 0);

    cashEl.textContent = money(cash);
    onEl.textContent = money(online);
    totEl.textContent = money(total);
    metaEl.textContent = `${date} • ${today.length} order(s)`;
  } catch (e) {
    console.error(e);
  }
};

window.posShowHistory = async function () {
  try {
    const ov = document.getElementById("orderHistoryOverlay");
    const body = document.getElementById("orderHistoryBody");
    if (!ov || !body) return;
    api = window.api;
    if (!api?.orders?.list) return toast("Orders API not ready", "error");
    setLoading(true);
    const orders = await api.orders.list();
    const list = Array.isArray(orders) ? orders : [];
    const localDeleted = (() => {
      try {
        const raw = localStorage.getItem("kg_deleted_orders_v1");
        const arr = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(arr) ? arr.map((x) => String(x)) : []);
      } catch {
        return new Set();
      }
    })();
    body.innerHTML =
      list
        .filter((o) => {
          const id = o?.id || o?._id || "";
          return id ? !localDeleted.has(String(id)) : true;
        })
        .slice(0, 60)
        .map((o) => {
          const lines = Array.isArray(o.items)
            ? o.items.slice(0, 6).map((it) => `${escapeHtml(it.name)} × ${num(it.qty)}`).join("<br/>")
            : "";
          const id = o.id || o._id || "";
          const created =
            o && typeof o.createdAt === "object" && typeof o.createdAt?.toDate === "function"
              ? o.createdAt.toDate()
              : o && typeof o.createdAt === "object" && Number.isFinite(o.createdAt?.seconds)
              ? new Date(o.createdAt.seconds * 1000)
              : new Date(o.createdAt || Date.now());
          const timeStr = Number.isFinite(created.getTime()) ? created.toLocaleTimeString() : "--:--";
          return `<div class="row" data-order-id="${escapeHtml(String(id))}" style="grid-template-columns: 1fr auto; align-items:flex-start;">
            <div>
              <div style="font-weight:700;">${escapeHtml(String(o.date || "").slice(0,10))} • ${escapeHtml(timeStr)}</div>
              <div class="muted" style="margin-top:6px;">${lines || "—"}</div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
              <div style="font-weight:800;">${money(num(o.total))}</div>
              ${
                id
                  ? `<button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" type="button" data-del-order-id="${escapeHtml(
                      String(id)
                    )}">Delete</button>`
                  : ""
              }
            </div>
          </div>`;
        })
        .join("") || `<div class="muted">No orders yet</div>`;
    ov.classList.add("open");
  } catch (e) {
    console.error(e);
    toast(e.message || "Failed to load history", "error");
  } finally {
    setLoading(false);
  }
};

window.posDeleteOrder = async function (id) {
  try {
    const oid = String(id || "").trim();
    if (!oid) return;
    api = window.api;
    if (!api?.orders?.remove) return toast("Delete API not ready", "error");
    if (!confirm("Delete this order?")) return;

    // Capture order details before delete (needed to remove linked sales)
    let orderSnap = (state.orders || []).find((o) => String(o.id || o._id || "") === oid) || null;
    if (!orderSnap && api.orders?.list) {
      try {
        const all = await api.orders.list();
        orderSnap = (Array.isArray(all) ? all : []).find((o) => String(o.id || o._id || "") === oid) || null;
      } catch (_) {}
    }

    // Hide immediately (POS UX)
    try {
      const raw = localStorage.getItem("kg_deleted_orders_v1");
      const arr = raw ? JSON.parse(raw) : [];
      const set = new Set(Array.isArray(arr) ? arr.map((x) => String(x)) : []);
      set.add(oid);
      localStorage.setItem("kg_deleted_orders_v1", JSON.stringify(Array.from(set).slice(-500)));
    } catch {}
    try {
      const metaRaw = localStorage.getItem("kg_deleted_order_meta_v1");
      const meta = metaRaw ? JSON.parse(metaRaw) : [];
      const list = Array.isArray(meta) ? meta : [];
      list.push({
        id: oid,
        date: String(orderSnap?.date || todayISO()).slice(0, 10),
        total: num(orderSnap?.total),
        at: Date.now()
      });
      localStorage.setItem("kg_deleted_order_meta_v1", JSON.stringify(list.slice(-200)));
    } catch {}

    const row = document.querySelector(`#orderHistoryBody .row[data-order-id="${CSS.escape(oid)}"]`);
    if (row) row.remove();
    setLoading(true);
    await api.orders.remove(oid);

    // Also remove the sales ledger row created with this POS bill
    await removeSalesForDeletedPosOrder(oid, orderSnap);

    toast("Order deleted", "success");
    try {
      await loadAll();
    } catch (_) {
      await posLoadTodayTotals();
      safeRun("dashboard", renderDashboard);
      safeRun("sales", renderSales);
    }
    posRefreshFavourites();
    await window.posShowHistory();
  } catch (e) {
    console.error(e);
    toast(e?.message ? `Delete failed: ${e.message}` : "Delete failed", "error");
    // Still refresh list because we hide locally in Firebase mode.
    try {
      await posLoadTodayTotals();
      posRefreshFavourites();
      await window.posShowHistory();
    } catch {}
  } finally {
    setLoading(false);
  }
};

async function removeSalesForDeletedPosOrder(orderId, orderSnap) {
  api = window.api;
  if (!api?.sales?.remove) return 0;
  const oid = String(orderId || "").trim();
  const orderDate = String(orderSnap?.date || "").slice(0, 10);
  const orderTotal = num(orderSnap?.total);
  let sales = Array.isArray(state.sales) ? state.sales : [];
  if (!sales.length && api.sales.list) {
    try {
      sales = await api.sales.list();
    } catch (_) {
      sales = [];
    }
  }
  const matches = sales.filter((s) => {
    if (!s?.id) return false;
    if (oid && String(s.orderId || "") === oid) return true;
    if (String(s.source || "") !== "pos") return false;
    if (!orderDate) return false;
    const sameDate = String(s.date || "").slice(0, 10) === orderDate;
    const sameTotal = Math.abs(saleAmounts(s).total - orderTotal) < 0.02;
    const notes = String(s.notes || "");
    return sameDate && sameTotal && (notes.includes("POS bill") || String(s.source) === "pos");
  });
  let removed = 0;
  for (const s of matches) {
    try {
      await api.sales.remove(s.id);
      removed += 1;
      state.sales = (state.sales || []).filter((x) => x.id !== s.id);
    } catch (err) {
      console.warn("Failed to remove linked POS sale", err);
    }
  }
  return removed;
}

/** Remove leftover POS sales whose matching orders were already deleted. */
async function purgeOrphanPosSales() {
  api = window.api;
  if (!api?.sales?.remove) return 0;

  let localDeleted = new Set();
  try {
    const raw = localStorage.getItem("kg_deleted_orders_v1");
    const arr = raw ? JSON.parse(raw) : [];
    localDeleted = new Set(Array.isArray(arr) ? arr.map((x) => String(x)) : []);
  } catch {
    localDeleted = new Set();
  }

  let meta = [];
  try {
    meta = JSON.parse(localStorage.getItem("kg_deleted_order_meta_v1") || "[]");
  } catch {
    meta = [];
  }
  meta = Array.isArray(meta) ? meta : [];
  if (!localDeleted.size && !meta.length) return 0;

  const sales = Array.isArray(state.sales) ? state.sales : [];
  const orders = Array.isArray(state.orders) ? state.orders : [];
  const activeOrderIds = new Set(orders.map((o) => String(o.id || o._id || "")).filter(Boolean));
  const orderKeyCounts = new Map();
  orders.forEach((o) => {
    const key = `${String(o.date || "").slice(0, 10)}|${num(o.total).toFixed(2)}`;
    orderKeyCounts.set(key, (orderKeyCounts.get(key) || 0) + 1);
  });
  const deletedIds = new Set([...localDeleted, ...meta.map((m) => String(m.id || "")).filter(Boolean)]);

  const orphanIds = new Set();
  for (const s of sales) {
    if (!s?.id || String(s.source || "") !== "pos") continue;
    const oid = String(s.orderId || "").trim();
    if (oid && deletedIds.has(oid)) orphanIds.add(s.id);
    if (oid && !activeOrderIds.has(oid) && deletedIds.has(oid)) orphanIds.add(s.id);
  }
  for (const m of meta) {
    const d = String(m.date || "").slice(0, 10);
    const tot = num(m.total);
    if (!d) continue;
    for (const s of sales) {
      if (!s?.id || String(s.source || "") !== "pos") continue;
      if (String(s.orderId || "") === String(m.id || "")) {
        orphanIds.add(s.id);
        continue;
      }
      if (String(s.date || "").slice(0, 10) !== d) continue;
      if (Math.abs(saleAmounts(s).total - tot) >= 0.02) continue;
      orphanIds.add(s.id);
    }
  }

  // Legacy unlinked POS sales (no orderId): drop extras that no longer have a matching live order
  if (localDeleted.size) {
    const usedOrderKeys = new Map();
    const posSales = sales
      .filter((s) => s?.id && String(s.source || "") === "pos" && !String(s.orderId || "").trim())
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    for (const s of posSales) {
      const key = `${String(s.date || "").slice(0, 10)}|${saleAmounts(s).total.toFixed(2)}`;
      const available = orderKeyCounts.get(key) || 0;
      const used = usedOrderKeys.get(key) || 0;
      if (used < available) usedOrderKeys.set(key, used + 1);
      else orphanIds.add(s.id);
    }
  }

  let removed = 0;
  for (const id of orphanIds) {
    try {
      await api.sales.remove(id);
      removed += 1;
      state.sales = (state.sales || []).filter((x) => x.id !== id);
    } catch (err) {
      console.warn("Orphan POS sale cleanup failed", err);
    }
  }
  return removed;
}

// History modal delete click handler (reliable in all browsers)
if (!window.__kgPosHistoryDeleteBound) {
  window.__kgPosHistoryDeleteBound = true;
  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("#orderHistoryBody button[data-del-order-id]") : null;
    if (!btn) return;
    const id = btn.getAttribute("data-del-order-id");
    if (!id) return;
    window.posDeleteOrder?.(id);
  });
}

window.posCloseHistory = function () {
  const ov = document.getElementById("orderHistoryOverlay");
  if (ov) ov.classList.remove("open");
};


window.toggleAddSupplier = function () {
  const box = document.getElementById("addSupplierBox");
  if (box) {
    box.style.display = box.style.display === "none" ? "block" : "none";
  }
};

window.addSupplier = function () {
  const name = (document.getElementById("newSupplierName")?.value || "").trim();
  if (!name) return toast("Enter supplier name", "error");
  withErr(async () => {
    const items = [...tempSupplierItems];
    await api.suppliers.create({ name, items });
    document.getElementById("newSupplierName").value = "";
    tempSupplierItems = [];
    renderTempSupplierItems();
    await loadAll();
    toast("Saved successfully", "ok");
  });
};

window.addTempSupplierItem = function () {
  const itemName = (document.getElementById("newSupplierItemName")?.value || "").trim();
  const rate = num(document.getElementById("newSupplierItemRate")?.value);
  if (!itemName) return toast("Enter item name", "error");
  // Rate is optional, only validate if provided
  if (rate < 0) return toast("Rate cannot be negative", "error");
  tempSupplierItems.push({ name: itemName, rate: rate || 0 });
  if (document.getElementById("newSupplierItemName")) document.getElementById("newSupplierItemName").value = "";
  if (document.getElementById("newSupplierItemRate")) document.getElementById("newSupplierItemRate").value = "";
  renderTempSupplierItems();
};

window.removeTempSupplierItem = function (idx) {
  tempSupplierItems.splice(idx, 1);
  renderTempSupplierItems();
};

function renderTempSupplierItems() {
  const el = document.getElementById("tempSupplierItems");
  if (!el) return;
  el.innerHTML =
    tempSupplierItems
      .map(
        (it, i) => {
          const rateDisplay = it.rate > 0 ? `<span class="pill">Rs ${num(it.rate)}</span>` : `<span class="pill">No rate</span>`;
          return `<div class="row"><div><strong>${it.name}</strong> ${rateDisplay}</div><button class="warn" onclick="removeTempSupplierItem(${i})">Remove</button></div>`;
        }
      )
      .join("") || `<div class="muted">No items added yet.</div>`;
}

window.removeSupplier = function (id) {
  withErr(async () => {
    await api.suppliers.remove(id);
    await loadAll();
    toast("Deleted", "ok");
  });
};

function renderEditSupplierItems() {
  const wrap = document.getElementById("editSupplierItems");
  if (!wrap) return;
  const items = Array.isArray(editSupplierState.items) ? editSupplierState.items : [];
  wrap.innerHTML =
    items
      .map((it, i) => {
        const name = String(it?.name || "");
        const rate = num(it?.rate);
        return `
          <div class="itemGrid">
            <input data-es-name="${i}" value="${name.replace(/"/g, "&quot;")}" placeholder="Item name" />
            <input data-es-rate="${i}" type="number" value="${rate || ""}" placeholder="Rate" />
            <button type="button" class="warn btn-sm" onclick="editSupplierRemoveItem(${i})">Remove</button>
          </div>
        `;
      })
      .join("") || `<div class="muted">No items yet.</div>`;
}

window.closeEditSupplier = function () {
  const o = document.getElementById("editSupplierOverlay");
  if (o) o.classList.remove("open");
  editSupplierState = { id: null, name: "", items: [] };
};

window.editSupplierAddItem = function () {
  editSupplierState.items = [...(editSupplierState.items || []), { name: "", rate: 0 }];
  renderEditSupplierItems();
};

window.editSupplierRemoveItem = function (idx) {
  editSupplierState.items.splice(idx, 1);
  renderEditSupplierItems();
};

window.openEditSupplier = function (id) {
  const s = state.suppliers.find((x) => x && typeof x === "object" && x.id === id);
  if (!s) return toast("Supplier not found", "error");
  editSupplierState = {
    id,
    name: String(s.name || ""),
    items: Array.isArray(s.items) ? s.items.map((it) => ({ name: String(it?.name || ""), rate: num(it?.rate) })) : []
  };
  const nameEl = document.getElementById("editSupplierName");
  if (nameEl) nameEl.value = editSupplierState.name;
  renderEditSupplierItems();
  const o = document.getElementById("editSupplierOverlay");
  if (o) o.classList.add("open");
};

window.saveEditSupplier = function () {
  const nameEl = document.getElementById("editSupplierName");
  const nextName = (nameEl?.value || "").trim();
  if (!editSupplierState.id) return toast("No supplier selected", "error");
  if (!nextName) return toast("Supplier name is required", "error");

  const wrap = document.getElementById("editSupplierItems");
  const items = [...(wrap?.querySelectorAll("[data-es-name]") || [])].map((input) => {
    const idx = Number(input.getAttribute("data-es-name"));
    const name = (input.value || "").trim();
    const rateInput = wrap.querySelector(`[data-es-rate="${idx}"]`);
    const rate = num(rateInput?.value);
    return { name, rate: rate < 0 ? 0 : rate };
  });

  const cleanItems = items.filter((it) => it.name);

  withErr(async () => {
    const updatedList = await api.suppliers.update(editSupplierState.id, { name: nextName, items: cleanItems });
    // If backend returns list, we can skip an extra load, but loadAll keeps everything consistent.
    if (Array.isArray(updatedList) && updatedList.length) state.suppliers = updatedList;
    await loadAll();
    closeEditSupplier();
    toast("Saved successfully", "ok");
  });
};

let tempPurchaseItems = [];

function renderTempPurchaseItems() {
  const el = document.getElementById("tempPurchaseItems");
  if (!el) return;
  const total = tempPurchaseItems.reduce((s, x) => s + num(x.price), 0);
  const totalEl = document.getElementById("purchaseTotalAmount");
  if (totalEl) totalEl.value = total ? String(Math.round(total)) : "";

  el.innerHTML =
    tempPurchaseItems
      .map((it, i) => {
        const meta = `${it.item}${num(it.qty) > 0 ? ` • qty ${num(it.qty)}` : ""}${num(it.rate) > 0 ? ` • price ${money(num(it.rate))}` : ""}`;
        return `<div class="row"><div><strong>${meta}</strong></div><div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;">${money(it.price)} <button class="warn" onclick="removeTempPurchaseItem(${i})">Remove</button></div></div>`;
      })
      .join("") || `<div class="muted">No items added yet.</div>`;
}

window.addTempPurchaseItem = function () {
  const seller = document.getElementById("purchaseSellerSelect")?.value || "";
  const item = (document.getElementById("purchaseItemSelect")?.value || "").trim();
  const qty = num(document.getElementById("purchaseQty")?.value);
  const rate = num(document.getElementById("purchaseRate")?.value);
  let price = num(document.getElementById("purchasePrice")?.value);
  if (!seller) return toast("Select supplier", "error");
  if (!item) return toast("Select item", "error");
  if (qty < 0) return toast("Quantity cannot be negative", "error");
  if (rate < 0) return toast("Price cannot be negative", "error");
  if (!(price > 0)) {
    if (qty > 0 && rate > 0) price = Math.round(qty * rate * 100) / 100;
    else if (rate > 0) price = rate;
  }
  if (!(price > 0)) return toast("Enter price and quantity", "error");
  if (!(qty > 0)) return toast("Enter quantity", "error");
  if (!(rate > 0)) return toast("Enter price", "error");

  tempPurchaseItems.push({
    item,
    qty,
    rate,
    price,
    expiryDate: String(document.getElementById("purchaseExpiry")?.value || "").slice(0, 10)
  });
  ["purchaseQty", "purchaseRate", "purchasePrice"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  renderTempPurchaseItems();
};

window.removeTempPurchaseItem = function (idx) {
  tempPurchaseItems.splice(idx, 1);
  renderTempPurchaseItems();
};

function applyTotalOverride() {
  const totalEl = document.getElementById("purchaseTotalAmount");
  const desired = num(totalEl?.value);
  if (!(desired > 0)) return;
  const current = tempPurchaseItems.reduce((s, x) => s + num(x.price), 0);
  if (!(current > 0)) return;
  if (Math.abs(desired - current) < 1) return;
  const factor = desired / current;
  tempPurchaseItems = tempPurchaseItems.map((x) => ({ ...x, price: Math.max(0, Math.round(num(x.price) * factor)) }));
}

window.onPurchasePaidStatusChanged = function () {
  const status = readPurchasePaidStatus();
  const methodWrap = document.getElementById("purchasePayMethodWrap");
  if (methodWrap) methodWrap.style.display = status === "paid" ? "" : "none";
};

function readPurchasePaidStatus() {
  const el = document.getElementById("purchasePaidStatus");
  const raw = String(el?.value || "").trim().toLowerCase();
  if (raw === "paid" || raw === "yes" || raw === "true") return "paid";
  const label = String(el?.options?.[el.selectedIndex]?.text || "").trim().toLowerCase();
  if (label === "paid") return "paid";
  return "unpaid";
}

function readPurchasePaymentMethod(paidStatus) {
  if (paidStatus !== "paid") return "unpaid";
  const method = String(document.getElementById("purchasePaymentMethod")?.value || "cash").trim().toLowerCase();
  return method === "online" ? "online" : "cash";
}

window.addPurchase = function () {
  const date = document.getElementById("purchaseDate")?.value || todayISO();
  const seller = document.getElementById("purchaseSellerSelect")?.value || "";
  const paidStatus = readPurchasePaidStatus();
  const paymentMethod = readPurchasePaymentMethod(paidStatus);

  if (!seller) return toast("Select supplier", "error");

  // If user filled a line but didn't click + Add item, add it automatically
  const pendingItem = (document.getElementById("purchaseItemSelect")?.value || "").trim();
  const pendingPrice = num(document.getElementById("purchasePrice")?.value);
  const pendingQty = num(document.getElementById("purchaseQty")?.value);
  if (pendingItem && pendingPrice > 0 && pendingQty > 0) {
    addTempPurchaseItem();
  }
  if (!tempPurchaseItems.length) return toast("Add at least 1 item", "error");
  if (paidStatus === "paid" && !["cash", "online"].includes(paymentMethod)) {
    return toast("Select Cash or Online payment", "error");
  }

  applyTotalOverride();
  const items = [...tempPurchaseItems];

  withErr(async () => {
    for (const it of items) {
      await api.purchases.create({
        date,
        seller,
        item: it.item,
        qty: it.qty,
        rate: it.rate,
        price: it.price,
        expiryDate: it.expiryDate || "",
        paidStatus,
        paymentMethod,
        status: paidStatus
      });
    }
    tempPurchaseItems = [];
    const totalEl = document.getElementById("purchaseTotalAmount");
    if (totalEl) totalEl.value = "";
    const paidEl = document.getElementById("purchasePaidStatus");
    if (paidEl) paidEl.value = "unpaid";
    onPurchasePaidStatusChanged();
    renderTempPurchaseItems();
    await loadAll();
    toast(paidStatus === "paid" ? "Bill saved as Paid" : "Bill saved as Unpaid", "success");
  });
};

function isPurchasePaid(p) {
  const s = String(p?.paidStatus || p?.status || "").toLowerCase().trim();
  return s === "paid";
}

function paymentsForSeller(name) {
  return state.supplierPayments.filter((p) => String(p.seller || "") === String(name || ""));
}

function unpaidPurchasesForSeller(name) {
  return (state.purchases || [])
    .filter((p) => String(p.seller || "") === String(name || "") && !isPurchasePaid(p))
    .reduce((s, p) => s + num(p.price), 0);
}

function supplierRemaining(name) {
  const unpaidBills = unpaidPurchasesForSeller(name);
  const paid = paymentsForSeller(name).reduce((s, p) => s + num(p.amount), 0);
  return unpaidBills - paid;
}

function totalSupplierOutstanding() {
  const names = new Set();
  supplierNames().forEach((n) => {
    if (n) names.add(String(n));
  });
  (state.purchases || []).forEach((p) => {
    const n = String(p.seller || "").trim();
    if (n) names.add(n);
  });
  let total = 0;
  names.forEach((n) => {
    total += Math.max(0, supplierRemaining(n));
  });
  return total;
}

function renderSupplierRemaining() {
  const el = document.getElementById("supplierRemainingList");
  if (!el) return;
  const names = supplierNames();
  if (!names.length) {
    el.innerHTML = `<div class="muted">No suppliers yet.</div>`;
    return;
  }
  const rows = names
    .map((name) => ({ name, remaining: supplierRemaining(name) }))
    .sort((a, b) => b.remaining - a.remaining);

  el.innerHTML = rows
    .map((r) => {
      const isDue = r.remaining > 0.009;
      const isCredit = r.remaining < -0.009;
      const color = isDue ? "var(--expense)" : "var(--profit)";
      const tag = isDue ? "" : isCredit ? ` <span class="pill">credit</span>` : ` <span class="pill">settled</span>`;
      return `<div class="row"><div><strong>${escapeHtml(r.name)}</strong>${tag}</div><div style="font-weight:900;color:${color}">${money(r.remaining)}</div></div>`;
    })
    .join("");
}

window.openPaySupplier = function () {
  const o = document.getElementById("paySupplierOverlay");
  if (o) o.classList.add("open");
  const dateEl = document.getElementById("paySupplierDate");
  if (dateEl) dateEl.value = todayISO();
  const dd = document.getElementById("paySupplierName");
  if (dd) {
    dd.innerHTML = "";
    supplierNames().forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      dd.appendChild(opt);
    });
  }
};

window.closePaySupplier = function () {
  const o = document.getElementById("paySupplierOverlay");
  if (o) o.classList.remove("open");
};

window.savePaySupplier = function () {
  const date = document.getElementById("paySupplierDate")?.value || todayISO();
  const seller = document.getElementById("paySupplierName")?.value || "";
  const amount = num(document.getElementById("paySupplierAmount")?.value);
  const method = document.getElementById("paySupplierMethod")?.value || "cash";
  const note = (document.getElementById("paySupplierNote")?.value || "").trim();
  if (!seller) return toast("Select supplier", "error");
  if (!(amount > 0)) return toast("Enter paid amount", "error");

  withErr(async () => {
    await api.supplierPayments.create({ date, seller, amount, method: method === "online" ? "online" : "cash", note });
    ["paySupplierAmount", "paySupplierNote"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    await loadAll();
    closePaySupplier();
  });
};

window.markPurchasePaid = function (id) {
  const method = document.getElementById(`purchasePayMethod_${id}`)?.value || "cash";
  withErr(async () => {
    await api.purchases.update(id, { paidStatus: "paid", paymentMethod: method === "online" ? "online" : "cash" });
    await loadAll();
    toast("Bill marked paid — remaining, dashboard and analytics updated", "success");
  });
};

window.markPurchaseUnpaid = function (id) {
  withErr(async () => {
    await api.purchases.update(id, { paidStatus: "unpaid", paymentMethod: "unpaid" });
    await loadAll();
    toast("Bill marked unpaid", "info");
  });
};

window.onBillPaidStatusChanged = function () {
  const status = document.getElementById("billStatus")?.value || "paid";
  const wrap = document.getElementById("billPayMethodWrap");
  if (wrap) wrap.style.display = status === "paid" ? "" : "none";
};

window.fillDailyExpenseQuick = function (category, amount, note) {
  const groupEl = document.getElementById("billExpenseGroup");
  const typeEl = document.getElementById("billType");
  const amountEl = document.getElementById("billAmount");
  const noteEl = document.getElementById("billNote");
  const statusEl = document.getElementById("billStatus");
  const methodEl = document.getElementById("billPaymentMethod");
  const fixedIds = new Set(getExpenseCategoriesForGroup("fixed").map((c) => c.id));
  if (groupEl) groupEl.value = fixedIds.has(String(category)) ? "fixed" : "kitchen";
  refreshBillCategorySelect(category);
  if (typeEl) typeEl.value = category;
  if (amountEl && amount !== "" && amount != null) amountEl.value = String(amount);
  if (amountEl && (amount === "" || amount == null)) {
    amountEl.value = "";
    amountEl.focus();
  }
  if (noteEl && note) noteEl.value = note;
  if (statusEl) statusEl.value = "paid";
  if (methodEl) methodEl.value = "cash";
  onBillPaidStatusChanged();
};

window.addBill = function () {
  const date = document.getElementById("billDate")?.value || todayISO();
  const category = document.getElementById("billType")?.value || "misc";
  const amount = num(document.getElementById("billAmount")?.value);
  const status = document.getElementById("billStatus")?.value || "paid";
  const paymentMethod = document.getElementById("billPaymentMethod")?.value || "cash";
  const note = (document.getElementById("billNote")?.value || "").trim();
  const fileEl = document.getElementById("billAttachment");
  const file = fileEl?.files?.[0] || null;
  if (!(amount > 0)) return toast("Enter valid amount", "error");
  withErr(async () => {
    let attachment = null;
    let attachmentName = "";
    if (file && window.KgPhase2?.fileToDataUrl) {
      attachment = await window.KgPhase2.fileToDataUrl(file);
      attachmentName = file.name || "bill";
    }
    await api.expenses.create({
      date,
      category,
      amount,
      status: status === "paid" ? "paid" : "unpaid",
      paymentMethod: status === "paid" ? (paymentMethod === "online" ? "online" : "cash") : "unpaid",
      note,
      attachment,
      attachmentName
    });
    ["billAmount", "billNote"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    if (fileEl) fileEl.value = "";
    await loadAll();
    toast("Saved successfully", "ok");
  });
};

window.addRecurringExpense = function () {
  const title = (document.getElementById("recTitle")?.value || "").trim();
  const category = document.getElementById("recCategory")?.value || "rent";
  const amount = num(document.getElementById("recAmount")?.value);
  const dayOfMonth = Math.min(28, Math.max(1, Math.floor(num(document.getElementById("recDay")?.value) || 1)));
  const paymentMethod = document.getElementById("recPaymentMethod")?.value || "online";
  if (!title) return toast("Enter title", "error");
  if (!(amount > 0)) return toast("Enter amount", "error");
  withErr(async () => {
    if (!api.recurringExpenses?.create) throw new Error("Recurring expenses not available");
    await api.recurringExpenses.create({
      title,
      category,
      amount,
      dayOfMonth,
      paymentMethod,
      active: true
    });
    ["recTitle", "recAmount"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    await loadAll();
    toast("Recurring expense saved", "ok");
  });
};

window.removeRecurringExpense = function (id) {
  withErr(async () => {
    await api.recurringExpenses.remove(id);
    await loadAll();
    toast("Deleted", "ok");
  });
};

async function processRecurringExpenses() {
  if (!api?.recurringExpenses?.list || !api?.expenses?.create) return;
  const list = state.recurringExpenses || [];
  if (!list.length) return;
  const today = todayISO();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  const month = today.slice(0, 7);
  for (const rec of list) {
    if (rec.active === false) continue;
    const dueDay = Math.min(28, Math.max(1, Math.floor(num(rec.dayOfMonth) || 1)));
    if (day < dueDay) continue;
    const already = (state.expenses || []).some(
      (e) =>
        String(e.recurringId || "") === String(rec.id) &&
        String(e.date || "").slice(0, 7) === month
    );
    if (already) continue;
    const dueDate = localISODate(new Date(y, m - 1, dueDay));
    await api.expenses.create({
      date: dueDate,
      category: rec.category || "misc",
      amount: num(rec.amount),
      status: "unpaid",
      paymentMethod: "unpaid",
      note: `Recurring: ${rec.title || ""}`,
      recurringId: rec.id
    });
  }
}

function renderRecurringExpenses() {
  const el = document.getElementById("recurringExpensesList");
  if (!el) return;
  el.innerHTML =
    [...(state.recurringExpenses || [])]
      .map(
        (r) =>
          `<div class="row"><div><strong>${escapeHtml(r.title || "")}</strong> · ${escapeHtml(expenseCategoryLabel(r.category))} · ${money(r.amount)} · day ${num(r.dayOfMonth)} · ${escapeHtml(r.paymentMethod || "online")}</div><button class="warn" onclick="removeRecurringExpense('${r.id}')">Delete</button></div>`
      )
      .join("") || `<div class="muted">No recurring expenses yet.</div>`;
}

function expenseAnalyticsRange(period) {
  const toISO = todayISO();
  if (period === "week") return { fromISO: isoAddDays(toISO, -6), toISO, hint: "Last 7 days", period: "week" };
  if (period === "year") return { fromISO: startOfRangeISO("year"), toISO, hint: "This year", period: "year" };
  return { fromISO: startOfRangeISO("month"), toISO, hint: "This month", period: "month" };
}

window.setExpenseAnalyticsPeriod = function (period) {
  expenseAnalyticsPeriod = period === "week" || period === "year" ? period : "month";
  syncPeriodChips("expenseAnalyticsPeriod", expenseAnalyticsPeriod);
  renderExpenseItemAnalytics();
};

function renderExpenseItemAnalytics() {
  const mixCanvas = document.getElementById("expenseItemMixChart");
  const trendCanvas = document.getElementById("expenseItemTrendChart");
  const rankEl = document.getElementById("expenseItemRankList");
  const noteEl = document.getElementById("expenseAnalyticsNote");
  if (!mixCanvas && !trendCanvas && !rankEl) return;

  const range = expenseAnalyticsRange(expenseAnalyticsPeriod);
  const paid = (state.expenses || []).filter(
    (e) => e.status === "paid" && e?.date && dateInPeriod(e.date, range.fromISO, range.toISO)
  );

  const byCat = new Map();
  paid.forEach((e) => {
    const key = String(e.category || "misc").toLowerCase();
    byCat.set(key, (byCat.get(key) || 0) + num(e.amount));
  });
  const ranked = [...byCat.entries()]
    .map(([id, amount]) => ({ id, amount, label: expenseCategoryLabel(id) }))
    .sort((a, b) => b.amount - a.amount);
  const total = ranked.reduce((s, r) => s + r.amount, 0);
  if (noteEl) {
    noteEl.textContent = total > 0
      ? `${range.hint} · ${ranked.length} items · Total ${money(total)}`
      : `${range.hint} · No paid expenses in this period`;
  }

  const top = ranked.slice(0, 8);
  const palette = ["#E87A3A", "#D4782E", "#E89B6D", "#C46A2E", "#A04A35", "#B8552A", "#F5C4A8", "#5C2A1F"];
  const c = chartThemeColors();

  if (mixCanvas && typeof Chart !== "undefined") {
    if (expenseItemMixChartRef) expenseItemMixChartRef.destroy();
    expenseItemMixChartRef = new Chart(mixCanvas, {
      type: "doughnut",
      data: {
        labels: top.length ? top.map((r) => r.label) : ["No data"],
        datasets: [
          {
            data: top.length ? top.map((r) => r.amount) : [1],
            backgroundColor: top.length ? top.map((_, i) => palette[i % palette.length]) : ["#E2E8F0"],
            borderWidth: 0,
            hoverOffset: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: { color: c.text, boxWidth: 10, font: { size: 11, weight: "600" } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = Number(ctx.parsed) || 0;
                const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0.0";
                return `${ctx.label}: ${money(v)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // Trend: top 5 categories over buckets in range
  const buckets =
    expenseAnalyticsPeriod === "year"
      ? buildMonthBuckets(range.fromISO, range.toISO)
      : buildDayBuckets(range.fromISO, range.toISO);
  const top5 = ranked.slice(0, 5);
  const series = top5.map((item) =>
    buckets.map((b) => {
      if (expenseAnalyticsPeriod === "year") {
        const prefix = String(b.key).slice(0, 7);
        return paid
          .filter((e) => String(e.category || "").toLowerCase() === item.id && String(e.date || "").slice(0, 7) === prefix)
          .reduce((s, e) => s + num(e.amount), 0);
      }
      return paid
        .filter((e) => String(e.category || "").toLowerCase() === item.id && String(e.date || "").slice(0, 10) === b.key)
        .reduce((s, e) => s + num(e.amount), 0);
    })
  );

  if (trendCanvas && typeof Chart !== "undefined") {
    if (expenseItemTrendChartRef) expenseItemTrendChartRef.destroy();
    expenseItemTrendChartRef = new Chart(trendCanvas, {
      type: "bar",
      data: {
        labels: buckets.map((b) => b.label),
        datasets: top5.length
          ? top5.map((item, i) => ({
              label: item.label,
              data: series[i],
              backgroundColor: palette[i % palette.length],
              borderRadius: 6,
              maxBarThickness: 18
            }))
          : [
              {
                label: "Spend",
                data: buckets.map(() => 0),
                backgroundColor: "#E2E8F0",
                borderRadius: 6
              }
            ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: { color: c.text, boxWidth: 8, usePointStyle: true, font: { size: 11, weight: "600" } }
          },
          tooltip: {
            callbacks: { label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}` }
          }
        },
        scales: {
          x: { stacked: true, ticks: { color: c.muted, maxRotation: 0 }, grid: { display: false } },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              color: c.muted,
              callback: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)
            },
            grid: { color: c.grid }
          }
        }
      }
    });
  }

  if (rankEl) {
    rankEl.innerHTML =
      ranked
        .map((r, i) => {
          const pct = total > 0 ? (r.amount / total) * 100 : 0;
          return `<div class="expense-rank-row">
            <div>
              <strong>${i + 1}. ${escapeHtml(r.label)}</strong>
              <div class="expense-rank-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
            </div>
            <div>${money(r.amount)}</div>
            <div class="muted">${pct.toFixed(1)}%</div>
          </div>`;
        })
        .join("") || `<div class="muted">No paid expenses in this period.</div>`;
  }
}

const DOC_CATEGORY_LABELS = {
  fssai: "FSSAI / license",
  sticker: "Sticker / label",
  certificate: "Certificate",
  photo: "Photo",
  invoice: "Invoice / bill scan",
  other: "Other"
};

function docCategoryLabel(cat) {
  return DOC_CATEGORY_LABELS[String(cat || "other")] || String(cat || "Other");
}

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(2)} MB`;
}

async function fileToDocumentDataUrl(file) {
  if (!file) throw new Error("Choose a file");
  // Firestore doc limit ~1MB; keep encoded payload under ~900KB
  const maxEncoded = 900000;
  if (window.KgPhase2?.fileToDataUrl) {
    try {
      // Prefer phase2 compression for images; allow larger PDFs than bill attachments
      const maxRaw = String(file.type || "").startsWith("image/") ? 450000 : 650000;
      const dataUrl = await window.KgPhase2.fileToDataUrl(file, maxRaw);
      if (String(dataUrl || "").length > maxEncoded) {
        throw new Error("File still too large after compress (keep under ~650KB)");
      }
      return dataUrl;
    } catch (e) {
      // fall through for non-image if phase2 rejects; rethrow image errors
      if (String(file.type || "").startsWith("image/")) throw e;
    }
  }
  if (file.size > 650000) throw new Error("File too large — keep under ~650KB");
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("Failed to read file"));
    fr.readAsDataURL(file);
  });
  if (dataUrl.length > maxEncoded) throw new Error("File too large after encoding");
  return dataUrl;
}

window.uploadDocument = function () {
  const name = String(document.getElementById("docName")?.value || "").trim();
  const category = document.getElementById("docCategory")?.value || "other";
  const notes = String(document.getElementById("docNotes")?.value || "").trim();
  const fileEl = document.getElementById("docFile");
  const file = fileEl?.files?.[0] || null;
  if (!name) return toast("Enter a display name", "error");
  if (!file) return toast("Choose a file", "error");
  withErr(async () => {
    if (!api?.documents?.create) throw new Error("Documents API not ready");
    const dataUrl = await fileToDocumentDataUrl(file);
    await api.documents.create({
      name,
      category,
      notes,
      fileName: file.name || "file",
      mimeType: file.type || "application/octet-stream",
      size: file.size || 0,
      dataUrl
    });
    if (document.getElementById("docName")) document.getElementById("docName").value = "";
    if (document.getElementById("docNotes")) document.getElementById("docNotes").value = "";
    if (fileEl) fileEl.value = "";
    state.documents = await fetchList("documents", () => api.documents.list());
    renderDocuments();
    toast("Document saved", "ok");
  });
};

window.removeDocument = function (id) {
  if (!id || !confirm("Delete this document?")) return;
  withErr(async () => {
    await api.documents.remove(id);
    state.documents = (state.documents || []).filter((d) => d.id !== id);
    renderDocuments();
    toast("Deleted", "ok");
  });
};

window.renderDocuments = function () {
  const el = document.getElementById("documentsList");
  if (!el) return;
  const q = String(document.getElementById("docSearch")?.value || "")
    .trim()
    .toLowerCase();
  const filter = String(document.getElementById("docFilterCategory")?.value || "");
  let rows = [...(state.documents || [])];
  rows.sort((a, b) => {
    const ta = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : Date.parse(a.createdAt || 0) || 0;
    const tb = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : Date.parse(b.createdAt || 0) || 0;
    return tb - ta;
  });
  if (filter) rows = rows.filter((d) => String(d.category || "") === filter);
  if (q) {
    rows = rows.filter(
      (d) =>
        String(d.name || "").toLowerCase().includes(q) ||
        String(d.fileName || "").toLowerCase().includes(q) ||
        String(d.notes || "").toLowerCase().includes(q)
    );
  }

  el.innerHTML =
    rows
      .map((d) => {
        const isImg = String(d.mimeType || "").startsWith("image/") || /^data:image\//i.test(String(d.dataUrl || ""));
        const preview = isImg && d.dataUrl
          ? `<img class="doc-thumb" src="${String(d.dataUrl).replace(/"/g, "")}" alt="" />`
          : `<div class="doc-file-badge">${escapeHtml((d.fileName || "PDF").split(".").pop()?.toUpperCase() || "FILE")}</div>`;
        const href = String(d.dataUrl || "").replace(/"/g, "");
        return `<article class="doc-card">
          ${preview}
          <div class="doc-card-title">${escapeHtml(d.name || d.fileName || "Untitled")}</div>
          <div class="doc-card-meta">${escapeHtml(docCategoryLabel(d.category))} · ${escapeHtml(formatBytes(d.size))} · ${escapeHtml(d.fileName || "")}</div>
          ${d.notes ? `<div class="doc-card-meta">${escapeHtml(d.notes)}</div>` : ""}
          <div class="doc-card-actions">
            ${href ? `<a class="btn btn-secondary" style="padding:8px 12px;font-size:12px;" href="${href}" target="_blank" rel="noopener" download="${escapeHtml(d.fileName || "document")}">Open / Download</a>` : ""}
            <button type="button" class="warn btn-sm" onclick="removeDocument('${escapeHtml(String(d.id || ""))}')">Delete</button>
          </div>
        </article>`;
      })
      .join("") || `<div class="muted">No documents yet. Upload FSSAI, stickers, or other files above.</div>`;
};

window.addShopExpense = function () {
  // Kept for compatibility — routes to same expenses collection
  addBill();
};

window.toggleExpenseStatus = function (id) {
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return;
  const next = e.status === "paid" ? "unpaid" : "paid";
  withErr(async () => {
    await api.expenses.update(id, { status: next });
    await loadAll();
  });
};

window.addReminder = function () {
  const title = (document.getElementById("remTitle")?.value || "").trim();
  const dueDate = document.getElementById("remDueDate")?.value || "";
  const notifyBeforeDays = Math.max(0, Math.floor(num(document.getElementById("remNotifyBeforeDays")?.value)));
  if (!title || !dueDate) return toast("Enter title and due date", "error");
  withErr(async () => {
    await api.reminders.create({ title, dueDate, notifyBeforeDays });
    ["remTitle", "remDueDate", "remNotifyBeforeDays"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    await loadAll();
    toast("Saved successfully", "ok");
  });
};

window.removeReminder = function (id) {
  withErr(async () => {
    await api.reminders.remove(id);
    await loadAll();
    toast("Deleted", "ok");
  });
};

window.addStaff = function () {
  const name = (document.getElementById("newStaffName")?.value || "").trim();
  const salary = num(document.getElementById("newStaffSalary")?.value);
  if (!name) return;
  if (!(salary > 0)) return toast("Enter monthly salary", "error");
  withErr(async () => {
    await api.staff.create({ name });
    document.getElementById("newStaffName").value = "";
    if (document.getElementById("newStaffSalary")) document.getElementById("newStaffSalary").value = "";
    // Save fixed salary at creation
    await api.fixedSalaries.create({ name, amount: salary, joinDate: todayISO() });
    await loadAll();
    toast("Saved successfully", "ok");
  });
};

window.toggleAddStaff = function () {
  const box = document.getElementById("addStaffBox");
  if (!box) return;
  const isOpen = box.style.display !== "none";
  box.style.display = isOpen ? "none" : "block";
};

window.removeStaff = function (id) {
  withErr(async () => {
    await api.staff.remove(id);
    await loadAll();
    toast("Deleted", "ok");
  });
};

window.setFixedSalary = function () {
  const name = document.getElementById("fixedSalaryStaff")?.value || "";
  const amount = num(document.getElementById("fixedSalaryAmount")?.value);
  if (!name || !(amount > 0)) return toast("Select staff and enter salary amount", "error");
  withErr(async () => {
    await api.fixedSalaries.create({ name, amount, joinDate: todayISO() });
    document.getElementById("fixedSalaryAmount").value = "";
    await loadAll();
    toast("Fixed salary set successfully", "ok");
  });
};

window.addAttendance = function () {
  const date = document.getElementById("attDate")?.value || todayISO();
  const name = document.getElementById("attName")?.value || "";
  const status = document.getElementById("attStatus")?.value || "present";
  if (!name) return toast("Select staff", "error");
  withErr(async () => {
    await api.attendance.create({ date, name, status });
    await loadAll();
    toast("Saved successfully", "ok");
  });
};

function getAttendanceStatusFor(date, name) {
  const entry = getAttendanceEntryFor(date, name);
  return entry ? String(entry.status || "absent") : "";
}

function getAttendanceEntryFor(date, name) {
  const d = String(date || "").slice(0, 10);
  const n = String(name || "");
  return state.attendance.find((a) => String(a.date || "").slice(0, 10) === d && String(a.name || "") === n) || null;
}

function attStatusSelectHtml(name, status) {
  const s = String(status || "");
  const opts = [
    { v: "", l: "Not marked" },
    { v: "present", l: "Present" },
    { v: "half-day", l: "Half day" },
    { v: "absent", l: "Absent" }
  ];
  const inner = opts.map((o) => `<option value="${o.v}" ${s === o.v ? "selected" : ""}>${o.l}</option>`).join("");
  const safe = String(name).replace(/"/g, "&quot;");
  return `<select class="att-status-select" data-att-name="${safe}" aria-label="Attendance for ${safe}">${inner}</select>`;
}

function renderAttendanceChecklist() {
  const el = document.getElementById("attendanceChecklist");
  if (!el) return;
  const date = document.getElementById("attDate")?.value || todayISO();
  const names = staffNames();
  if (!names.length) {
    el.innerHTML = `<div class="muted">No staff yet.</div>`;
    return;
  }
  el.innerHTML = names
    .map((name) => {
      const status = getAttendanceStatusFor(date, name);
      const pill = status || "not marked";
      const safe = name.replace(/'/g, "\\'");
      return `
        <div class="row" style="grid-template-columns:1fr auto auto;gap:10px;align-items:center;">
          <div><strong>${name}</strong> <span class="pill">${pill}</span></div>
          ${attStatusSelectHtml(name, status)}
          <button type="button" class="secondary btn-sm" onclick="openAttendanceHistory('${safe}')">History</button>
        </div>
      `;
    })
    .join("");
}

window.openAttendanceHistory = function (name) {
  const rows = state.attendance
    .filter((a) => a && a.name === name)
    .sort(byDateDesc)
    .slice(0, 30);
  const msg =
    rows.length
      ? rows.map((r) => `${String(r.date).slice(0, 10)} — ${r.status}`).join("\n")
      : "No attendance records for this employee yet.";
  alert(`${name}\n\n${msg}`);
};

window.markAllAttendance = function (status) {
  const el = document.getElementById("attendanceChecklist");
  if (!el) return;
  const v = status === "present" || status === "half-day" || status === "absent" ? status : "";
  el.querySelectorAll("select[data-att-name]").forEach((sel) => {
    sel.value = v;
  });
};

window.saveBulkAttendance = function () {
  const date = document.getElementById("attDate")?.value || todayISO();
  const list = document.getElementById("attendanceChecklist");
  if (!list) return;
  const selects = [...list.querySelectorAll("select[data-att-name]")];
  if (!selects.length) return toast("No staff found", "error");

  const toSave = selects
    .map((sel) => ({
      name: sel.getAttribute("data-att-name") || "",
      status: String(sel.value || "").trim()
    }))
    .filter((x) => x.name && x.status);

  if (!toSave.length) return toast("Select Present, Half day, or Absent for at least one staff", "error");

  withErr(async () => {
    for (const { name, status } of toSave) {
      const existing = getAttendanceEntryFor(date, name);
      if (existing?.id) await api.attendance.update(existing.id, { date, name, status });
      else await api.attendance.create({ date, name, status });
    }
    await loadAll();
    renderAttendanceMonthUi();
    toast(`Attendance saved for ${date} (${toSave.length} staff)`, "ok");
  });
};

window.addSalary = function () {
  const month = document.getElementById("salMonth")?.value || "";
  const name = document.getElementById("salName")?.value || "";
  const amount = num(document.getElementById("salAmount")?.value);
  const status = document.getElementById("salStatus")?.value || "unpaid";
  if (!month || !name || !(amount > 0)) return toast("Fill month, staff and salary", "error");
  withErr(async () => {
    await api.salaries.create({ month, name, amount, status });
    document.getElementById("salAmount").value = "";
    await loadAll();
    toast("Saved successfully", "ok");
  });
};

window.toggleSalaryStatus = function (id) {
  const s = state.salaries.find((x) => x.id === id);
  if (!s) return;
  const next = s.status === "paid" ? "unpaid" : "paid";
  withErr(async () => {
    await api.salaries.update(id, { status: next });
    await loadAll();
  });
};

window.calculateAttendanceBasedSalary = function () {
  const month = document.getElementById("salMonth")?.value || "";
  const name = document.getElementById("salName")?.value || "";
  if (!month || !name) return toast("Select month and staff", "error");
  if (!fixedSalaryFor(name)) return toast("No fixed salary set for this staff", "error");

  const s = calcSalaryForMonth(name, month);
  const advance = salaryAdvanceFor(name, month);
  const finalSalary = Math.max(0, Math.round(s.monthEndPayable));

  if (document.getElementById("salAmount")) document.getElementById("salAmount").value = s.earned.toFixed(2);
  toast(
    `Calculated: Rs ${s.earned.toFixed(2)} on ${s.salaryDays}-day basis (fixed monthly Rs ${s.monthly.toFixed(2)}). ` +
      `Absent ${s.stats.absent}, half ${s.stats.half}. Advance: Rs ${advance}. Payable: Rs ${finalSalary.toFixed(2)}`,
    "info"
  );
};

window.addAdvance = function () {
  const date = document.getElementById("advDate")?.value || todayISO();
  const month = document.getElementById("advMonth")?.value || monthISO();
  const name = document.getElementById("advStaff")?.value || "";
  const method = document.getElementById("advMethod")?.value || "cash";
  const kind = document.getElementById("advKind")?.value || "advance";
  if (!month || !name) return toast("Select month and staff", "error");

  if (kind === "full_salary") {
    return payFullStaffSalary(name, month, method === "online" ? "online" : "cash");
  }

  const amount = num(document.getElementById("advAmount")?.value);
  if (!(amount > 0)) return toast("Enter advance amount", "error");
  withErr(async () => {
    await api.advances.create({ date, month, name, amount, method: method === "online" ? "online" : "cash" });
    document.getElementById("advAmount").value = "";
    await loadAll();
    toast("Advance saved", "ok");
  });
};

window.onAdvKindChanged = function () {
  const kind = document.getElementById("advKind")?.value || "advance";
  const amountEl = document.getElementById("advAmount");
  const btn = document.getElementById("advSubmitBtn");
  const name = document.getElementById("advStaff")?.value || "";
  const month = document.getElementById("advMonth")?.value || monthISO();
  if (kind === "full_salary") {
    if (amountEl) {
      amountEl.disabled = true;
      if (name) {
        const s = calcSalaryForMonth(name, month);
        amountEl.value = s.settled ? "0" : String(Math.max(0, Math.round(s.monthEndPayable)));
      } else {
        amountEl.value = "";
        amountEl.placeholder = "Auto = remaining salary";
      }
    }
    if (btn) btn.textContent = "Pay Full Salary";
  } else {
    if (amountEl) {
      amountEl.disabled = false;
      amountEl.placeholder = "Advance amount";
      amountEl.value = "";
    }
    if (btn) btn.textContent = "Add Staff Advance";
  }
};

window.payFullStaffSalary = function (name, month, method) {
  if (!name || !month) return toast("Select staff and month", "error");
  if (isSalaryMonthSettled(name, month)) return toast("Salary already paid for this month — starts fresh next month", "info");
  const s = calcSalaryForMonth(name, month);
  const payAmt = Math.max(0, Math.round(num(s.monthEndPayable)));
  if (!(payAmt > 0) && num(s.monthEndPayable) < 0) {
    return toast(
      `Advances exceed salary by ${money(Math.abs(s.monthEndPayable))}. Deficit will auto-carry to next month until you settle.`,
      "info"
    );
  }
  if (!(payAmt > 0)) return toast("Nothing left to pay this month", "info");
  if (!confirm(`Pay full remaining salary for ${name}?\n${money(payAmt)} via ${method}\nMonth ${month} will be marked complete.`)) return;

  withErr(async () => {
    await api.salaries.create({
      month,
      name,
      amount: Math.round(num(s.monthly)),
      status: "paid",
      paymentMethod: method === "online" ? "online" : "cash",
      paidAt: todayISO(),
      netPaid: payAmt,
      advanceAdjusted: Math.round(num(s.adv)),
      note: "Full salary settlement"
    });
    const amountEl = document.getElementById("advAmount");
    if (amountEl) amountEl.value = "";
    const kindEl = document.getElementById("advKind");
    if (kindEl) kindEl.value = "advance";
    window.onAdvKindChanged?.();
    await loadAll();
    toast(`Full salary paid for ${name} — month closed`, "ok");
  });
};

window.addInventory = function () {
  const item = (document.getElementById("invItem")?.value || "").trim();
  const unit = (document.getElementById("invUnit")?.value || "").trim() || "unit";
  const qty = num(document.getElementById("invQty")?.value);
  const threshold = num(document.getElementById("invThreshold")?.value);
  if (!item) return toast("Enter item name", "error");
  withErr(async () => {
    await api.inventory.create({ item, unit, qty, threshold });
    ["invItem", "invUnit", "invQty", "invThreshold"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    await loadAll();
    fillInventoryMoveSelect();
    toast("Saved successfully", "ok");
  });
};

window.adjustInventoryStock = function () {
  const id = document.getElementById("invMoveItem")?.value || "";
  const type = document.getElementById("invMoveType")?.value || "in";
  const qty = Math.abs(num(document.getElementById("invMoveQty")?.value));
  const reason = (document.getElementById("invMoveReason")?.value || "").trim();
  const supplier = (document.getElementById("invLotSupplier")?.value || "").trim();
  const expiryDate = String(document.getElementById("invLotExpiry")?.value || "").slice(0, 10);
  if (!id) return toast("Select an item", "error");
  if (!(qty > 0)) return toast("Enter quantity", "error");
  const delta = type === "in" ? qty : -qty;
  withErr(async () => {
    if (!api.inventory?.adjust) throw new Error("Inventory adjust not available");
    await api.inventory.adjust(id, {
      delta,
      type,
      reason,
      date: todayISO(),
      createLot: type === "in",
      supplier,
      expiryDate: type === "in" ? expiryDate : ""
    });
    const qtyEl = document.getElementById("invMoveQty");
    const reasonEl = document.getElementById("invMoveReason");
    if (qtyEl) qtyEl.value = "";
    if (reasonEl) reasonEl.value = "";
    const expEl = document.getElementById("invLotExpiry");
    if (expEl) expEl.value = "";
    await loadAll();
    fillInventoryMoveSelect();
    toast(type === "in" ? "Stock in recorded" : type === "waste" ? "Waste recorded" : "Kitchen usage recorded", "ok");
  });
};

window.onInvMoveTypeChanged = function () {
  const type = document.getElementById("invMoveType")?.value || "in";
  const wrap = document.getElementById("invLotFields");
  if (wrap) wrap.style.display = type === "in" ? "block" : "none";
};

function fillInventoryMoveSelect() {
  const sel = document.getElementById("invMoveItem");
  if (!sel) return;
  const cur = sel.value;
  const opts = [...state.inventory]
    .sort((a, b) => String(a.item || "").localeCompare(String(b.item || "")))
    .map((x) => `<option value="${x.id}">${escapeHtml(x.item || "Item")} (${num(x.qty)} ${escapeHtml(x.unit || "unit")})</option>`)
    .join("");
  sel.innerHTML = opts || `<option value="">No items yet</option>`;
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function renderInventoryMovements() {
  const el = document.getElementById("inventoryMovementsList");
  if (!el) return;
  el.innerHTML =
    [...(state.inventoryMovements || [])]
      .sort((a, b) => {
        const da = String(b.date || "");
        const db_ = String(a.date || "");
        if (da !== db_) return da.localeCompare(db_);
        return String(b.createdAt?.seconds || b.id || "").localeCompare(String(a.createdAt?.seconds || a.id || ""));
      })
      .slice(0, 40)
      .map((m) => {
        const sign = num(m.delta) >= 0 ? "+" : "";
        const pill = `<span class="pill">${escapeHtml(m.type || "move")}</span>`;
        return `<div class="row"><div>${escapeHtml(String(m.date || "").slice(0, 10))} — <strong>${escapeHtml(m.item || "")}</strong> ${pill} ${sign}${num(m.delta)} ${escapeHtml(m.unit || "")}${m.reason ? ` <span class="muted">(${escapeHtml(m.reason)})</span>` : ""}</div><div class="muted">${num(m.qtyBefore)} → ${num(m.qtyAfter)}</div></div>`;
      })
      .join("") || `<div class="muted">No stock movements yet.</div>`;
}

window.removeItem = function (kind, id) {
  const map = {
    sales: () => api.sales.remove(id),
    purchases: () => api.purchases.remove(id),
    expenses: () => api.expenses.remove(id),
    attendance: () => api.attendance.remove(id),
    salaries: () => api.salaries.remove(id),
    advances: () => api.advances.remove(id),
    inventory: () => api.inventory.remove(id)
  };
  if (!map[kind]) return;
  withErr(async () => {
    await map[kind]();
    await loadAll();
    toast("Deleted", "ok");
  });
};

window.exportData = function () {
  withErr(async () => {
    const blob = await api.backup.export();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "restaurant-backup.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Export downloaded", "ok");
  });
};

window.restoreData = function (event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch {
      toast("Invalid JSON", "error");
      return;
    }
    withErr(async () => {
      await api.backup.import(parsed);
      await loadAll();
    });
  };
  reader.readAsText(file);
  event.target.value = "";
};

window.resetAll = function () {
  if (!confirm("Clear all data in your account?")) return;
  const empty = {
    sales: [],
    purchases: [],
    expenses: [],
    inventory: [],
    attendance: [],
    salaries: [],
    advances: [],
    suppliers: [],
    staff: [],
    fixedSalaries: [],
    reminders: [],
    balanceTransfers: [],
    dailyClosings: [],
    documents: []
  };
  withErr(async () => {
    await api.backup.import({ data: empty });
    await loadAll();
  });
};

// -----------------------------
// Rendering lists / analytics
// -----------------------------

function renderSuppliers() {
  const el = document.getElementById("supplierList");
  if (!el) return;
  const items = state.suppliers;
  el.innerHTML =
    items
      .map((s) => {
        const id = typeof s === "string" ? s : s.id;
        const name = typeof s === "string" ? s : s.name;
        const count = typeof s === "object" && Array.isArray(s.items) ? s.items.length : 0;
        return `
          <div class="row">
            <div class="row-main">
              <div class="row-title">${escapeHtml(name || "")}</div>
              <div class="row-meta"><span class="pill">${count} items</span></div>
            </div>
            <div class="row-actions">
              <button type="button" class="secondary" onclick="openEditSupplier('${id}')">Edit</button>
              <button type="button" class="warn" onclick="removeSupplier('${id}')">Remove</button>
            </div>
          </div>
        `;
      })
      .join("") || `<div class="muted">No suppliers.</div>`;

  const dd = document.getElementById("supplierHistorySupplier");
  if (dd) {
    const cur = dd.value || "";
    dd.innerHTML = `<option value="">All suppliers</option>`;
    supplierNames().forEach((name) => {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      dd.appendChild(o);
    });
    dd.value = cur;
  }
}

window.renderSupplierHistory = function () {
  const wrap = document.getElementById("supplierHistoryCards");
  if (!wrap) return;

  const range = document.getElementById("supplierHistoryRange")?.value || "month";
  const onlySupplier = (document.getElementById("supplierHistorySupplier")?.value || "").trim();

  const billRows = state.purchases
    .filter((p) => p && p.date && withinRange(p.date, range))
    .filter((p) => !onlySupplier || String(p.seller || "") === onlySupplier)
    .map((p) => ({ kind: "bill", date: String(p.date).slice(0, 10), seller: p.seller, item: p.item, qty: p.qty, amount: num(p.price), raw: p }));

  const payRows = state.supplierPayments
    .filter((p) => p && p.date && withinRange(p.date, range))
    .filter((p) => !onlySupplier || String(p.seller || "") === onlySupplier)
    .map((p) => ({ kind: "pay", date: String(p.date).slice(0, 10), seller: p.seller, note: p.note, amount: num(p.amount), raw: p }));

  const rows = [...billRows, ...payRows].sort((a, b) => new Date(b.date) - new Date(a.date));

  const bySeller = {};
  rows.forEach((p) => {
    const seller = String(p.seller || "Unknown").trim() || "Unknown";
    if (!bySeller[seller]) bySeller[seller] = [];
    bySeller[seller].push(p);
  });

  const sellers = Object.keys(bySeller).sort((a, b) => a.localeCompare(b));
  if (!sellers.length) {
    wrap.innerHTML = `<div class="muted">No supplier bills in this range.</div>`;
    return;
  }

  wrap.innerHTML = sellers
    .map((seller) => {
      const list = bySeller[seller] || [];
      const totalBills = list.filter((x) => x.kind === "bill").reduce((s, x) => s + num(x.amount), 0);
      const paidBills = list.filter((x) => x.kind === "bill" && isPurchasePaid(x.raw)).reduce((s, x) => s + num(x.amount), 0);
      const unpaidBills = totalBills - paidBills;
      const totalPaid = list.filter((x) => x.kind === "pay").reduce((s, x) => s + num(x.amount), 0) + paidBills;
      const remaining = unpaidBills - list.filter((x) => x.kind === "pay").reduce((s, x) => s + num(x.amount), 0);
      const recent = list.slice(0, 7);

      const recentHtml =
        recent
          .map((r) => {
            if (r.kind === "pay") {
              const note = r.note ? ` <span class="muted">(${String(r.note).slice(0, 30)})</span>` : "";
              return `<div class="row" style="padding:10px;"><div>${r.date} — <strong>Payment</strong>${note} <span class="pill">paid</span></div><div style="font-weight:900;color:var(--profit)">-${money(r.amount)}</div></div>`;
            }
            const meta = `${r.item || "Item"}${num(r.qty) > 0 ? ` • qty ${num(r.qty)}` : ""}`;
            const paid = isPurchasePaid(r.raw);
            return `<div class="row" style="padding:10px;"><div>${r.date} — <strong>${meta}</strong> <span class="pill">${paid ? "paid" : "unpaid"}</span></div><div>${money(r.amount)}</div></div>`;
          })
          .join("") || `<div class="muted">No recent entries.</div>`;

      return `
        <div class="supplierCard">
          <div class="supplierCardHeader">
            <div class="supplierTitle">${seller}</div>
            <div class="supplierMeta">
              <span class="pill">bills ${money(totalBills)}</span>
              <span class="pill">paid ${money(totalPaid)}</span>
              <span class="pill">remaining ${money(remaining)}</span>
              <span class="pill">${range}</span>
            </div>
          </div>
          <div class="supplierEntries">${recentHtml}</div>
        </div>
      `;
    })
    .join("");
};

function renderAdvancesFilters() {
  const dd = document.getElementById("advancesFilterStaff");
  if (!dd) return;
  const cur = dd.value || "";
  dd.innerHTML = `<option value="">All staff</option>`;
  staffNames().forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    dd.appendChild(opt);
  });
  dd.value = cur;
}
function renderStaffMaster() {
  const el = document.getElementById("staffList");
  if (!el) return;
  const items = state.staff;
  el.innerHTML =
    items
      .map((s) => {
        const id = typeof s === "string" ? s : s.id;
        const name = typeof s === "string" ? s : s.name;
        return `<div class="row"><div class="row-main"><div class="row-title">${escapeHtml(name || "")}</div></div><div class="row-actions"><button class="warn" onclick="removeStaff('${id}')">Remove</button></div></div>`;
      })
      .join("") || `<div class="muted">No staff.</div>`;
}

function renderFixedSalaries() {
  const el = document.getElementById("fixedSalaryList");
  if (!el) return;
  el.innerHTML =
    [...state.fixedSalaries]
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      .map((fs) => `<div class="row"><div><strong>${fs.name}</strong></div><div>${money(fs.amount)}</div></div>`)
      .join("") || `<div class="muted">No fixed salaries yet.</div>`;
}

function renderSales() {
  const el = document.getElementById("salesList");
  if (!el) return;
  const period = listPeriod.sales || "month";
  const { fromISO, toISO, hint } = resolvePeriodRange(period);
  const label = document.getElementById("salesListPeriodLabel");
  if (label) label.textContent = `Showing ${hint || period} · ${formatPeriodRangeLabel(fromISO, toISO)}`;

  const rows = [...state.sales]
    .filter((s) => s?.date && dateInPeriod(s.date, fromISO, toISO))
    .sort(byDateDesc);

  el.innerHTML =
    rows
      .slice(0, 80)
      .map((s) => {
        const amounts = saleAmounts(s);
        const showSplit = amounts.swiggy > 0 || amounts.zomato > 0 || amounts.otherOnline > 0;
        const pills = showSplit
          ? `<span class="pill">cash ${money(amounts.cash)}</span><span class="pill">swiggy ${money(amounts.swiggy)}</span><span class="pill">zomato ${money(amounts.zomato)}</span><span class="pill">other ${money(amounts.otherOnline)}</span>`
          : `<span class="pill">cash ${money(amounts.cash)}</span><span class="pill">online ${money(amounts.legacyOnline)}</span>`;
        return `<div class="row">
          <div class="row-main">
            <div class="row-title">${escapeHtml(String(s.date || "").slice(0, 10))}</div>
            <div class="row-meta">${pills}${s.notes ? `<span class="row-note">${escapeHtml(s.notes)}</span>` : ""}</div>
          </div>
          <div class="row-actions"><button class="warn" onclick="removeItem('sales','${s.id}')">Delete</button></div>
        </div>`;
      })
      .join("") || `<div class="muted">No sales in this period.</div>`;
}

window.setListPeriod = function (kind, period) {
  if (!listPeriod[kind]) listPeriod[kind] = "month";
  listPeriod[kind] = period || "month";
  const filterId = kind === "sales" ? "salesListPeriodFilter" : kind === "expenses" ? "expensesListPeriodFilter" : "";
  if (filterId) syncPeriodChips(filterId, listPeriod[kind]);
  if (kind === "sales") renderSales();
  else if (kind === "expenses") renderBills();
};

function renderPurchases() {
  const el = document.getElementById("purchaseList");
  if (!el) return;
  el.innerHTML =
    [...state.purchases]
      .sort(byDateDesc)
      .slice(0, 25)
      .map((p) => {
        const status = isPurchasePaid(p) ? "paid" : (p.paidStatus || "unpaid");
        const method = p.paymentMethod || (status === "paid" ? "cash" : "unpaid");
        const rate = num(p.rate);
        const qty = num(p.qty);
        const meta = `${p.seller || "Supplier"}: ${p.item || "Item"}${rate > 0 ? ` <span class="pill">Rs ${rate}</span>` : ""}${qty > 0 ? ` <span class="pill">qty ${qty}</span>` : ""}`;
        const right =
          status === "paid"
            ? `<span class="pill">${method}</span>`
            : `<select id="purchasePayMethod_${p.id}" style="max-width:120px;"><option value="cash">cash</option><option value="online">online</option></select>`;
        const btn =
          status === "paid"
            ? `<button type="button" class="secondary" onclick="markPurchaseUnpaid('${p.id}')">Mark Unpaid</button>`
            : `<button type="button" onclick="markPurchasePaid('${p.id}')">Mark Paid</button>`;
        return `<div class="row"><div>${p.date} — ${meta} — <strong>${money(p.price)}</strong> <span class="pill">${status}</span></div><div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;">${right}${btn} <button class="warn" onclick="removeItem('purchases','${p.id}')">Delete</button></div></div>`;
      })
      .join("") || `<div class="muted">No supplier bills.</div>`;
}

function renderBills() {
  const el = document.getElementById("billsList");
  if (!el) return;
  const period = listPeriod.expenses || "month";
  const { fromISO, toISO, hint } = resolvePeriodRange(period);
  const label = document.getElementById("expensesListPeriodLabel");
  if (label) label.textContent = `Showing ${hint || period} · ${formatPeriodRangeLabel(fromISO, toISO)}`;

  const rows = [...state.expenses]
    .filter((e) => e?.date && dateInPeriod(e.date, fromISO, toISO))
    .sort(byDateDesc);

  el.innerHTML =
    rows
      .slice(0, 80)
      .map((e) => {
        const att = e.attachment
          ? ` <a class="pill" href="${String(e.attachment).replace(/"/g, "")}" target="_blank" rel="noopener">Bill</a>`
          : "";
        return `<div class="row">
          <div class="row-main">
            <div class="row-title">${escapeHtml(String(e.date || "").slice(0, 10))} — ${escapeHtml(expenseCategoryLabel(e.category))}: ${money(e.amount)}</div>
            <div class="row-meta">
              <span class="pill">${escapeHtml(e.status || "")}</span>
              <span class="pill">${e.paymentMethod === "online" ? "Online" : "Cash"}</span>${att}
              ${e.note ? `<span class="row-note">${escapeHtml(e.note)}</span>` : ""}
            </div>
          </div>
          <div class="row-actions">
            <button type="button" class="secondary" onclick="toggleExpenseStatus('${e.id}')">Toggle</button>
            <button class="warn" onclick="removeItem('expenses','${e.id}')">Delete</button>
          </div>
        </div>`;
      })
      .join("") || `<div class="muted">No expenses in this period.</div>`;
}

function renderReminders() {
  const el = document.getElementById("reminderList");
  if (!el) return;
  el.innerHTML =
    [...state.reminders]
      .sort((a, b) => new Date(String(a.dueDate || "")) - new Date(String(b.dueDate || "")))
      .map((r) => {
        const due = String(r.dueDate || "").slice(0, 10);
        const d = due ? daysUntil(due) : null;
        return `<div class="row"><div>${due} — <strong>${r.title || "Reminder"}</strong> <span class="pill">notify ${num(r.notifyBeforeDays)}d</span></div><div>${d !== null ? `${d >= 0 ? `${d}d` : `${Math.abs(d)}d late`}` : ""} <button class="warn" onclick="removeReminder('${r.id}')">Delete</button></div></div>`;
      })
      .join("") || `<div class="muted">No reminders.</div>`;
}

function renderAttendance() {
  const el = document.getElementById("attendanceList");
  if (!el) return;
  el.innerHTML =
    [...state.attendance]
      .sort(byDateDesc)
      .slice(0, 25)
      .map((a) => `<div class="row"><div>${a.date} — ${a.name} <span class="pill">${a.status}</span></div><button class="warn" onclick="removeItem('attendance','${a.id}')">Delete</button></div>`)
      .join("") || `<div class="muted">No attendance records.</div>`;
}

function renderSalaries() {
  const el = document.getElementById("salaryList");
  if (!el) return;
  el.innerHTML =
    [...state.salaries]
      .sort(byDateDesc)
      .slice(0, 25)
      .map((s) => {
        const adv = salaryAdvanceFor(s.name, s.month);
        const payable = Math.max(0, num(s.amount) - adv);
        const status = s.status || "unpaid";
        const method = s.paymentMethod || "cash";
        const right =
          status === "paid"
            ? `<span class="pill">${method}</span>`
            : `<select id="salaryPayMethod_${s.id}" style="max-width:120px;"><option value="cash">cash</option><option value="online">online</option></select>`;
        const btn =
          status === "paid"
            ? `<button type="button" class="secondary" onclick="toggleSalaryStatus('${s.id}')">Mark Unpaid</button>`
            : `<button type="button" onclick="paySalary('${s.id}')">Mark Paid</button>`;

        return `<div class="row"><div>${s.month} — ${s.name}: Salary ${money(s.amount)}, Advance ${money(adv)}, Payable <strong>${money(payable)}</strong> <span class="pill">${status}</span></div><div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;">${right}${btn} <button class="warn" onclick="removeItem('salaries','${s.id}')">Delete</button></div></div>`;
      })
      .join("") || `<div class="muted">No salary records.</div>`;
}

window.paySalary = function (id) {
  const method = document.getElementById(`salaryPayMethod_${id}`)?.value || "cash";
  withErr(async () => {
    await api.salaries.update(id, { status: "paid", paymentMethod: method === "online" ? "online" : "cash", paidAt: todayISO() });
    await loadAll();
  });
};

window.renderAdvances = function () {
  const el = document.getElementById("advancesList");
  if (!el) return;
  const filterName = (document.getElementById("advancesFilterStaff")?.value || "").trim();
  const filterMonth = (document.getElementById("advMonth")?.value || "").trim();
  el.innerHTML =
    [...state.advances]
      .filter((a) => !filterName || String(a.name || "") === filterName)
      .filter((a) => !filterMonth || String(a.month || "") === filterMonth)
      .sort(byDateDesc)
      .slice(0, 25)
      .map((a) => {
        const method = a.method || "cash";
        return `<div class="row"><div>${a.date} — <strong>${a.name}</strong> <span class="pill">${a.month}</span> <span class="pill">${method}</span></div><div>${money(a.amount)} <button class="warn" onclick="removeItem('advances','${a.id}')">Delete</button></div></div>`;
      })
      .join("") || `<div class="muted">No advance records.</div>`;
};

function formatMonthLongLabel(monthYYYYMM) {
  const key = String(monthYYYYMM || "").slice(0, 7);
  const parts = key.split("-").map(Number);
  if (!parts[0] || !parts[1]) return key || "—";
  const d = new Date(parts[0], parts[1] - 1, 1);
  return d.toLocaleDateString("hi-IN", { month: "long", year: "numeric" });
}

function formatPayModeLabel(mode) {
  const m = String(mode || "cash").toLowerCase();
  if (m === "online" || m === "upi" || m === "bank") return "ऑनलाइन";
  if (m === "cash") return "नकद";
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : "नकद";
}

function formatSlipDate(iso) {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
  const d = parseLocalDay(s);
  return d.toLocaleDateString("hi-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function attendanceStatusMark(status) {
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

/** Print salary / report HTML via #printArea (reliable; avoids blank iframe prints). */
function printHtmlDocument(html, { title = "Document", salaryDoc = false } = {}) {
  return new Promise((resolve) => {
    const area = document.getElementById("printArea");
    if (!area) {
      toast("Print area missing — refresh the page", "error");
      resolve(false);
      return;
    }

    // Accept full HTML doc or body fragment
    let bodyHtml = html;
    const bodyMatch = String(html).match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) bodyHtml = bodyMatch[1];

    area.classList.toggle("salary-doc", !!salaryDoc);
    area.innerHTML = bodyHtml;
    document.body.classList.add("printing-slip");
    document.title = title || document.title;

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      document.body.classList.remove("printing-slip");
      area.classList.remove("salary-doc");
      area.innerHTML = "";
      window.removeEventListener("afterprint", cleanup);
      resolve(true);
    };

    window.addEventListener("afterprint", cleanup);
    setTimeout(() => {
      try {
        window.focus();
        window.print();
        toast("Print dialog opened — choose Save as PDF", "ok");
      } catch (e) {
        console.error(e);
        toast("Could not open print dialog", "error");
        cleanup();
        resolve(false);
        return;
      }
      // Fallback if afterprint never fires
      setTimeout(cleanup, 4000);
    }, 150);
  });
}

function buildStaffSalarySlipHtml(name, month) {
  const s = calcSalaryForMonth(name, month);
  const monthLabel = formatMonthLongLabel(month);
  const monthKey = String(month || "").slice(0, 7);
  const advances = (state.advances || [])
    .filter((a) => a.name === name && String(a.month || "").slice(0, 7) === monthKey)
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const attByDate = {};
  (state.attendance || []).forEach((a) => {
    if (a.name !== name || String(a.date || "").slice(0, 7) !== monthKey) return;
    attByDate[String(a.date).slice(0, 10)] = a;
  });
  const salaryRec = (state.salaries || []).find(
    (r) => r.name === name && String(r.month || "").slice(0, 7) === monthKey && r.status === "paid"
  );
  const payMode = salaryRec ? formatPayModeLabel(salaryRec.paymentMethod || salaryRec.method || "cash") : "—";
  const payDate = salaryRec ? formatSlipDate(salaryRec.paidAt || salaryRec.date || todayISO()) : "—";
  const statusLabel = s.settled ? "भुगतान / बंद" : "खुला";
  const advCash = advances
    .filter((a) => {
      const m = String(a.method || "cash").toLowerCase();
      return m === "cash" || formatPayModeLabel(a.method) === "नकद";
    })
    .reduce((t, a) => t + num(a.amount), 0);
  const advOnline = advances
    .filter((a) => {
      const m = String(a.method || "").toLowerCase();
      return m === "online" || m === "upi" || m === "bank" || formatPayModeLabel(a.method) === "ऑनलाइन";
    })
    .reduce((t, a) => t + num(a.amount), 0);
  const toPay = Math.round(Math.max(0, num(s.monthEndPayable)));

  const advRows =
    advances
      .map(
        (a) =>
          `<tr>
            <td style="padding:6px 4px;border-bottom:1px solid #ccc;">${escapeHtml(formatSlipDate(a.date))}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #ccc;">${escapeHtml(formatPayModeLabel(a.method))}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #ccc;text-align:right;">${money(a.amount)}</td>
          </tr>`
      )
      .join("") ||
    `<tr><td colspan="3" style="padding:8px 4px;color:#555;">इस महीने कोई अग्रिम नहीं</td></tr>`;

  // Full month day grid: ✓ present, ✗ absent
  const monthDays = attendanceDatesForMonth(monthKey);
  const attCells = monthDays
    .map((iso) => {
      const entry = attByDate[iso];
      const raw = entry ? entry.status || (entry.present ? "present" : "absent") : "";
      const info = attendanceStatusMark(raw);
      const dayNum = parseInt(iso.slice(8, 10), 10);
      return `<div style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:44px;height:48px;margin:3px;border:1px solid #ccc;border-radius:6px;background:${info.bg};">
        <div style="font-size:11px;font-weight:700;color:#333;">${dayNum}</div>
        <div style="font-size:18px;font-weight:900;line-height:1;color:${info.color};" title="${escapeHtml(info.label)}">${info.mark}</div>
      </div>`;
    })
    .join("");
  const attTableRows = monthDays
    .map((iso) => {
      const entry = attByDate[iso];
      const raw = entry ? entry.status || (entry.present ? "present" : "absent") : "";
      const info = attendanceStatusMark(raw);
      return `<tr>
        <td style="padding:5px 4px;border-bottom:1px solid #ddd;">${escapeHtml(formatSlipDate(iso))}</td>
        <td style="padding:5px 4px;border-bottom:1px solid #ddd;text-align:center;font-size:18px;font-weight:900;color:${info.color};background:${info.bg};">${info.mark}</td>
        <td style="padding:5px 4px;border-bottom:1px solid #ddd;color:${info.color};font-weight:700;">${escapeHtml(info.label)}</td>
      </tr>`;
    })
    .join("") ||
    `<tr><td colspan="3" style="padding:8px 4px;color:#555;">कोई उपस्थिति दर्ज नहीं</td></tr>`;

  const presentCount = Number(s.stats?.present || 0);
  const absentCount = Number(s.stats?.absent || 0);
  const halfCount = Number(s.stats?.half || 0);
  const earnedAmt = Math.round(num(s.earned));
  const dailyAmt = Math.round(num(s.daily));

  return `
  <div class="slip" style="border:1px solid #333;padding:16px;margin:0 0 18px;background:#fff;color:#111;font-family:'Noto Sans Devanagari',Segoe UI,system-ui,sans-serif;">
    <div style="text-align:center;border-bottom:2px solid #e87a3a;padding-bottom:12px;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:#e87a3a;">द किलोग्राम · वेतन पर्ची</div>
      <div style="font-size:26px;font-weight:900;margin-top:8px;color:#111;">${escapeHtml(name)}</div>
      <div style="font-size:14px;font-weight:700;margin-top:4px;color:#333;">${escapeHtml(monthLabel)} की वेतन पर्ची</div>
      <div style="font-size:12px;color:#555;margin-top:4px;">जारी: ${escapeHtml(formatSlipDate(todayISO()))} · स्थिति: ${statusLabel}</div>
      <div style="font-size:11px;color:#777;margin-top:4px;">वेतन गणना: निश्चित ${s.salaryDays} दिन के आधार पर (महीने में 28/30/31 दिन हो — वेतन वही)</div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
      <tr>
        <td style="width:20%;padding:8px;border:1px solid #bbb;background:#f7f7f7;">
          <div style="font-size:10px;color:#555;font-weight:700;">मासिक वेतन</div>
          <div style="font-size:16px;font-weight:800;margin-top:4px;">${money(s.monthly)}</div>
          <div style="font-size:10px;color:#555;margin-top:2px;">${s.salaryDays} दिन · ${money(dailyAmt)}/दिन</div>
        </td>
        <td style="width:20%;padding:8px;border:1px solid #bbb;background:#f7f7f7;">
          <div style="font-size:10px;color:#555;font-weight:700;">अर्जित वेतन</div>
          <div style="font-size:16px;font-weight:800;margin-top:4px;">${money(earnedAmt)}</div>
          <div style="font-size:10px;color:#555;margin-top:2px;">अनुपस्थिति के बाद</div>
        </td>
        <td style="width:20%;padding:8px;border:1px solid #bbb;background:#f7f7f7;">
          <div style="font-size:10px;color:#555;font-weight:700;">अग्रिम</div>
          <div style="font-size:16px;font-weight:800;margin-top:4px;">${money(Math.round(s.adv))}</div>
          <div style="font-size:10px;color:#555;margin-top:2px;">नकद ${money(Math.round(advCash))} · ऑनलाइन ${money(Math.round(advOnline))}</div>
        </td>
        <td style="width:20%;padding:8px;border:1px solid #bbb;background:#f7f7f7;">
          <div style="font-size:10px;color:#555;font-weight:700;">छुट्टी कटौती</div>
          <div style="font-size:16px;font-weight:800;margin-top:4px;">${money(Math.round(s.leaveDeduction))}</div>
          <div style="font-size:10px;color:#555;margin-top:2px;">${Number(s.leaveDays || 0).toFixed(1)} दिन × ${money(dailyAmt)}</div>
        </td>
        <td style="width:20%;padding:8px;border:1px solid #e87a3a;background:#fde8d8;">
          <div style="font-size:10px;color:#555;font-weight:700;">${s.settled ? "भुगतान राशि" : "देय राशि"}</div>
          <div style="font-size:18px;font-weight:900;margin-top:4px;color:#111;">${money(toPay)}</div>
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
      <tr>
        <td style="padding:8px;border:1px solid #bbb;"><div style="font-size:10px;color:#555;font-weight:700;">भुगतान तरीका</div><div style="font-weight:800;margin-top:3px;">${escapeHtml(s.settled ? payMode : "लंबित")}</div></td>
        <td style="padding:8px;border:1px solid #bbb;"><div style="font-size:10px;color:#555;font-weight:700;">भुगतान तिथि</div><div style="font-weight:800;margin-top:3px;">${escapeHtml(s.settled ? payDate : "—")}</div></td>
        <td style="padding:8px;border:1px solid #bbb;"><div style="font-size:10px;color:#555;font-weight:700;">उपस्थिति</div><div style="font-weight:800;margin-top:3px;"><span style="color:#1a7a3a;">✓ ${presentCount}</span> · <span style="color:#b91c1c;">✗ ${absentCount}</span>${halfCount ? ` · ½ ${halfCount}` : ""} · कुल ${escapeHtml(String(s.stats?.marked ?? 0))}</div></td>
      </tr>
    </table>

    <div style="font-size:12px;font-weight:800;color:#e87a3a;margin:12px 0 6px;">अग्रिम — तिथि · तरीका · राशि</div>
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
          <td style="padding:8px 4px;text-align:right;font-weight:800;">${money(Math.round(s.directAdv))}</td>
        </tr>
      </tfoot>
    </table>

    <div style="font-size:12px;font-weight:800;color:#e87a3a;margin:16px 0 6px;">दिनवार उपस्थिति — ✓ उपस्थित · ✗ अनुपस्थित</div>
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

window.closeSalaryPdfModal = function () {
  document.getElementById("salaryPdfOverlay")?.classList.remove("open");
};

window.exportStaffMonthPdf = function () {
  const names = staffNames();
  if (!names.length) return toast("No staff to export — add staff first", "error");

  const overlay = document.getElementById("salaryPdfOverlay");
  const staffSel = document.getElementById("salaryPdfStaff");
  const monthEl = document.getElementById("salaryPdfMonth");
  if (!overlay || !staffSel || !monthEl) {
    return toast("Salary PDF picker missing — refresh the page", "error");
  }

  const prefMonth = document.getElementById("salMonth")?.value || document.getElementById("advMonth")?.value || monthISO();
  const prefStaff = (document.getElementById("advancesFilterStaff")?.value || "").trim();

  staffSel.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "— कर्मचारी चुनें —";
  staffSel.appendChild(ph);
  const all = document.createElement("option");
  all.value = "__ALL__";
  all.textContent = "सभी कर्मचारी";
  staffSel.appendChild(all);
  names.forEach((n) => {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    staffSel.appendChild(o);
  });

  if (prefStaff && names.includes(prefStaff)) staffSel.value = prefStaff;
  else staffSel.value = "";

  monthEl.value = prefMonth;
  overlay.classList.add("open");
};

window.confirmSalaryPdfDownload = function () {
  const staffSel = document.getElementById("salaryPdfStaff");
  const monthEl = document.getElementById("salaryPdfMonth");
  const selected = (staffSel?.value || "").trim();
  const month = (monthEl?.value || "").trim() || monthISO();

  if (!selected) return toast("कृपया कर्मचारी चुनें", "error");

  const names = selected === "__ALL__" ? staffNames() : [selected];
  if (!names.length) return toast("कोई कर्मचारी नहीं", "error");

  window.closeSalaryPdfModal();
  downloadStaffSalaryPdf(names, month);
};

function downloadStaffSalaryPdf(names, month) {
  const monthLabel = formatMonthLongLabel(month);
  let slips = "";
  try {
    slips = names.map((name) => buildStaffSalarySlipHtml(name, month)).join("\n");
  } catch (e) {
    console.error(e);
    return toast(e?.message || "Failed to build salary slip", "error");
  }
  if (!slips.trim()) return toast("No slip content to print", "error");

  const bodyHtml = `
    <div style="margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e87a3a;color:#111;font-family:'Noto Sans Devanagari',Segoe UI,system-ui,sans-serif;">
      <div style="font-size:18px;font-weight:900;">द किलोग्राम — ${escapeHtml(monthLabel)} वेतन पर्ची${names.length > 1 ? "याँ" : ""}</div>
      <div style="font-size:13px;margin-top:4px;font-weight:700;">कर्मचारी: ${escapeHtml(names.join(", "))}</div>
      <div style="font-size:12px;color:#555;margin-top:2px;">प्रिंट डायलॉग में Save as PDF चुनें</div>
    </div>
    ${slips}`;

  void printHtmlDocument(bodyHtml, { title: `वेतन पर्ची — ${names.join(", ")} — ${monthLabel}`, salaryDoc: true });
}

window.renderSalaryOverview = function () {
  const month = document.getElementById("salMonth")?.value || monthISO();
  const table = document.getElementById("salaryOverviewList");
  if (!table) return;

  const names = staffNames();
  table.innerHTML = `<div class="table-row"><strong>Employee</strong><strong>Monthly</strong><strong>Attendance (month)</strong><strong>Payable</strong></div>`;

  let totalMonthly = 0;
  let totalAdv = 0;
  let totalLeave = 0;
  let totalMonthEnd = 0;

  if (!names.length) {
    table.innerHTML += `<div class="muted">No staff in master.</div>`;
  } else {
    names.forEach((name) => {
      const s = calcSalaryForMonth(name, month);
      totalMonthly += num(s.monthly);
      totalAdv += num(s.adv);
      totalLeave += num(s.leaveDeduction);
      totalMonthEnd += num(s.monthEndPayable);
      const attLabel =
        s.stats.presentEquivalent > 0 || s.stats.marked > 0
          ? `${s.stats.presentEquivalent} present · ${s.stats.marked} marked · ${s.salaryDays}-day salary${s.leaveDays > 0 ? ` · leave ${s.leaveDays}` : ""}`
          : "No attendance marked";
      const carryPill = s.carryIn > 0 ? ` <span class="pill bad">carry ${money(Math.round(s.carryIn))}</span>` : "";
      const settledPill = s.settled ? ` <span class="pill" style="background:#C46A2E22;color:#C46A2E;">paid · closed</span>` : "";
      const earnPill = `<span class="pill">${money(Math.round(s.earned))} earned · ${s.salaryDays}d basis</span>`;
      const advPill = `<span class="pill">adv ${money(Math.round(s.adv))}</span>`;
      const payBtns = s.settled
        ? ""
        : num(s.monthEndPayable) > 0
          ? ` <button type="button" class="secondary" style="padding:4px 8px;font-size:11px;" onclick='payFullStaffSalary(${JSON.stringify(name)},${JSON.stringify(month)},"cash")'>Pay cash</button>
             <button type="button" class="secondary" style="padding:4px 8px;font-size:11px;" onclick='payFullStaffSalary(${JSON.stringify(name)},${JSON.stringify(month)},"online")'>Pay online</button>`
          : num(s.monthEndPayable) < 0
            ? ` <span class="pill bad">deficit → next month</span>`
            : "";
      const right = `${money(Math.round(s.monthEndPayable))}${settledPill} ${earnPill}${advPill}${carryPill}${payBtns}`;
      table.innerHTML += `<div class="table-row"><div><strong>${escapeHtml(name)}</strong></div><div>${money(s.monthly)}</div><div>${attLabel}</div><div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-end;">${right}</div></div>`;
    });
  }

  const earnedEl = document.getElementById("salTotalEarned");
  const advEl = document.getElementById("salTotalAdvance");
  const payEl = document.getElementById("salTotalPayable");
  const cardEl = document.getElementById("salPayableCard");
  const hintEl = document.getElementById("salMonthEndHint");
  if (earnedEl) earnedEl.textContent = money(Math.round(totalMonthly));
  if (advEl) advEl.textContent = money(Math.round(totalAdv));
  if (payEl) payEl.textContent = money(Math.round(totalMonthEnd));
  if (cardEl) {
    cardEl.classList.toggle("positive", totalMonthEnd >= 0);
    cardEl.classList.toggle("negative", totalMonthEnd < 0);
  }
  if (hintEl) {
    const leaveBit = totalLeave > 0 ? ` minus leave ${money(Math.round(totalLeave))}` : "";
    hintEl.textContent =
      totalMonthEnd >= 0
        ? `Full monthly salaries ${money(Math.round(totalMonthly))} minus advances (incl. carryover) ${money(Math.round(totalAdv))}${leaveBit} — pay ${money(Math.round(totalMonthEnd))} at month end. Excess advance auto-carries to next month until you pay full salary.`
        : `Advances (incl. carryover) ${money(Math.round(totalAdv))} exceed salaries ${money(Math.round(totalMonthly))}${leaveBit}. Deficit auto-handover to next month until settled.`;
  }
};

function renderInventory() {
  const el = document.getElementById("inventoryList");
  if (!el) return;
  fillInventoryMoveSelect();
  window.onInvMoveTypeChanged?.();
  el.innerHTML =
    [...state.inventory]
      .sort((a, b) => String(a.item || "").localeCompare(String(b.item || "")))
      .map((x) => {
        const low = num(x.qty) <= num(x.threshold) && num(x.threshold) > 0;
        return `<div class="row"><div><strong>${escapeHtml(x.item || "")}</strong>: ${num(x.qty)} ${escapeHtml(x.unit || "unit")} <span class="muted">(alert ${num(x.threshold)})</span> ${low ? '<span class="pill bad">LOW</span>' : ""}</div><button class="warn" onclick="removeItem('inventory','${x.id}')">Delete</button></div>`;
      })
      .join("") || `<div class="muted">No inventory items yet — add paneer, oil, spices, veggies above.</div>`;
}

function renderStockLots() {
  const el = document.getElementById("stockLotsList");
  if (!el) return;
  el.innerHTML =
    [...(state.stockLots || [])]
      .filter((l) => num(l.remainingQty ?? l.qty) > 0)
      .sort((a, b) => String(a.expiryDate || "9999").localeCompare(String(b.expiryDate || "9999")))
      .map((l) => {
        const exp = String(l.expiryDate || "").slice(0, 10);
        const d = exp && window.KgPhase2 ? window.KgPhase2.daysBetween(todayISO(), exp) : null;
        let pill = "";
        if (d !== null && d < 0) pill = '<span class="pill bad">EXPIRED</span>';
        else if (d !== null && d <= 3) pill = `<span class="pill bad">${d}d left</span>`;
        else if (exp) pill = `<span class="pill">exp ${escapeHtml(exp)}</span>`;
        return `<div class="row"><div><strong>${escapeHtml(l.item || "")}</strong> · ${num(l.remainingQty ?? l.qty)} ${escapeHtml(l.unit || "")}${l.supplier ? ` · ${escapeHtml(l.supplier)}` : ""} ${pill}</div><div class="muted">${escapeHtml(String(l.date || "").slice(0, 10))}</div></div>`;
      })
      .join("") || `<div class="muted">No active lots. Add expiry when stocking in (or on supplier bills).</div>`;
}

function renderStockAlerts() {
  const alerts = window.KgPhase2?.stockAlerts?.({
    inventory: state.inventory,
    lots: state.stockLots,
    today: todayISO(),
    warnDays: 3
  }) || [];
  const html =
    alerts.map((a) => `<div class="row"><div>${escapeHtml(a.text)}</div><span class="pill ${a.kind === "low" || a.kind === "expired" || a.kind === "expiry" ? "bad" : ""}">${escapeHtml(a.kind)}</span></div>`).join("") ||
    `<div class="muted">No low-stock or expiry alerts.</div>`;
  ["stockAlertsList", "dashStockAlertsList", "anStockAlertsList"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function maybeNotifyStockAlerts() {
  const alerts = window.KgPhase2?.stockAlerts?.({
    inventory: state.inventory,
    lots: state.stockLots,
    today: todayISO(),
    warnDays: 3
  }) || [];
  alerts.slice(0, 3).forEach((a) => toast(a.text, a.kind === "low" || a.kind === "expired" ? "error" : "info"));
}

window.exportReportExcel = function () {
  try {
    const range = document.getElementById("analyticsRange")?.value || "month";
    let fromISO = document.getElementById("analyticsFrom")?.value || "";
    let toISO = document.getElementById("analyticsTo")?.value || todayISO();
    if (!fromISO || range !== "custom") {
      if (range === "today") fromISO = todayISO();
      else if (range === "week") fromISO = startOfRangeISO("week");
      else if (range === "yearly") fromISO = startOfRangeISO("year");
      else if (range === "3m") fromISO = isoAddDays(todayISO(), -90);
      else if (range === "6m") fromISO = isoAddDays(todayISO(), -180);
      else fromISO = startOfRangeISO("month");
      toISO = todayISO();
    }
    const rows = window.KgPhase2.buildReportRows({
      sales: state.sales,
      expenses: state.expenses,
      purchases: state.purchases,
      fromISO,
      toISO
    });
    const csv = window.KgPhase2.toCsv(rows);
    window.KgPhase2.downloadText(`kilogram-report-${fromISO}_to_${toISO}.csv`, csv, "text/csv;charset=utf-8");
    toast("Excel/CSV downloaded", "ok");
  } catch (e) {
    console.error(e);
    toast(e.message || "Export failed", "error");
  }
};

window.exportReportPdf = function () {
  try {
    const range = document.getElementById("analyticsRange")?.value || "month";
    let fromISO = document.getElementById("analyticsFrom")?.value || "";
    let toISO = document.getElementById("analyticsTo")?.value || todayISO();
    if (!fromISO || range !== "custom") {
      if (range === "today") fromISO = todayISO();
      else if (range === "week") fromISO = startOfRangeISO("week");
      else if (range === "yearly") fromISO = startOfRangeISO("year");
      else if (range === "3m") fromISO = isoAddDays(todayISO(), -90);
      else if (range === "6m") fromISO = isoAddDays(todayISO(), -180);
      else fromISO = startOfRangeISO("month");
      toISO = todayISO();
    }
    const rows = window.KgPhase2.buildReportRows({
      sales: state.sales,
      expenses: state.expenses,
      purchases: state.purchases,
      fromISO,
      toISO
    });
    const body = rows
      .slice(1)
      .map(
        (r) =>
          `<tr><td>${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td><td>${escapeHtml(r[2])}</td><td style="text-align:right">${escapeHtml(r[3])}</td><td>${escapeHtml(r[4])}</td></tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Kilogram Report</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;color:#e87a3a}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #fde8d8;padding:8px;text-align:left}th{background:#fdf0e6}</style>
      </head><body>
      <h1>The Kilogram — Report</h1>
      <p>${escapeHtml(fromISO)} → ${escapeHtml(toISO)}</p>
      <table><thead><tr><th>Type</th><th>Date</th><th>Detail</th><th>Amount</th><th>Status</th></tr></thead><tbody>${body}</tbody></table>
      </body></html>`;
    void printHtmlDocument(html, { title: "Kilogram Report" });
  } catch (e) {
    console.error(e);
    toast(e.message || "PDF failed", "error");
  }
};

function renderStaffPayableTable() {
  const month = document.getElementById("salMonth")?.value || monthISO();
  const table = document.getElementById("staffPayableTable");
  if (!table) return;
  table.innerHTML = `<div class="table-row"><strong>Staff</strong><strong>Salary</strong><strong>Advance</strong><strong>Payable</strong></div>`;
  staffNames().forEach((name) => {
    const sal = state.salaries.find((x) => x.name === name && x.month === month);
    const salaryAmount = sal ? num(sal.amount) : 0;
    const adv = salaryAdvanceFor(name, month);
    const payable = Math.max(0, salaryAmount - adv);
    table.innerHTML += `<div class="table-row"><div>${name}</div><div>${money(salaryAmount)}</div><div>${money(adv)}</div><div>${money(payable)}</div></div>`;
  });
  if (!staffNames().length) table.innerHTML += `<div class="muted">No staff in master.</div>`;
}

function chartThemeColors() {
  const s = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => {
    const v = s.getPropertyValue(name).trim();
    return v || fallback;
  };
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    text: pick("--chart-text", dark ? "#CBD5E1" : "#374151"),
    muted: pick("--chart-muted", dark ? "#94A3B8" : "#6B7280"),
    grid: pick("--chart-grid", dark ? "rgba(51, 65, 85, 0.65)" : "rgba(229, 231, 235, 0.85)")
  };
}

function chartOptions(isDoughnut = false) {
  const c = chartThemeColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600, easing: "easeOutQuart" },
    plugins: { legend: { labels: { color: c.text, font: { family: "Plus Jakarta Sans", size: 12, weight: "500" } } } },
    scales: isDoughnut
      ? {}
      : {
          x: { ticks: { color: c.muted }, grid: { color: c.grid } },
          y: { ticks: { color: c.muted }, grid: { color: c.grid } }
        }
  };
}

window.renderAnalytics = async function () {
  const range = document.getElementById("analyticsRange")?.value || "month";
  syncPeriodChips("analyticsPeriodFilter", ["today", "week", "month"].includes(range) ? range : "");
  const fromEl = document.getElementById("analyticsFrom");
  const toEl = document.getElementById("analyticsTo");

  if (fromEl && toEl) {
    const showCustom = range === "custom";
    fromEl.style.display = showCustom ? "block" : "none";
    toEl.style.display = showCustom ? "block" : "none";
    if (showCustom) {
      if (!fromEl.value) fromEl.value = isoAddDays(todayISO(), -30);
      if (!toEl.value) toEl.value = todayISO();
    }
  }

  const periodLabelEl = document.getElementById("analyticsPeriodLabel");
  setLoading(true);
  try {
    const parseDay = (iso) => parseLocalDay(iso);
    const isoDay = (d) => localISODate(d);
    const isoMonth = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const weekStartISO = (d) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const day = (x.getDay() + 6) % 7; // Mon=0
      x.setDate(x.getDate() - day);
      return isoDay(x);
    };

    const today = parseDay(todayISO());
    let fromISO = "";
    let toISO = "";

    if (range === "custom") {
      fromISO = document.getElementById("analyticsFrom")?.value || isoAddDays(todayISO(), -30);
      toISO = document.getElementById("analyticsTo")?.value || todayISO();
    } else if (range === "today") {
      fromISO = todayISO();
      toISO = todayISO();
    } else if (range === "week") {
      fromISO = startOfRangeISO("week");
      toISO = todayISO();
    } else if (range === "month") {
      fromISO = startOfRangeISO("month");
      toISO = todayISO();
    } else if (range === "daily") {
      fromISO = isoAddDays(todayISO(), -13);
      toISO = todayISO();
    } else if (range === "weekly") {
      fromISO = isoAddDays(todayISO(), -7 * 7);
      toISO = todayISO();
    } else if (range === "monthly") {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 5);
      d.setDate(1);
      fromISO = isoDay(d);
      toISO = todayISO();
    } else if (range === "3m") {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 2);
      d.setDate(1);
      fromISO = isoDay(d);
      toISO = todayISO();
    } else if (range === "6m") {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 5);
      d.setDate(1);
      fromISO = isoDay(d);
      toISO = todayISO();
    } else {
      const d = new Date(today);
      d.setMonth(0, 1);
      fromISO = isoDay(d);
      toISO = todayISO();
    }

    const fromDate = parseDay(fromISO);
    const toDate = parseDay(toISO);
    const daysSpan = Math.max(1, Math.round((toDate - fromDate) / (24 * 3600 * 1000)) + 1);

    if (periodLabelEl) {
      periodLabelEl.textContent = formatPeriodRangeLabel(fromISO, toISO);
    }

    let bucketMode = "day";
    if (range === "weekly") bucketMode = "week";
    else if (range === "monthly" || range === "3m" || range === "6m" || range === "yearly") bucketMode = "month";
    else if (range === "custom") bucketMode = daysSpan <= 60 ? "day" : daysSpan <= 180 ? "week" : "month";
    else if (range === "month" && daysSpan > 31) bucketMode = "week";

    const inRange = (dateISO) => {
      const x = String(dateISO || "").slice(0, 10);
      if (!x) return false;
      return x >= fromISO && x <= toISO;
    };

    const bucketKeyForISO = (iso) => {
      const d = parseDay(String(iso || "").slice(0, 10));
      if (bucketMode === "week") return weekStartISO(d);
      if (bucketMode === "month") return isoMonth(d);
      return isoDay(d);
    };

    const buckets = [];
    if (bucketMode === "day") {
      for (let i = 0; i < daysSpan; i++) {
        const d = new Date(fromDate);
        d.setDate(d.getDate() + i);
        buckets.push({ key: isoDay(d), label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) });
      }
    } else if (bucketMode === "week") {
      const start = parseDay(weekStartISO(fromDate));
      const end = parseDay(weekStartISO(toDate));
      const weeks = Math.max(1, Math.round((end - start) / (7 * 24 * 3600 * 1000)) + 1);
      for (let i = 0; i < weeks; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i * 7);
        buckets.push({ key: isoDay(d), label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) });
      }
    } else {
      const d0 = new Date(fromDate);
      d0.setDate(1);
      const d1 = new Date(toDate);
      d1.setDate(1);
      let cur = new Date(d0);
      while (cur <= d1) {
        const key = isoMonth(cur);
        buckets.push({ key, label: cur.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) });
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    const rev = new Array(buckets.length).fill(0);
    const exp = new Array(buckets.length).fill(0);
    const profit = new Array(buckets.length).fill(0);
    const supplierPaySeries = new Array(buckets.length).fill(0);

    const add = (iso, amount, series) => {
      const k = bucketKeyForISO(iso);
      const i = idx.get(k);
      if (i === undefined) return;
      series[i] += num(amount);
    };

    // Revenue (sales)
    const salesIn = state.sales.filter((s) => s?.date && inRange(s.date));
    salesIn.forEach((s) => add(s.date, saleAmounts(s).total, rev));

    const expPaidIn = state.expenses.filter((e) => e?.date && e.status === "paid" && inRange(e.date));
    const shopExpenseCats = new Set([
      "staff_food",
      "kitchen",
      "shop_other",
      "vegetables",
      "kirana",
      "milk",
      "tea",
      "limbu_marcha",
      "gas",
      "packaging",
      "cleaning",
      "light_bill",
      "maintenance",
      "kachara",
      "misc"
    ]);
    const shopKitchenPaid = expPaidIn
      .filter((e) => shopExpenseCats.has(String(e.category || "").toLowerCase()))
      .reduce((s, e) => s + num(e.amount), 0);
    expPaidIn.forEach((e) => add(e.date, e.amount, exp));

    const supplierPaymentsIn = state.supplierPayments.filter((p) => p?.date && inRange(p.date));
    supplierPaymentsIn.forEach((p) => {
      add(p.date, p.amount, exp);
      add(p.date, p.amount, supplierPaySeries);
    });

    const paidPurchasesIn = state.purchases.filter((p) => p?.date && isPurchasePaid(p) && inRange(p.date));
    paidPurchasesIn.forEach((p) => {
      add(p.date, p.price, exp);
      add(p.date, p.price, supplierPaySeries);
    });

    const salaryPaidIn = state.salaries
      .filter((s) => s?.status === "paid" && s?.paidAt && inRange(s.paidAt))
      .map((s) => ({ ...s, paidValue: payableForSalaryNonNegative(s) }));
    salaryPaidIn.forEach((s) => add(s.paidAt, s.paidValue, exp));

    for (let i = 0; i < buckets.length; i++) profit[i] = rev[i] - exp[i];

    // KPIs
    const totalRevenue = rev.reduce((s, x) => s + x, 0);
    const totalExpenses = exp.reduce((s, x) => s + x, 0);
    const netProfit = totalRevenue - totalExpenses;
    const salaryPaid = salaryPaidIn.reduce((s, x) => s + num(x.paidValue), 0);
    const supplierPaid = supplierPaymentsIn.reduce((s, x) => s + num(x.amount), 0) + paidPurchasesIn.reduce((s, x) => s + num(x.price), 0);
    const grocery = paidPurchasesIn.reduce((s, p) => s + num(p.price), 0);

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = money(value);
    };
    setText("anKpiRevenue", totalRevenue);
    setText("anKpiExpenses", totalExpenses);
    setText("anKpiProfit", netProfit);
    setText("anKpiSalaryPaid", salaryPaid);
    setText("anKpiSupplierPaid", supplierPaid);
    setText("anKpiGrocery", grocery);

    // Insights
    const expBreakdown = {
      Salary: salaryPaid,
      SupplierPayments: supplierPaid,
      GroceryBills: grocery,
      ShopKitchen: shopKitchenPaid,
      Other: expPaidIn
        .filter((e) => !shopExpenseCats.has(String(e.category || "").toLowerCase()))
        .reduce((s, e) => s + num(e.amount), 0)
    };
    const highest = Object.entries(expBreakdown).sort((a, b) => b[1] - a[1])[0];
    const bestIdx = profit.reduce((best, v, i) => (v > profit[best] ? i : best), 0);
    const lossDays = profit.filter((x) => x < 0).length;
    const setInsight = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setInsight("anInsightHighestExpense", highest ? `${highest[0]} — ${money(highest[1])}` : "—");
    setInsight("anInsightBestDay", buckets[bestIdx] ? `${buckets[bestIdx].label} — ${money(profit[bestIdx])}` : "—");
    setInsight("anInsightLossDays", String(lossDays));

    // Sales breakdown bar (range totals)
    const salesSplit = { cash: 0, swiggy: 0, zomato: 0, otherOnline: 0, onlineTotal: 0 };
    salesIn.forEach((s) => {
      const a = saleAmounts(s);
      const legacyOnlyOther =
        a.swiggy === 0 && a.zomato === 0 && a.otherOnline === 0 && a.legacyOnline > 0 ? a.legacyOnline : 0;
      salesSplit.cash += a.cash;
      salesSplit.swiggy += a.swiggy;
      salesSplit.zomato += a.zomato;
      salesSplit.otherOnline += a.otherOnline + legacyOnlyOther;
      salesSplit.onlineTotal += a.online;
    });

    // Monthly salary payments bar (by month in selected range)
    const salaryByMonth = {};
    salaryPaidIn.forEach((s) => {
      const k = String(s.month || "").slice(0, 7) || bucketKeyForISO(s.paidAt);
      salaryByMonth[k] = num(salaryByMonth[k]) + num(s.paidValue);
    });
    const salaryMonthKeys = Object.keys(salaryByMonth).sort();

    // Destroy old charts if any
    Object.keys(anCharts).forEach((k) => {
      if (anCharts[k]) anCharts[k].destroy();
      anCharts[k] = null;
    });

    const mkChart = (id, config) => {
      const el = document.getElementById(id);
      if (!el || typeof Chart === "undefined") return null;
      return new Chart(el, config);
    };

    // Rev/Exp/Profit line
    anCharts.revExpProfit = mkChart("anLineRevExpProfit", {
      type: "line",
      data: {
        labels: buckets.map((b) => b.label),
        datasets: [
          { label: "Revenue", data: rev, borderColor: "#E87A3A", backgroundColor: "rgba(232, 122, 58,0.14)", fill: true, tension: 0.33 },
          { label: "Expenses", data: exp, borderColor: "#A04A35", backgroundColor: "rgba(160, 74, 53,0.12)", fill: true, tension: 0.33 },
          { label: "Profit", data: profit, borderColor: "#C46A2E", backgroundColor: "rgba(196, 106, 46,0.10)", fill: false, tension: 0.33 }
        ]
      },
      options: chartOptions()
    });

    // Expense breakdown pie
    anCharts.expenseBreakdown = mkChart("anPieExpenseBreakdown", {
      type: "doughnut",
      data: {
        labels: ["Salary", "Supplier Payments", "Grocery Bills", "Daily Expenses", "Other"],
        datasets: [
          {
            data: [salaryPaid, supplierPaid, grocery, expBreakdown.ShopKitchen, expBreakdown.Other],
            backgroundColor: ["#E87A3A", "#D4782E", "#E89B6D", "#A04A35", "#7A3A2A"]
          }
        ]
      },
      options: chartOptions(true)
    });

    // Sales breakdown bar
    anCharts.salesBreakdown = mkChart("anBarSalesBreakdown", {
      type: "bar",
      data: {
        labels: ["Cash", "Swiggy", "Zomato", "Other Online"],
        datasets: [{ label: "Sales", data: [salesSplit.cash, salesSplit.swiggy, salesSplit.zomato, salesSplit.otherOnline], backgroundColor: ["#E87A3A", "#A04A35", "#C46A2E", "#FDE8D8"], borderRadius: 10 }]
      },
      options: chartOptions()
    });

    // Monthly salary payments bar
    anCharts.salaryMonthly = mkChart("anBarSalaryMonthly", {
      type: "bar",
      data: {
        labels: salaryMonthKeys.map((k) => k),
        datasets: [{ label: "Salary Paid", data: salaryMonthKeys.map((k) => salaryByMonth[k]), backgroundColor: ["#E87A3A"], borderRadius: 10 }]
      },
      options: chartOptions()
    });

    // Supplier payments trend
    anCharts.supplierPayments = mkChart("anLineSupplierPayments", {
      type: "line",
      data: {
        labels: buckets.map((b) => b.label),
        datasets: [{ label: "Supplier Payments", data: supplierPaySeries, borderColor: "#C46A2E", backgroundColor: "rgba(196, 106, 46,0.10)", fill: true, tension: 0.33 }]
      },
      options: chartOptions()
    });

    // Profit trend
    anCharts.profitTrend = mkChart("anLineProfitTrend", {
      type: "line",
      data: {
        labels: buckets.map((b) => b.label),
        datasets: [{ label: "Profit", data: profit, borderColor: "#C46A2E", backgroundColor: "rgba(196, 106, 46,0.10)", fill: true, tension: 0.33 }]
      },
      options: chartOptions()
    });

    renderStaffPayableTable();
    renderAnalyticsTransferHistory();
  } catch (e) {
    console.error(e);
    toast(e?.message ? `Error: ${e.message}` : "Error occurred", "error");
  } finally {
    setLoading(false);
  }
};

function renderMasterSelects() {
  fillSelect("purchaseSellerSelect", supplierNames(), "Select Supplier");
  fillItemSelectForSupplier();
  fillSelect("attName", staffNames(), "Select Staff");
  fillSelect("salName", staffNames(), "Select Staff");
  fillSelect("advStaff", staffNames(), "Select Staff");
  fillSelect("fixedSalaryStaff", staffNames(), "Select Staff");
}

function renderAll() {
  safeRun("master selects", renderMasterSelects);
  safeRun("dashboard", renderDashboard);
  safeRun("suppliers", renderSuppliers);
  safeRun("purchases", renderPurchases);
  safeRun("supplier remaining", renderSupplierRemaining);
  safeRun("supplier history", () => window.renderSupplierHistory?.());
  safeRun("bills", renderBills);
  safeRun("reminders", renderReminders);
  safeRun("notifications", renderNotifCenter);
  safeRun("staff master", renderStaffMaster);
  safeRun("fixed salaries", renderFixedSalaries);
  safeRun("advances filters", renderAdvancesFilters);
  safeRun("advances", () => window.renderAdvances?.());
  safeRun("attendance", renderAttendance);
  safeRun("attendance month", renderAttendanceMonthUi);
  safeRun("salaries", renderSalaries);
  safeRun("salary overview", () => window.renderSalaryOverview?.());
  safeRun("sales", renderSales);
  safeRun("inventory", renderInventory);
  safeRun("inventory movements", renderInventoryMovements);
  safeRun("stock lots", renderStockLots);
  safeRun("stock alerts", renderStockAlerts);
  safeRun("recurring expenses", renderRecurringExpenses);
  safeRun("expense analytics", renderExpenseItemAnalytics);
  safeRun("documents", renderDocuments);
  safeRun("balance transfer form", renderBalanceTransferForm);
  safeRun("balance transfer history", renderBalanceTransferHistory);
  safeRun("daily closing history", renderDailyClosingHistory);
  safeRun("analytics transfer history", () => window.renderAnalyticsTransferHistory?.());
}

async function loadAll() {
  setLoading(true);
  try {
    const start = Date.now();
    while (!window.api && Date.now() - start < 8000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    api = window.api;
    if (!api) throw new Error("API not initialized — check internet and refresh the page");
    // Expose for POS upgrade modules (KG.posCheckout soft refresh / stock)
    window.loadAll = loadAll;
    window.state = state;

    const [
      sales,
      purchases,
      supplierPayments,
      expenses,
      inventory,
      inventoryMovements,
      stockLots,
      recurringExpenses,
      attendance,
      salaries,
      advances,
      fixedSalaries,
      reminders,
      supRes,
      stRes,
      menuItems,
      orders,
      balanceTransfers,
      dailyClosings,
      documents
    ] = await Promise.all([
      fetchList("sales", () => api.sales.list()),
      fetchList("purchases", () => api.purchases.list()),
      fetchList("supplier payments", () => (api.supplierPayments?.list ? api.supplierPayments.list() : [])),
      fetchList("expenses", () => api.expenses.list()),
      fetchList("inventory", () => api.inventory.list()),
      fetchList("inventory movements", () => (api.inventory?.movements ? api.inventory.movements() : [])),
      fetchList("stock lots", () => (api.inventory?.lots ? api.inventory.lots() : [])),
      fetchList("recurring expenses", () => (api.recurringExpenses?.list ? api.recurringExpenses.list() : [])),
      fetchList("attendance", () => api.attendance.list()),
      fetchList("salaries", () => api.salaries.list()),
      fetchList("advances", () => api.advances.list()),
      fetchList("fixed salaries", () => (api.fixedSalaries?.list ? api.fixedSalaries.list() : [])),
      fetchList("reminders", () => (api.reminders?.list ? api.reminders.list() : [])),
      fetchList("suppliers", () => api.suppliers.list()),
      fetchList("staff", () => api.staff.list()),
      fetchList("menu", () => (api.menuItems?.list ? api.menuItems.list() : [])),
      fetchList("orders", () => (api.orders?.list ? api.orders.list() : [])),
      fetchList("balance transfers", () => (api.balanceTransfers?.list ? api.balanceTransfers.list() : [])),
      fetchList("daily closings", () => (api.dailyClosings?.list ? api.dailyClosings.list() : [])),
      fetchList("documents", () => (api.documents?.list ? api.documents.list() : []))
    ]);

    state.sales = sales;
    state.purchases = purchases;
    state.supplierPayments = supplierPayments;
    state.expenses = expenses;
    state.inventory = inventory;
    state.inventoryMovements = inventoryMovements;
    state.stockLots = stockLots;
    state.recurringExpenses = recurringExpenses;
    state.attendance = attendance;
    state.salaries = salaries;
    state.advances = advances;
    state.fixedSalaries = fixedSalaries;
    state.reminders = reminders;
    state.suppliers = supRes;
    state.staff = stRes;
    state.menuItems = menuItems;
    state.orders = orders;
    state.balanceTransfers = balanceTransfers;
    state.dailyClosings = dailyClosings;
    state.documents = documents;

    try {
      const purged = await purgeOrphanPosSales();
      if (purged > 0) {
        console.info(`Removed ${purged} orphan POS sale(s) after deleted orders`);
      }
    } catch (purgeErr) {
      console.warn(purgeErr);
    }

    renderAll();
    syncKilogramMenuInBackground();
    maybeNotifyReminders();
    maybeNotifyStockAlerts();
    try {
      const before = (state.expenses || []).length;
      await processRecurringExpenses();
      // Reload expenses if new recurring rows were created
      const afterList = await fetchList("expenses", () => api.expenses.list());
      if (afterList.length !== before) {
        state.expenses = afterList;
        safeRun("bills", renderBills);
        safeRun("dashboard", renderDashboard);
      }
    } catch (recErr) {
      console.warn(recErr);
    }
  } catch (e) {
    console.error(e);
    toast(e?.message ? `Error: ${e.message}` : "Error occurred", "error");
    try {
      renderAll();
    } catch (renderErr) {
      console.error(renderErr);
    }
  } finally {
    setLoading(false);
  }
}

function setDefaults() {
  ["saleDate", "purchaseDate", "billDate", "attDate", "advDate", "remDueDate", "btDate", "dcDate"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = todayISO();
  });
  ["salMonth", "advMonth", "attMonth"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = monthISO();
  });
  const notify = document.getElementById("remNotifyBeforeDays");
  if (notify && !notify.value) notify.value = "5";
  refreshBillCategorySelect();
}

window.addEventListener("load", async () => {
  if (window.__kgAppBooted) return;
  window.__kgAppBooted = true;
  // Desktop: keep sidebar expanded. Mobile: drawer closed until Menu is tapped.
  setSidebarCollapsed(sidebarCollapsed());
  if (isMobileSidebarLayout()) closeAppSidebar();
  setDefaults();
  const sellerSel = document.getElementById("purchaseSellerSelect");
  if (sellerSel) {
    sellerSel.addEventListener("change", () => {
      fillItemSelectForSupplier();
      onPurchaseItemChanged();
    });
  }
  const itemSel = document.getElementById("purchaseItemSelect");
  if (itemSel) itemSel.addEventListener("change", onPurchaseItemChanged);
  const qtyEl = document.getElementById("purchaseQty");
  if (qtyEl) qtyEl.addEventListener("input", recalcPurchaseAmount);
  const rateEl = document.getElementById("purchaseRate");
  if (rateEl) rateEl.addEventListener("input", recalcPurchaseAmount);
  const salMonthEl = document.getElementById("salMonth");
  if (salMonthEl) salMonthEl.addEventListener("change", () => window.renderSalaryOverview?.());
  const attMonthEl = document.getElementById("attMonth");
  if (attMonthEl) attMonthEl.addEventListener("change", () => window.onAttMonthChange?.());
  const attDateEl = document.getElementById("attDate");
  if (attDateEl) attDateEl.addEventListener("change", () => window.onAttDateChange?.());
  const dcOpeningEl = document.getElementById("dcOpeningCash");
  if (dcOpeningEl) {
    dcOpeningEl.addEventListener("input", () => {
      dcOpeningEl.dataset.touched = "1";
    });
  }

  // Wait for Firebase Auth before loading business data
  const loadingText = document.getElementById("appLoadingText");
  if (loadingText) loadingText.textContent = "Checking sign-in…";
  try {
    if (window.KgAuth?.ready) {
      const authState = await window.KgAuth.ready();
      if (!authState?.user) {
        // Redirect handled by auth.js; don't load data
        return;
      }
      window.KgAuth.applyNavGate?.();
    }
  } catch (e) {
    console.error(e);
  }

  await loadAll();
  // Ensure only one screen is visible (fixes dashboard stacking under other sections)
  window.showSection?.(activeSection || "dashboard");
  startTopbarLive();
});

function weatherCodeLabel(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return "Weather";
  if (c === 0) return "Clear";
  if (c <= 3) return "Cloudy";
  if (c <= 67) return "Rain";
  if (c <= 77) return "Snow";
  if (c <= 82) return "Showers";
  if (c <= 99) return "Storm";
  return "Weather";
}

function updateTopbarClock() {
  const el = document.getElementById("topbarClock");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

async function fetchTopbarWeather(lat, lon) {
  const el = document.getElementById("topbarWeather");
  if (!el) return;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,weather_code&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("weather http");
    const data = await res.json();
    const temp = data?.current?.temperature_2m;
    const code = data?.current?.weather_code;
    if (!Number.isFinite(Number(temp))) throw new Error("no temp");
    const label = weatherCodeLabel(code);
    el.textContent = `${Math.round(Number(temp))}°C · ${label}`;
    el.title = `${label} · ${Number(temp).toFixed(1)}°C`;
  } catch (e) {
    console.warn(e);
    el.textContent = "--°C";
    el.title = "Weather unavailable";
  }
}

function startTopbarLive() {
  updateTopbarClock();
  if (!window.__kgClockTimer) {
    window.__kgClockTimer = setInterval(updateTopbarClock, 15000);
  }

  const fallback = { lat: 23.0225, lon: 72.5714 }; // Ahmedabad fallback
  const load = (lat, lon) => fetchTopbarWeather(lat, lon);
  load(fallback.lat, fallback.lon);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => load(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 }
    );
  }
  if (!window.__kgWeatherTimer) {
    window.__kgWeatherTimer = setInterval(() => {
      const el = document.getElementById("topbarWeather");
      if (!el) return;
      // refresh using last known coords if any; otherwise fallback
      load(fallback.lat, fallback.lon);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => load(pos.coords.latitude, pos.coords.longitude),
          () => {},
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 }
        );
      }
    }, 30 * 60 * 1000);
  }
}

window.addEventListener("kg-theme-change", () => {
  safeRun("dashboard", renderDashboard);
  if (activeSection === "analytics") {
    safeRun("analytics", () => window.renderAnalytics?.());
  }
  if (window.lucide?.createIcons) window.lucide.createIcons();
});

window.addEventListener("resize", () => {
  clearTimeout(window.__kgChartResizeT);
  window.__kgChartResizeT = setTimeout(() => window.resizeDashboardCharts?.(), 150);
});

// ============================================================
// PROFIT ANALYSIS MODULE
// ============================================================

let paPeriod = "week";
let paPieChartRef = null;

window.setPAPeriod = function (p) {
  paPeriod = p;
  document.querySelectorAll("#profit-analysis-section .period-chip").forEach((b) => b.classList.remove("active"));
  const map = { week: "paPeriodWeek", month: "paPeriodMonth", custom: "paPeriodCustom" };
  document.getElementById(map[p])?.classList.add("active");
  const rangeEl = document.getElementById("paCustomRange");
  if (rangeEl) rangeEl.style.display = p === "custom" ? "" : "none";
  if (p !== "custom") renderProfitAnalysis();
};

function getPADateRange() {
  const now = new Date();
  if (paPeriod === "week") {
    const day = now.getDay(); // 0=Sun
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const mon = new Date(now); mon.setDate(diff); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
    return { from: mon, to: sun, days: 7 };
  }
  if (paPeriod === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const days = to.getDate();
    return { from, to, days };
  }
  // custom
  const fromVal = document.getElementById("paFrom")?.value;
  const toVal = document.getElementById("paTo")?.value;
  if (!fromVal || !toVal) return null;
  const from = new Date(fromVal + "T00:00:00");
  const to = new Date(toVal + "T23:59:59");
  const days = Math.max(1, Math.round((to - from) / 86400000) + 1);
  return { from, to, days };
}

window.renderProfitAnalysis = function () {
  const range = getPADateRange();
  if (!range) return;
  const { from, to, days } = range;

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr); return d >= from && d <= to;
  };

  // --- Total Sales ---
  const totalSales = (state.sales || [])
    .filter((s) => inRange(s.date))
    .reduce((sum, s) => sum + num(s.amount || s.total || 0), 0);

  // --- Expense categories ---
  const expCats = {
    grocery: 0,    // kitchen: vegetables, kirana, milk, paneer, cheese, dhaniya, capsicum, groundnut_oil, cotton_seed_oil, butter, salt, gas, tea, staff_food
    rent: 0,       // rent, shop_rent
    lightBill: 0,  // light_bill
    fixedBills: 0, // water_bill, maintenance, limbu_marcha, cleaning, kachara, packaging, kitchen, shop_other
    salary: 0,     // staff salaries
    supplier: 0,   // supplier payments
    others: 0
  };

  const groceryKeys = new Set(["vegetables","kirana","milk","tea","paneer","cheese","dhaniya","capsicum","groundnut_oil","cotton_seed_oil","butter","salt","gas","staff_food"]);
  const fixedBillKeys = new Set(["water_bill","maintenance","limbu_marcha","cleaning","kachara","packaging","kitchen","shop_other","utilities"]);

  (state.expenses || []).filter((e) => inRange(e.date)).forEach((e) => {
    const k = String(e.category || e.type || "").toLowerCase();
    const amt = num(e.amount);
    if (k === "rent" || k === "shop_rent") expCats.rent += amt;
    else if (k === "light_bill") expCats.lightBill += amt;
    else if (groceryKeys.has(k)) expCats.grocery += amt;
    else if (fixedBillKeys.has(k)) expCats.fixedBills += amt;
    else expCats.others += amt;
  });

  // Supplier payments + bills marked paid
  (state.supplierPayments || []).filter((p) => inRange(p.date)).forEach((p) => {
    expCats.supplier += num(p.amount);
  });
  (state.purchases || []).filter((p) => isPurchasePaid(p) && inRange(p.date)).forEach((p) => {
    expCats.supplier += num(p.price);
  });

  // Staff salaries — use fixedSalaries + salaries for the covered months
  const monthsInRange = new Set();
  let d = new Date(from);
  while (d <= to) {
    monthsInRange.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  (state.fixedSalaries || []).forEach((s) => {
    if (monthsInRange.has(s.month)) expCats.salary += num(s.amount);
  });
  (state.salaries || []).filter((s) => inRange(s.date || (s.month + "-01"))).forEach((s) => {
    expCats.salary += num(s.amount);
  });

  const totalCosts = Object.values(expCats).reduce((a, b) => a + b, 0);
  const netProfit = totalSales - totalCosts;
  const margin = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : 0;

  // --- KPI cards ---
  const profitColor = netProfit >= 0 ? "#C46A2E" : "#A04A35";
  document.getElementById("paTotalSales").textContent = money(totalSales);
  document.getElementById("paTotalCosts").textContent = money(totalCosts);
  const profitEl = document.getElementById("paNetProfit");
  if (profitEl) { profitEl.textContent = money(netProfit); profitEl.style.color = profitColor; }
  const marginEl = document.getElementById("paProfitMargin");
  if (marginEl) { marginEl.textContent = margin + "%"; marginEl.style.color = profitColor; }

  // --- Daily averages ---
  document.getElementById("paAvgDailySales").textContent = money(totalSales / days);
  document.getElementById("paAvgDailyCost").textContent = money(totalCosts / days);
  const avgProfitEl = document.getElementById("paAvgDailyProfit");
  if (avgProfitEl) {
    avgProfitEl.textContent = money(netProfit / days);
    avgProfitEl.style.color = netProfit >= 0 ? "#C46A2E" : "#A04A35";
  }

  // --- Cost breakdown list ---
  const breakdownData = [
    { label: "Grocery / Kitchen", value: expCats.grocery, color: "#E87A3A" },
    { label: "Staff Salary", value: expCats.salary, color: "#C46A2E" },
    { label: "Supplier Payments", value: expCats.supplier, color: "#E89B6D" },
    { label: "Rent", value: expCats.rent, color: "#A04A35" },
    { label: "Light Bill", value: expCats.lightBill, color: "#D4782E" },
    { label: "Fixed Bills", value: expCats.fixedBills, color: "#B8552A" },
    { label: "Others", value: expCats.others, color: "#E87A3A" }
  ].filter((x) => x.value > 0);

  const breakdownEl = document.getElementById("paCostBreakdown");
  if (breakdownEl) {
    if (breakdownData.length === 0) {
      breakdownEl.innerHTML = `<div class="muted">No expenses in this period.</div>`;
    } else {
      breakdownEl.innerHTML = breakdownData.map((item) => {
        const pct = totalCosts > 0 ? ((item.value / totalCosts) * 100).toFixed(1) : 0;
        return `<div class="row" style="margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${item.color};flex-shrink:0;"></span>
            <span style="font-size:13px;font-weight:500;truncate;">${escapeHtml(item.label)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:13px;font-weight:600;">${money(item.value)}</span>
            <span class="pill" style="background:${item.color}22;color:${item.color};min-width:42px;text-align:center;">${pct}%</span>
          </div>
        </div>`;
      }).join("");
    }
  }

  // --- Pie chart ---
  const canvas = document.getElementById("paPieChart");
  if (canvas && breakdownData.length > 0) {
    if (paPieChartRef) { try { paPieChartRef.destroy(); } catch {} paPieChartRef = null; }
    const c = chartThemeColors?.() || { text: "#888" };
    paPieChartRef = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: breakdownData.map((x) => x.label),
        datasets: [{ data: breakdownData.map((x) => x.value), backgroundColor: breakdownData.map((x) => x.color), borderWidth: 0, hoverOffset: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "55%",
        plugins: {
          legend: { position: "bottom", labels: { color: c.text, font: { size: 11, weight: "600" }, usePointStyle: true, boxWidth: 8 } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${money(ctx.raw)} (${totalCosts > 0 ? ((ctx.raw / totalCosts) * 100).toFixed(1) : 0}%)` } }
        }
      }
    });
  }

  // --- Pending bills (unpaid suppliers + reminders) ---
  const pendingEl = document.getElementById("paPendingBills");
  if (pendingEl) {
    const unpaidSup = (state.purchases || [])
      .filter((p) => !isPurchasePaid(p))
      .map((p) => {
        const due = String(p.date || "").slice(0, 10);
        const daysLeft = due ? Math.ceil((new Date(due) - new Date()) / 86400000) : null;
        const tag = daysLeft === null ? "" : daysLeft < 0 ? `<span class="pill" style="background:#A04A3522;color:#A04A35;">Overdue ${Math.abs(daysLeft)}d</span>` : `<span class="pill" style="background:#FDE8D833;color:#8A3D2E;">In ${daysLeft}d</span>`;
        return `<div class="row"><div><strong>${escapeHtml(p.seller || "Supplier")} — ${escapeHtml(p.item || "Bill")}</strong><div class="muted" style="font-size:12px;">${escapeHtml(due || "No date")} · ${money(p.price)}</div></div>${tag}</div>`;
      });
    const pendingRem = (state.reminders || []).filter((r) => !r.done && !r.completed).map((r) => {
      const due = r.dueDate || r.date || "";
      const daysLeft = due ? Math.ceil((new Date(due) - new Date()) / 86400000) : null;
      const tag = daysLeft === null ? "" : daysLeft < 0 ? `<span class="pill" style="background:#A04A3522;color:#A04A35;">Overdue ${Math.abs(daysLeft)}d</span>` : `<span class="pill" style="background:#FDE8D833;color:#8A3D2E;">In ${daysLeft}d</span>`;
      return `<div class="row"><div><strong>${escapeHtml(r.title || "Bill")}</strong><div class="muted" style="font-size:12px;">${escapeHtml(due || "No date")}</div></div>${tag}</div>`;
    });
    const html = [...unpaidSup, ...pendingRem].join("");
    pendingEl.innerHTML = html || `<div class="muted">No pending bills / reminders.</div>`;
  }

  // --- Weekly breakdown table ---
  const weeklyEl = document.getElementById("paWeeklyTable");
  if (weeklyEl) {
    // Build week buckets spanning the range
    const weeks = [];
    let wStart = new Date(from); wStart.setHours(0,0,0,0);
    // Align to Monday
    const dow = wStart.getDay(); const offset = dow === 0 ? -6 : 1 - dow;
    wStart.setDate(wStart.getDate() + offset);
    while (wStart <= to) {
      const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 6); wEnd.setHours(23,59,59,999);
      weeks.push({ from: new Date(wStart), to: new Date(wEnd) });
      wStart.setDate(wStart.getDate() + 7);
    }

    const fmtShort = (dt) => dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

    const rows = weeks.map((w) => {
      const wSales = (state.sales || []).filter((s) => { const d = new Date(s.date); return d >= w.from && d <= w.to; }).reduce((s, x) => s + num(x.amount || x.total || 0), 0);
      const wCosts = (state.expenses || []).filter((e) => { const d = new Date(e.date); return d >= w.from && d <= w.to; }).reduce((s, e) => s + num(e.amount), 0)
        + (state.supplierPayments || []).filter((p) => { const d = new Date(p.date); return d >= w.from && d <= w.to; }).reduce((s, p) => s + num(p.amount), 0)
        + (state.purchases || []).filter((p) => { if (!isPurchasePaid(p)) return false; const d = new Date(p.date); return d >= w.from && d <= w.to; }).reduce((s, p) => s + num(p.price), 0);
      const wProfit = wSales - wCosts;
      const wColor = wProfit >= 0 ? "#C46A2E" : "#A04A35";
      return `<tr>
        <td style="padding:8px 10px;font-size:13px;">${fmtShort(w.from)} – ${fmtShort(w.to)}</td>
        <td style="padding:8px 10px;font-size:13px;color:#C46A2E;font-weight:600;">${money(wSales)}</td>
        <td style="padding:8px 10px;font-size:13px;color:#A04A35;font-weight:600;">${money(wCosts)}</td>
        <td style="padding:8px 10px;font-size:13px;color:${wColor};font-weight:700;">${money(wProfit)}</td>
      </tr>`;
    }).join("");

    weeklyEl.innerHTML = `<table style="width:100%;border-collapse:collapse;">
      <thead><tr style="border-bottom:1px solid rgba(232,122,58,.08);">
        <th style="padding:8px 10px;text-align:left;font-size:12px;color:#A06A55;">Week</th>
        <th style="padding:8px 10px;text-align:left;font-size:12px;color:#A06A55;">Sales</th>
        <th style="padding:8px 10px;text-align:left;font-size:12px;color:#A06A55;">Costs</th>
        <th style="padding:8px 10px;text-align:left;font-size:12px;color:#A06A55;">Profit</th>
      </tr></thead>
      <tbody>${rows || "<tr><td colspan='4' class='muted' style='padding:12px 10px;'>No data in this period.</td></tr>"}</tbody>
    </table>`;
  }
};

window.clearAppCache = function () {
  if (!confirm("Clear local cache (tickets + UI prefs) and reload?")) return;
  try {
    localStorage.removeItem("kg_pos_tickets_v1");
    localStorage.removeItem("kg_sidebar_collapsed");
    /* keep kg_theme_pref */
  } catch {}
  location.reload();
};

