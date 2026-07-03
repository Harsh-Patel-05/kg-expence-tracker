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

function normalizeKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function money(v) {
  return `Rs ${num(v).toLocaleString("en-IN")}`;
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
window.todayISO = todayISO;

function monthISO() {
  return new Date().toISOString().slice(0, 7);
}

function byDateDesc(a, b) {
  return new Date(b.date || b.month) - new Date(a.date || a.month);
}

function isoAddDays(iso, deltaDays) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function startOfRangeISO(range) {
  const now = new Date();
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (range === "week") {
    const day = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  }
  if (range === "month") {
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }
  if (range === "year") {
    d.setMonth(0, 1);
    return d.toISOString().slice(0, 10);
  }
  return "0000-01-01";
}

function withinRange(dateISO, range) {
  const start = startOfRangeISO(range);
  const x = String(dateISO || "").slice(0, 10);
  if (!x) return false;
  return x >= start;
}

function daysUntil(iso) {
  const now = new Date();
  const a = new Date(now.toISOString().slice(0, 10) + "T00:00:00");
  const b = new Date(`${iso}T00:00:00`);
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
  fixedSalaries: [],
  reminders: []
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
let methodChartRef = null;
let categoryExpenseChartRef = null;
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
  const msgEl = document.getElementById("appLoadingText");
  if (msgEl && message) msgEl.textContent = message;
  else if (msgEl && !on && loadingCount <= 0) msgEl.textContent = "Loading…";
}

function toast(message, type = "info") {
  const wrap = document.getElementById("toastRoot");
  if (!wrap) return alert(message);
  const div = document.createElement("div");
  div.className = `toast toast-${type}`;
  div.textContent = message;
  wrap.appendChild(div);
  setTimeout(() => {
    div.classList.add("toast-out");
    setTimeout(() => div.remove(), 300);
  }, 3200);
}

function showCelebrate(totalText) {
  const ov = document.getElementById("celebrateOverlay");
  const sub = document.getElementById("celebrateSub");
  const wrap = document.getElementById("confettiWrap");
  if (!ov || !wrap) return;
  if (sub) sub.textContent = totalText ? `Total: ${totalText}` : "Saved successfully";

  // confetti
  wrap.innerHTML = "";
  const colors = ["#2F855A", "#38A169", "#ECC94B", "#60A5FA", "#A78BFA", "#FB7185"];
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
}

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
    return window.matchMedia("(max-width: 1100px)").matches;
  } catch {
    return false;
  }
}

window.closeAppSidebar = function () {
  document.body.classList.remove("sidebar-open");
};

window.toggleAppSidebar = function () {
  if (isMobileSidebarLayout()) {
    document.body.classList.toggle("sidebar-open");
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
    toast("Error occurred", "error");
  } finally {
    setLoading(false);
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
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
  const daily = monthly / 30;
  const earned = daily * stats.presentEquivalent;
  const adv = salaryAdvanceFor(name, month);
  // Payable can go negative if advances exceed earned salary
  const payable = earned - adv;
  return { monthly, earned, adv, payable, stats };
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

function recalcPurchaseAmount() {
  const qty = num(document.getElementById("purchaseQty")?.value);
  const rate = num(document.getElementById("purchaseRate")?.value);
  const amountEl = document.getElementById("purchasePrice");
  if (!amountEl) return;
  if (qty > 0 && rate > 0) amountEl.value = String(Math.round(qty * rate));
}

function onPurchaseItemChanged() {
  const itemSelect = document.getElementById("purchaseItemSelect");
  const rateEl = document.getElementById("purchaseRate");
  if (!itemSelect || !rateEl) return;
  const opt = itemSelect.options[itemSelect.selectedIndex];
  const rate = num(opt?.dataset?.rate);
  if (rate > 0) rateEl.value = String(rate);
  recalcPurchaseAmount();
}

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

function expenseCategoryLabel(cat) {
  const k = String(cat || "").toLowerCase();
  const map = {
    rent: "Rent",
    utilities: "Utilities",
    misc: "Misc",
    staff_food: "Staff meals / food",
    kitchen: "Kitchen / supplies",
    shop_other: "Shop / unexpected"
  };
  return map[k] || String(cat || "Expense");
}

function salaryAdvanceFor(name, month) {
  return state.advances.filter((x) => x.name === name && x.month === month).reduce((sum, x) => sum + num(x.amount), 0);
}

function payableForSalary(sal) {
  // Display-level payable; can be negative if advances exceed salary amount
  return num(sal.amount) - salaryAdvanceFor(sal.name, sal.month);
}

function payableForSalaryNonNegative(sal) {
  return Math.max(0, payableForSalary(sal));
}

function calcTotals() {
  // Cache sale amounts to avoid recalculating multiple times
  const salesAmounts = state.sales.map(s => ({ sale: s, amounts: saleAmounts(s) }));
  
  const totalRevenue = salesAmounts.reduce((sum, { amounts }) => sum + amounts.total, 0);
  const totalSales = state.sales.length;

  // Calculate Online Sales (Swiggy + Zomato only)
  const onlineSales = salesAmounts.reduce((sum, { amounts }) => sum + amounts.swiggy + amounts.zomato, 0);

  // Retail = cash + other online (UPI/bank); excludes Swiggy/Zomato; avoids double-counting onlineAmount
  const retailSales = salesAmounts.reduce((sum, { amounts }) => sum + num(amounts.retail), 0);

  const paidSupplierCash = state.purchases
    .filter((p) => p.paidStatus === "paid" && (p.paymentMethod || "cash") !== "online")
    .reduce((sum, p) => sum + num(p.price), 0);
  const paidSupplierBank = state.purchases
    .filter((p) => p.paidStatus === "paid" && (p.paymentMethod || "cash") === "online")
    .reduce((sum, p) => sum + num(p.price), 0);
  const paidSupplier = paidSupplierCash + paidSupplierBank;
  const paidBillsCash = state.expenses
    .filter((e) => e.status === "paid" && (e.paymentMethod || "cash") !== "online")
    .reduce((sum, e) => sum + num(e.amount), 0);
  const paidBillsOnline = state.expenses
    .filter((e) => e.status === "paid" && (e.paymentMethod || "cash") === "online")
    .reduce((sum, e) => sum + num(e.amount), 0);
  const paidBills = paidBillsCash + paidBillsOnline;
  const paidStaff = state.salaries
    .filter((s) => s.status === "paid")
    .reduce((sum, s) => sum + Math.max(0, payableForSalary(s)), 0);

  const totalExpenses = paidSupplier + paidBills + paidStaff;
  const unpaidBills = state.purchases.filter((p) => p.paidStatus === "unpaid").reduce((sum, p) => sum + num(p.price), 0);

  const cashIn = salesAmounts.reduce((sum, { amounts }) => sum + amounts.cash, 0);
  // Bank balance includes ALL online sales (Swiggy + Zomato + Other Online)
  const bankIn = salesAmounts.reduce((sum, { amounts }) => sum + amounts.online, 0);

  const supplierPayCash = state.supplierPayments
    .filter((p) => (p.method || "cash") !== "online")
    .reduce((sum, p) => sum + num(p.amount), 0);
  const supplierPayOnline = state.supplierPayments
    .filter((p) => (p.method || "cash") === "online")
    .reduce((sum, p) => sum + num(p.amount), 0);

  const advCash = state.advances
    .filter((a) => (a.method || "cash") !== "online")
    .reduce((sum, a) => sum + num(a.amount), 0);
  const advOnline = state.advances
    .filter((a) => (a.method || "cash") === "online")
    .reduce((sum, a) => sum + num(a.amount), 0);

  const paidSalaryCash = state.salaries
    .filter((s) => s.status === "paid" && (s.paymentMethod || "cash") !== "online")
    .reduce((sum, s) => sum + Math.max(0, payableForSalary(s)), 0);
  const paidSalaryOnline = state.salaries
    .filter((s) => s.status === "paid" && (s.paymentMethod || "cash") === "online")
    .reduce((sum, s) => sum + Math.max(0, payableForSalary(s)), 0);

  // Supplier bills can be paid via cash/online. Other expense types are treated as cash-out by default.
  const cashOut = paidBillsCash + paidSalaryCash + paidSupplierCash + supplierPayCash + advCash;
  const bankOut = paidBillsOnline + paidSalaryOnline + paidSupplierBank + supplierPayOnline + advOnline;
  const cashBalance = cashIn - cashOut;
  const bankBalance = bankIn - bankOut;
  const totalBalance = cashBalance + bankBalance;

  const netProfit = totalRevenue - totalExpenses;

  return {
    cashBalance,
    bankBalance,
    totalBalance,
    totalRevenue,
    totalSales,
    onlineSales,    // New: Swiggy + Zomato
    retailSales,    // New: Cash + Other Online (excluding Swiggy/Zomato)
    unpaidBills,
    netProfit,
    totalExpenses,
    breakdown: { staff: paidStaff, supplier: paidSupplier, rent: 0, others: 0, bills: paidBills }
  };
}

function renderDashboard() {
  const t = calcTotals();

  const elToday = document.getElementById("todayLabel");
  if (elToday) {
    elToday.textContent = new Date().toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  }

  const cashEl = document.getElementById("kpiCashBalance");
  const bankEl = document.getElementById("kpiBankBalance");
  const totalBalEl = document.getElementById("kpiTotalBalance");
  const revEl = document.getElementById("kpiTotalRevenue");
  const unpaidEl = document.getElementById("kpiUnpaidBills");
  const profitEl = document.getElementById("kpiNetProfit");
  const profitCard = document.getElementById("netProfitCard");
  // New KPI elements
  const onlineSalesEl = document.getElementById("kpiOnlineSales");
  const retailSalesEl = document.getElementById("kpiRetailSales");

  if (cashEl) animateNumber(cashEl, t.cashBalance, (v) => money(v), 950);
  if (bankEl) animateNumber(bankEl, t.bankBalance, (v) => money(v), 950);
  if (totalBalEl) animateNumber(totalBalEl, t.totalBalance, (v) => money(v), 950);
  if (revEl) animateNumber(revEl, t.totalRevenue, (v) => money(v), 950);
  if (unpaidEl) animateNumber(unpaidEl, t.unpaidBills, (v) => money(v), 950);
  
  // Dynamic Net Profit color
  if (profitEl && profitCard) {
    if (t.netProfit >= 0) {
      profitCard.className = "kpi-card span-12 positive";
    } else {
      profitCard.className = "kpi-card span-12 negative";
    }
    animateNumber(profitEl, t.netProfit, (v) => money(v), 1050);
  }
  
  // Update new KPIs
  if (onlineSalesEl) animateNumber(onlineSalesEl, t.onlineSales, (v) => money(v), 950);
  if (retailSalesEl) animateNumber(retailSalesEl, t.retailSales, (v) => money(v), 950);

  renderSalesOverviewChart();
  renderExpenseBreakdownChart();
  renderRecentTransactions();
  renderUpcomingPayments();
}

function renderSalesOverviewChart() {
  const canvas = document.getElementById("salesOverviewChart");
  if (!canvas) return;
  if (salesOverviewChartRef) salesOverviewChartRef.destroy();

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) });
  }
  const idx = new Map(days.map((d, i) => [d.key, i]));
  const cash = new Array(days.length).fill(0);
  const swiggy = new Array(days.length).fill(0);
  const zomato = new Array(days.length).fill(0);
  const otherOnline = new Array(days.length).fill(0);
  
  // Cache sale amounts for performance
  const salesAmounts = state.sales.map(s => ({ sale: s, amounts: saleAmounts(s) }));
  
  salesAmounts.forEach(({ sale, amounts }) => {
    if (!sale.date) return;
    const i = idx.get(String(sale.date).slice(0, 10));
    if (i === undefined) return;
    
    cash[i] += amounts.cash;
    swiggy[i] += amounts.swiggy;
    zomato[i] += amounts.zomato;
    // Only add otherOnline + legacyOnline if it's an old record
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
        { label: "Cash", data: cash, backgroundColor: "rgba(34, 197, 94, 0.85)", borderRadius: 10 },
        { label: "🍔 Swiggy", data: swiggy, backgroundColor: "rgba(251, 146, 60, 0.85)", borderRadius: 10 },
        { label: "🍴 Zomato", data: zomato, backgroundColor: "rgba(239, 68, 68, 0.85)", borderRadius: 10 },
        { label: "Other Online", data: otherOnline, backgroundColor: "rgba(59, 130, 246, 0.85)", borderRadius: 10 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "rgba(226,232,240,0.85)" } } },
      scales: {
        x: { ticks: { color: "rgba(226,232,240,0.72)" }, grid: { color: "rgba(226,232,240,0.12)" } },
        y: { ticks: { color: "rgba(226,232,240,0.72)" }, grid: { color: "rgba(226,232,240,0.12)" } }
      }
    }
  });
}

function renderExpenseBreakdownChart() {
  const canvas = document.getElementById("expenseBreakdownChart");
  if (!canvas) return;
  if (expenseBreakdownChartRef) expenseBreakdownChartRef.destroy();

  const staff = state.salaries.filter((s) => s.status === "paid").reduce((sum, s) => sum + payableForSalaryNonNegative(s), 0);
  const supplier = state.purchases.filter((p) => p.paidStatus === "paid").reduce((sum, p) => sum + num(p.price), 0);
  const billsByCategory = {};
  state.expenses
    .filter((e) => e.status === "paid")
    .forEach((e) => {
      const k = String(e.category || e.type || "others").toLowerCase();
      billsByCategory[k] = (billsByCategory[k] || 0) + num(e.amount);
    });
  const rent = billsByCategory.rent || 0;
  const utilities = billsByCategory.utilities || 0;
  const misc = billsByCategory.misc || 0;
  const shopKitchen =
    (billsByCategory.staff_food || 0) + (billsByCategory.kitchen || 0) + (billsByCategory.shop_other || 0);
  const others = Object.entries(billsByCategory)
    .filter(([k]) => !["rent", "utilities", "misc", "staff_food", "kitchen", "shop_other"].includes(k))
    .reduce((sum, [, v]) => sum + num(v), 0);

  expenseBreakdownChartRef = new Chart(canvas, {
    type: "pie",
    data: {
      labels: ["Staff", "Supplier", "Rent", "Utilities", "Misc", "Shop & kitchen", "Others"],
      datasets: [
        {
          data: [staff, supplier, rent, utilities, misc, shopKitchen, others],
          backgroundColor: ["#ef4444", "#a855f7", "#f97316", "#14b8a6", "#60a5fa", "#eab308", "#94a3b8"]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "rgba(226,232,240,0.85)" } } }
    }
  });
}

function renderRecentTransactions() {
  const el = document.getElementById("recentTransactionsList");
  if (!el) return;

  const tx = [];
  state.sales.forEach((s) => {
    const a = saleAmounts(s);
    tx.push({ kind: "Sale", date: s.date || "", amount: a.total, status: "in" });
  });
  state.purchases.forEach((p) => tx.push({ kind: "Supplier Bill", date: p.date || "", amount: num(p.price), status: p.paidStatus }));
  state.expenses.forEach((e) => tx.push({ kind: "Expense", date: e.date || "", amount: num(e.amount), status: e.status }));
  state.salaries.forEach((s) => tx.push({ kind: "Salary", date: s.month ? `${s.month}-01` : "", amount: payableForSalaryNonNegative(s), status: s.status }));

  const recent = tx
    .filter((x) => x.date)
    .sort(byDateDesc)
    .slice(0, 5);

  el.innerHTML =
    recent
      .map((x) => {
        const pill = x.status ? `<span class="pill">${x.status}</span>` : "";
        return `<div class="row"><div>${x.date} — <strong>${x.kind}</strong> ${pill}</div><div>${money(x.amount)}</div></div>`;
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
    .filter((p) => p.paidStatus === "unpaid")
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
      const last = new Date(y, m, 0).toISOString().slice(0, 10);
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
  state.reminders.forEach((r) => {
    const due = String(r.dueDate || "").slice(0, 10);
    const before = Math.max(0, Math.floor(num(r.notifyBeforeDays)));
    if (!due) return;
    const notifyDate = isoAddDays(due, -before);
    if (notifyDate === t) {
      toast(`Reminder: ${r.title || "Payment due"} in ${before} day(s)`, "info");
    }
  });
}

// -----------------------------
// CRUD actions
// -----------------------------

window.showSection = function (sectionName) {
  activeSection = sectionName;
  closeAppSidebar();
  document.querySelectorAll(".dashboard-section").forEach((section) => section.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  const targetSection = document.getElementById(`${sectionName}-section`);
  const targetNav = document.querySelector(`.nav-item[onclick="showSection('${sectionName}')"]`);
  if (targetSection) targetSection.classList.add("active");
  if (targetNav) targetNav.classList.add("active");
  if (sectionName === "analytics") window.renderAnalytics?.();
  if (sectionName === "staff") window.showStaffTab?.(staffTab);
  if (sectionName === "menu") {
    refreshMenu();
  }
  if (sectionName === "pos") {
    loadPosTickets();
    refreshMenuForPos().then(() => syncKilogramMenuInBackground());
    window.ThermalPrinter?.updateStatusUi?.();
    window.ThermalPrinter?.tryReconnectSaved?.();
    renderPosCart();
    renderPosPayment();
    applySidebarButtonText();
    posLoadTodayTotals();
    posRefreshFavourites();
    renderPosCategoryChips();
    renderPosTickets();
  } else {
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
      method: 'mixed'
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
  const ids = ["menuName", "menuNameHi", "menuPrice", "menuCategory", "menuAvailable"];
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
      const badge = m.available ? `<span class="pill" style="background: rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.25); color:#a7f3d0;">Available</span>`
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
    if (menuEditId) await api.menuItems.update(menuEditId, { name, nameHi, price, category, imageUrl, available });
    else await api.menuItems.create({ name, nameHi, price, category, imageUrl, available });

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
      wrap.innerHTML = `<div class="muted" style="padding: 10px;">No favourites yet — complete a few orders first.</div>`;
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
                  const label = r.variant ? r.variant : "Default";
                  const on = String(r.id) === String(selected?.id);
                  const dis = !r.available;
                  return `<button type="button" class="pos-variant-chip ${on ? "active" : ""}" ${dis ? "disabled" : ""} data-vg="${escapeHtml(groupKey)}" data-vid="${escapeHtml(String(r.id))}">${escapeHtml(label)}</button>`;
                })
                .join("")}
            </div>`;

      return `
        <div class="pos-item${disabledAll ? " disabled" : ""}" ${(!selected?.available) ? "aria-disabled='true'" : ""} data-add-id="${(!selected?.available) ? "" : escapeHtml(String(selected?.id || ""))}">
          <div class="pos-item-media">
            <img src="${escapeHtml(g.imageUrl || "assets/the-kilogram-logo.png")}" onerror="this.src='assets/the-kilogram-logo.png'"/>
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

function buildPrintHtml(title, linesHtml, totalsHtml, footerHtml) {
  return `
    <div style="max-width: 360px; margin: 0 auto; font-family: 'Noto Sans Devanagari', 'Nirmala UI', 'Mangal', sans-serif;">
      <div style="text-align:center; font-weight: 900; font-size: 18px;">The Kilogram</div>
      <div style="text-align:center; font-size: 12px; margin-top: 4px;">${escapeHtml(title)}</div>
      <div style="text-align:center; font-size: 11px; margin-top: 6px;">${escapeHtml(todayISO())} ${new Date().toLocaleTimeString()}</div>
      <hr style="margin: 10px 0;"/>
      ${linesHtml}
      ${totalsHtml ? `<hr style="margin: 10px 0;"/>${totalsHtml}` : ""}
      ${footerHtml || ""}
    </div>
  `;
}

function doPrint(html) {
  const area = document.getElementById("printArea");
  if (!area) return;
  area.innerHTML = html;
  window.print();
  setTimeout(() => {
    area.innerHTML = "";
  }, 500);
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
        return `<div style="display:flex; justify-content:space-between; gap:12px; font-size: 13px;">
        <div style="font-weight:800;">
          ${escapeHtml(title)}
          <div style="font-size:11px;color:#444; margin-top:2px;">${escapeHtml(prep)}</div>
        </div>
        <div style="font-weight:900;">× ${num(it.qty)}</div>
      </div>`;
      })
    );
    doPrint(buildPrintHtml(lang === "hi" ? "किचन ऑर्डर (KOT)" : "KOT", lineParts.join(""), "", ""));
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
    .map((it) => `<div style="display:flex; justify-content:space-between; gap:12px; font-size: 13px;">
      <div>${escapeHtml(it.name)} <span style="color:#555;">(${escapeHtml(prepLabel(it.prep, "en"))}) × ${num(it.qty)}</span></div>
      <div style="font-weight:900;">${money(num(it.price) * num(it.qty))}</div>
    </div>`)
    .join("");

  const totals = `
    <div style="display:flex; justify-content:space-between; font-size: 13px;"><div>Subtotal</div><div style="font-weight:900;">${money(subtotal)}</div></div>
    <div style="display:flex; justify-content:space-between; font-size: 14px; margin-top: 6px;"><div style="font-weight:900;">Total</div><div style="font-weight:900;">${money(total)}</div></div>
    <div style="margin-top: 8px; font-size: 12px;">
      Payment: Cash ${money(cash)} | Online ${money(online)}
    </div>
  `;

  doPrint(buildPrintHtml("Customer Bill", lines, totals, `<div style="text-align:center; font-size: 12px; margin-top: 10px;">Thank you!</div>`));
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
    await api.orders.create(payload);

    await posLoadTodayTotals();
    posRefreshFavourites();
    toast("Order saved", "success");
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
    // Hide immediately (POS UX)
    try {
      const raw = localStorage.getItem("kg_deleted_orders_v1");
      const arr = raw ? JSON.parse(raw) : [];
      const set = new Set(Array.isArray(arr) ? arr.map((x) => String(x)) : []);
      set.add(oid);
      localStorage.setItem("kg_deleted_orders_v1", JSON.stringify(Array.from(set).slice(-500)));
    } catch {}
    const row = document.querySelector(`#orderHistoryBody .row[data-order-id="${CSS.escape(oid)}"]`);
    if (row) row.remove();
    setLoading(true);
    await api.orders.remove(oid);
    toast("Order deleted", "success");
    await posLoadTodayTotals();
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
      .join("") || `<div class="muted">No items yet. Click “Add item”.</div>`;
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
  if (totalEl && !totalEl.value) totalEl.value = total ? String(Math.round(total)) : "";

  el.innerHTML =
    tempPurchaseItems
      .map((it, i) => {
        const meta = `${it.item}${num(it.qty) > 0 ? ` • qty ${num(it.qty)}` : ""}${num(it.rate) > 0 ? ` • rate ${money(num(it.rate)).replace('Rs ', 'Rs ')}` : ""}`;
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
  if (rate < 0) return toast("Rate cannot be negative", "error");
  if (!(price > 0)) {
    // If amount not entered, try qty*rate
    if (qty > 0 && rate > 0) price = Math.round(qty * rate);
  }
  if (!(price > 0)) return toast("Enter amount (or qty + rate)", "error");

  tempPurchaseItems.push({ item, qty, rate, price });
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
  const status = document.getElementById("purchasePaidStatus")?.value || "unpaid";
  const methodWrap = document.getElementById("purchasePayMethodWrap");
  if (methodWrap) methodWrap.style.display = status === "paid" ? "block" : "none";
};

window.addPurchase = function () {
  const date = document.getElementById("purchaseDate")?.value || todayISO();
  const seller = document.getElementById("purchaseSellerSelect")?.value || "";
  const paidStatus = document.getElementById("purchasePaidStatus")?.value || "unpaid";
  const paymentMethod = document.getElementById("purchasePaymentMethod")?.value || "cash";

  if (!seller) return toast("Select supplier", "error");
  if (!tempPurchaseItems.length) return toast("Add at least 1 item", "error");

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
        paidStatus: paidStatus === "paid" ? "paid" : "unpaid",
        paymentMethod: paidStatus === "paid" ? (paymentMethod === "online" ? "online" : "cash") : "unpaid"
      });
    }
    tempPurchaseItems = [];
    const totalEl = document.getElementById("purchaseTotalAmount");
    if (totalEl) totalEl.value = "";
    renderTempPurchaseItems();
    await loadAll();
  });
};

function paymentsForSeller(name) {
  return state.supplierPayments.filter((p) => String(p.seller || "") === String(name || ""));
}

function supplierRemaining(name) {
  const bills = state.purchases.filter((p) => String(p.seller || "") === String(name || "")).reduce((s, p) => s + num(p.price), 0);
  const paid = paymentsForSeller(name).reduce((s, p) => s + num(p.amount), 0);
  return bills - paid;
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
      const isDue = r.remaining > 0;
      const color = isDue ? "var(--expense)" : "var(--profit)";
      return `<div class="row"><div><strong>${r.name}</strong></div><div style="font-weight:900;color:${color}">${money(r.remaining)}</div></div>`;
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
  });
};

window.markPurchaseUnpaid = function (id) {
  withErr(async () => {
    await api.purchases.update(id, { paidStatus: "unpaid", paymentMethod: "unpaid" });
    await loadAll();
  });
};

window.addBill = function () {
  const date = document.getElementById("billDate")?.value || todayISO();
  const category = document.getElementById("billType")?.value || "misc";
  const amount = num(document.getElementById("billAmount")?.value);
  const status = document.getElementById("billStatus")?.value || "unpaid";
  const paymentMethod = document.getElementById("billPaymentMethod")?.value || "cash";
  const note = (document.getElementById("billNote")?.value || "").trim();
  if (!(amount > 0)) return toast("Enter valid amount", "error");
  withErr(async () => {
    await api.expenses.create({ date, category, amount, status, paymentMethod: paymentMethod === "online" ? "online" : "cash", note });
    ["billAmount", "billNote"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    await loadAll();
    toast("Saved successfully", "ok");
  });
};

window.addShopExpense = function () {
  const date = document.getElementById("shopExpenseDate")?.value || todayISO();
  const category = document.getElementById("shopExpenseType")?.value || "shop_other";
  const amount = num(document.getElementById("shopExpenseAmount")?.value);
  const status = document.getElementById("shopExpenseStatus")?.value || "unpaid";
  const paymentMethod = document.getElementById("shopExpensePayMethod")?.value || "cash";
  const note = (document.getElementById("shopExpenseNote")?.value || "").trim();
  if (!(amount > 0)) return toast("Enter valid amount", "error");
  withErr(async () => {
    await api.expenses.create({
      date,
      category,
      amount,
      status,
      paymentMethod: paymentMethod === "online" ? "online" : "cash",
      note
    });
    ["shopExpenseAmount", "shopExpenseNote"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    await loadAll();
    toast("Saved successfully", "ok");
  });
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
    el.innerHTML = `<div class="muted">No staff yet. Click + to add employees.</div>`;
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
  const finalSalary = Math.max(0, s.earned - advance);

  if (document.getElementById("salAmount")) document.getElementById("salAmount").value = s.earned.toFixed(2);
  toast(
    `Calculated: Rs ${s.earned.toFixed(2)} (${s.stats.presentEquivalent} day(s) from attendance). ` +
      `Present ${s.stats.present}, half ${s.stats.half}. Advance: Rs ${advance}. Payable: Rs ${finalSalary.toFixed(2)}`,
    "info"
  );
};

window.addAdvance = function () {
  const date = document.getElementById("advDate")?.value || todayISO();
  const month = document.getElementById("advMonth")?.value || "";
  const name = document.getElementById("advStaff")?.value || "";
  const amount = num(document.getElementById("advAmount")?.value);
  const method = document.getElementById("advMethod")?.value || "cash";
  if (!month || !name || !(amount > 0)) return toast("Fill month, staff and advance", "error");
  withErr(async () => {
    await api.advances.create({ date, month, name, amount, method: method === "online" ? "online" : "cash" });
    document.getElementById("advAmount").value = "";
    await loadAll();
    toast("Saved successfully", "ok");
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
    toast("Saved successfully", "ok");
  });
};

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
    reminders: []
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
          <div class="row" style="grid-template-columns: 1fr auto;">
            <div><strong>${name}</strong> <span class="pill">${count} items</span></div>
            <div class="actions">
              <button type="button" class="btn-ghost btn-sm" onclick="openEditSupplier('${id}')">Edit</button>
              <button type="button" class="warn btn-sm" onclick="removeSupplier('${id}')">Remove</button>
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
      const totalPaid = list.filter((x) => x.kind === "pay").reduce((s, x) => s + num(x.amount), 0);
      const remaining = totalBills - totalPaid;
      const recent = list.slice(0, 7);

      const recentHtml =
        recent
          .map((r) => {
            if (r.kind === "pay") {
              const note = r.note ? ` <span class="muted">(${String(r.note).slice(0, 30)})</span>` : "";
              return `<div class="row" style="padding:10px;"><div>${r.date} — <strong>Payment</strong>${note} <span class="pill">paid</span></div><div style="font-weight:900;color:var(--profit)">-${money(r.amount)}</div></div>`;
            }
            const meta = `${r.item || "Item"}${num(r.qty) > 0 ? ` • qty ${num(r.qty)}` : ""}`;
            return `<div class="row" style="padding:10px;"><div>${r.date} — <strong>${meta}</strong> <span class="pill">bill</span></div><div>${money(r.amount)}</div></div>`;
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
        return `<div class="row"><div>${name}</div><button class="warn" onclick="removeStaff('${id}')">Remove</button></div>`;
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
  el.innerHTML =
    [...state.sales]
      .sort(byDateDesc)
      .slice(0, 25)
      .map((s) => {
        const amounts = saleAmounts(s);
        const showSplit = (amounts.swiggy > 0 || amounts.zomato > 0 || amounts.otherOnline > 0);
        const pills = showSplit
          ? `<span class="pill">cash ${money(amounts.cash)}</span><span class="pill">swiggy ${money(amounts.swiggy)}</span><span class="pill">zomato ${money(amounts.zomato)}</span><span class="pill">other ${money(amounts.otherOnline)}</span>`
          : `<span class="pill">cash ${money(amounts.cash)}</span><span class="pill">online ${money(amounts.legacyOnline)}</span>`;
        return `<div class="row"><div>${s.date} — ${pills}${s.notes ? ` <span class="muted">(${s.notes})</span>` : ""}</div><button class="warn" onclick="removeItem('sales','${s.id}')">Delete</button></div>`;
      })
      .join("") || `<div class="muted">No sales.</div>`;
}

function renderPurchases() {
  const el = document.getElementById("purchaseList");
  if (!el) return;
  el.innerHTML =
    [...state.purchases]
      .sort(byDateDesc)
      .slice(0, 25)
      .map((p) => {
        const status = p.paidStatus || "unpaid";
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
  el.innerHTML =
    [...state.expenses]
      .sort(byDateDesc)
      .slice(0, 25)
      .map(
        (e) =>
          `<div class="row"><div>${e.date} — ${escapeHtml(expenseCategoryLabel(e.category))}: ${money(e.amount)} <span class="pill">${e.status}</span>${e.paymentMethod === "online" ? ` <span class="pill">Online</span>` : ` <span class="pill">Cash</span>`}${e.note ? ` <span class="muted">(${escapeHtml(e.note)})</span>` : ""}</div><div><button type="button" class="secondary" onclick="toggleExpenseStatus('${e.id}')">Toggle</button> <button class="warn" onclick="removeItem('expenses','${e.id}')">Delete</button></div></div>`
      )
      .join("") || `<div class="muted">No expenses.</div>`;
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

window.renderSalaryOverview = function () {
  const month = document.getElementById("salMonth")?.value || monthISO();
  const table = document.getElementById("salaryOverviewList");
  if (!table) return;

  const names = staffNames();
  table.innerHTML = `<div class="table-row"><strong>Employee</strong><strong>Monthly</strong><strong>Attendance (month)</strong><strong>Payable</strong></div>`;
  if (!names.length) {
    table.innerHTML += `<div class="muted">No staff in master.</div>`;
    return;
  }

  names.forEach((name) => {
    const s = calcSalaryForMonth(name, month);
    const attLabel =
      s.stats.presentEquivalent > 0 || s.stats.marked > 0
        ? `${s.stats.presentEquivalent} day(s) • ${s.stats.marked} marked`
        : "No attendance marked";
    const earnedLabel = `${money(s.earned)} earned`;
    const right = `${money(s.payable)} <span class="pill">${earnedLabel}</span> <span class="pill">adv ${money(s.adv)}</span>`;
    table.innerHTML += `<div class="table-row"><div><strong>${name}</strong></div><div>${money(s.monthly)}</div><div>${attLabel}</div><div>${right}</div></div>`;
  });
};

function renderInventory() {
  const el = document.getElementById("inventoryList");
  if (!el) return;
  el.innerHTML =
    [...state.inventory]
      .sort((a, b) => String(a.item || "").localeCompare(String(b.item || "")))
      .map((x) => {
        const low = num(x.qty) < num(x.threshold);
        return `<div class="row"><div>${x.item}: ${num(x.qty)} ${x.unit || "unit"} (alert ${num(x.threshold)}) ${low ? '<span class="pill bad">LOW</span>' : ""}</div><button class="warn" onclick="removeItem('inventory','${x.id}')">Delete</button></div>`;
      })
      .join("") || `<div class="muted">No inventory.</div>`;
}

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

function chartOptions(isDoughnut = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#e2e8f0" } } },
    scales: isDoughnut
      ? {}
      : {
          x: { ticks: { color: "#cbd5e1" }, grid: { color: "rgba(148,163,184,0.2)" } },
          y: { ticks: { color: "#cbd5e1" }, grid: { color: "rgba(148,163,184,0.2)" } }
        }
  };
}

window.renderAnalytics = async function () {
  const range = document.getElementById("analyticsRange")?.value || "monthly";
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

  setLoading(true);
  try {
    const parseDay = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`);
    const isoDay = (d) => d.toISOString().slice(0, 10);
    const isoMonth = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const weekStartISO = (d) => {
      const x = new Date(d);
      const day = (x.getDay() + 6) % 7; // Mon=0
      x.setDate(x.getDate() - day);
      x.setHours(0, 0, 0, 0);
      return isoDay(x);
    };

    const today = parseDay(todayISO());
    let fromISO = "";
    let toISO = "";

    if (range === "custom") {
      fromISO = document.getElementById("analyticsFrom")?.value || isoAddDays(todayISO(), -30);
      toISO = document.getElementById("analyticsTo")?.value || todayISO();
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

    let bucketMode = "day";
    if (range === "weekly") bucketMode = "week";
    else if (range === "monthly" || range === "3m" || range === "6m" || range === "yearly") bucketMode = "month";
    else if (range === "custom") bucketMode = daysSpan <= 60 ? "day" : daysSpan <= 180 ? "week" : "month";

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

    // Expenses = paid expenses + supplier payments + paid salary (master logic)
    const expPaidIn = state.expenses.filter((e) => e?.date && e.status === "paid" && inRange(e.date));
    const shopExpenseCats = new Set(["staff_food", "kitchen", "shop_other"]);
    const shopKitchenPaid = expPaidIn
      .filter((e) => shopExpenseCats.has(String(e.category || "").toLowerCase()))
      .reduce((s, e) => s + num(e.amount), 0);
    expPaidIn.forEach((e) => add(e.date, e.amount, exp));

    const supplierPaymentsIn = state.supplierPayments.filter((p) => p?.date && inRange(p.date));
    supplierPaymentsIn.forEach((p) => {
      add(p.date, p.amount, exp);
      add(p.date, p.amount, supplierPaySeries);
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
    const supplierPaid = supplierPaymentsIn.reduce((s, x) => s + num(x.amount), 0);
    const grocery = state.purchases.filter((p) => p?.date && inRange(p.date)).reduce((s, p) => s + num(p.price), 0);

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
      if (!el) return null;
      return new Chart(el, config);
    };

    // Rev/Exp/Profit line
    anCharts.revExpProfit = mkChart("anLineRevExpProfit", {
      type: "line",
      data: {
        labels: buckets.map((b) => b.label),
        datasets: [
          { label: "Revenue", data: rev, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.14)", fill: true, tension: 0.33 },
          { label: "Expenses", data: exp, borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.12)", fill: true, tension: 0.33 },
          { label: "Profit", data: profit, borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.10)", fill: false, tension: 0.33 }
        ]
      },
      options: chartOptions()
    });

    // Expense breakdown pie
    anCharts.expenseBreakdown = mkChart("anPieExpenseBreakdown", {
      type: "doughnut",
      data: {
        labels: ["Salary", "Supplier Payments", "Grocery Bills", "Shop & kitchen", "Other"],
        datasets: [
          {
            data: [salaryPaid, supplierPaid, grocery, expBreakdown.ShopKitchen, expBreakdown.Other],
            backgroundColor: ["#60a5fa", "#22c55e", "#f97316", "#eab308", "#94a3b8"]
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
        datasets: [{ label: "Sales", data: [salesSplit.cash, salesSplit.swiggy, salesSplit.zomato, salesSplit.otherOnline], backgroundColor: ["#22c55e", "#fb923c", "#ef4444", "#3b82f6"], borderRadius: 10 }]
      },
      options: chartOptions()
    });

    // Monthly salary payments bar
    anCharts.salaryMonthly = mkChart("anBarSalaryMonthly", {
      type: "bar",
      data: {
        labels: salaryMonthKeys.map((k) => k),
        datasets: [{ label: "Salary Paid", data: salaryMonthKeys.map((k) => salaryByMonth[k]), backgroundColor: ["#60a5fa"], borderRadius: 10 }]
      },
      options: chartOptions()
    });

    // Supplier payments trend
    anCharts.supplierPayments = mkChart("anLineSupplierPayments", {
      type: "line",
      data: {
        labels: buckets.map((b) => b.label),
        datasets: [{ label: "Supplier Payments", data: supplierPaySeries, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.10)", fill: true, tension: 0.33 }]
      },
      options: chartOptions()
    });

    // Profit trend
    anCharts.profitTrend = mkChart("anLineProfitTrend", {
      type: "line",
      data: {
        labels: buckets.map((b) => b.label),
        datasets: [{ label: "Profit", data: profit, borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.10)", fill: true, tension: 0.33 }]
      },
      options: chartOptions()
    });

    renderStaffPayableTable();
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
  renderMasterSelects();
  renderDashboard();
  renderSuppliers();
  renderPurchases();
  renderSupplierRemaining();
  window.renderSupplierHistory?.();
  renderBills();
  renderReminders();
  renderStaffMaster();
  renderFixedSalaries();
  renderAdvancesFilters();
  window.renderAdvances?.();
  renderAttendance();
  renderAttendanceMonthUi();
  renderSalaries();
  window.renderSalaryOverview?.();
  renderSales();
  renderInventory();
}

async function loadAll() {
  setLoading(true);
  try {
    // Wait for `window.api` to be ready (Firebase or backend fallback).
    const start = Date.now();
    while (!window.api && Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    api = window.api;
    if (!api) throw new Error("API not initialized (check Firebase/backend)");
    const [sales, purchases, supplierPayments, expenses, inventory, attendance, salaries, advances, fixedSalaries, reminders, supRes, stRes, menuItems, orders] = await Promise.all([
      api.sales.list(),
      api.purchases.list(),
      api.supplierPayments?.list?.() || [],
      api.expenses.list(),
      api.inventory.list(),
      api.attendance.list(),
      api.salaries.list(),
      api.advances.list(),
      api.fixedSalaries?.list?.() || [],
      api.reminders?.list?.() || [],
      api.suppliers.list(),
      api.staff.list(),
      api.menuItems?.list?.() || [],
      api.orders?.list?.({ date: todayISO() }) || []
    ]);

    state.sales = Array.isArray(sales) ? sales : [];
    state.purchases = Array.isArray(purchases) ? purchases : [];
    state.supplierPayments = Array.isArray(supplierPayments) ? supplierPayments : [];
    state.expenses = Array.isArray(expenses) ? expenses : [];
    state.inventory = Array.isArray(inventory) ? inventory : [];
    state.attendance = Array.isArray(attendance) ? attendance : [];
    state.salaries = Array.isArray(salaries) ? salaries : [];
    state.advances = Array.isArray(advances) ? advances : [];
    state.fixedSalaries = Array.isArray(fixedSalaries) ? fixedSalaries : [];
    state.reminders = Array.isArray(reminders) ? reminders : [];
    state.suppliers = Array.isArray(supRes) ? supRes : [];
    state.staff = Array.isArray(stRes) ? stRes : [];
    state.menuItems = Array.isArray(menuItems) ? menuItems : (Array.isArray(menuItems?.items) ? menuItems.items : []);
    state.orders = Array.isArray(orders) ? orders : [];

    renderAll();
    syncKilogramMenuInBackground();
    maybeNotifyReminders();
  } catch (e) {
    console.error(e);
    toast(e?.message ? `Error: ${e.message}` : "Error occurred", "error");
  } finally {
    setLoading(false);
  }
}

function setDefaults() {
  ["saleDate", "purchaseDate", "billDate", "shopExpenseDate", "attDate", "advDate", "remDueDate"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = todayISO();
  });
  ["salMonth", "advMonth", "attMonth"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = monthISO();
  });
  const notify = document.getElementById("remNotifyBeforeDays");
  if (notify && !notify.value) notify.value = "5";
}

window.addEventListener("load", async () => {
  // Guard against double-initialization if scripts are injected twice
  if (window.__kgAppBooted) return;
  window.__kgAppBooted = true;
  // Restore sidebar preference (useful for POS)
  setSidebarCollapsed(sidebarCollapsed());
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
  await loadAll();
});

window.clearAppCache = function () {
  if (!confirm("Clear local cache (tickets + UI prefs) and reload?")) return;
  try {
    localStorage.removeItem("kg_pos_tickets_v1");
    localStorage.removeItem("kg_sidebar_collapsed");
  } catch {}
  location.reload();
};

