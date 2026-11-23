/**
 * Net margin calculations — pure functions + UI helpers.
 */
(function (root) {
  "use strict";

  function daysInMonth(year, monthIndex0) {
    return new Date(year, monthIndex0 + 1, 0).getDate();
  }

  function parseISO(dateStr) {
    const p = String(dateStr || "").slice(0, 10).split("-");
    if (p.length !== 3) return null;
    return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
  }

  function eachDateInclusive(fromISO, toISO) {
    const out = [];
    const a = parseISO(fromISO);
    const b = parseISO(toISO);
    if (!a || !b) return out;
    const cur = new Date(a.y, a.m - 1, a.d);
    const end = new Date(b.y, b.m - 1, b.d);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      out.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  function monthKeyFromISO(iso) {
    return String(iso || "").slice(0, 7);
  }

  /**
   * Allocate fixed monthly costs across days in range.
   * fixedCosts: [{ name, amount, month: "YYYY-MM" | recurring: true }]
   */
  function allocateFixedCosts(fixedCosts, fromISO, toISO) {
    const dates = eachDateInclusive(fromISO, toISO);
    let total = 0;
    const byDay = {};
    dates.forEach((d) => (byDay[d] = 0));
    const warnings = [];

    (fixedCosts || []).forEach((fc) => {
      const amount = Number(fc.amount) || 0;
      if (!(amount > 0)) return;
      dates.forEach((iso) => {
        const mk = monthKeyFromISO(iso);
        if (fc.recurring || !fc.month || String(fc.month).slice(0, 7) === mk) {
          const p = parseISO(iso);
          const dim = daysInMonth(p.y, p.m - 1);
          const daily = amount / dim;
          byDay[iso] += daily;
          total += daily;
        }
      });
    });

    if (!(fixedCosts || []).length) warnings.push("No fixed costs entered for this period");
    return { total, byDay, warnings };
  }

  function saleNetRevenue(s) {
    if (s && s.status === "void") return { gross: 0, discount: 0, gst: 0, net: 0 };
    const gross = Number(s.totalAmount != null ? s.totalAmount : s.amount) || 0;
    const discount = Number(s.discountTotal) || 0;
    const gst = Number(s.taxTotal) || 0;
    // Net revenue excluding GST collected
    const net = Math.max(0, gross - discount - gst);
    return { gross, discount, gst, net };
  }

  function staffCostForRange(opts) {
    const { fixedSalaries, attendance, advances, fromISO, toISO } = opts;
    const dates = eachDateInclusive(fromISO, toISO);
    let cost = 0;
    const byName = {};
    (fixedSalaries || []).forEach((fs) => {
      const monthly = Number(fs.amount) || 0;
      const daily = monthly / 30;
      byName[fs.name] = { daily, earned: 0 };
    });
    dates.forEach((iso) => {
      (attendance || [])
        .filter((a) => String(a.date || "").slice(0, 10) === iso)
        .forEach((a) => {
          const row = byName[a.name];
          if (!row) return;
          const st = String(a.status || "").toLowerCase();
          const mult = st === "present" ? 1 : st === "half-day" ? 0.5 : 0;
          row.earned += row.daily * mult;
        });
    });
    Object.keys(byName).forEach((n) => {
      cost += byName[n].earned;
    });
    // Advances are recovery of salary, not extra expense — do not add to cost.
    // (Noted for callers; advances unused in sum intentionally.)
    void advances;
    return { staffCost: cost, note: "Advances are not counted as extra expense (salary recovery)." };
  }

  function platformCommission(sales, settings) {
    const swPct = Number(settings?.swiggyCommissionPct) || 0;
    const zoPct = Number(settings?.zomatoCommissionPct) || 0;
    const gwPct = Number(settings?.gatewayChargePct) || 0;
    let commission = 0;
    let gateway = 0;
    (sales || []).forEach((s) => {
      if (s.status === "void") return;
      const sw = Number(s.swiggyAmount) || 0;
      const zo = Number(s.zomatoAmount) || 0;
      const online = Number(s.otherOnlineAmount) || 0;
      commission += (sw * swPct) / 100 + (zo * zoPct) / 100;
      gateway += (online * gwPct) / 100;
    });
    return { commission, gateway };
  }

  /**
   * Core formula — unit tested.
   */
  function computeNetMargin(input) {
    const sales = input.sales || [];
    const expenses = input.expenses || [];
    const purchases = input.purchases || [];
    const supplierPayments = input.supplierPayments || [];
    const fromISO = input.fromISO;
    const toISO = input.toISO;
    const inRange = (d) => {
      const x = String(d || "").slice(0, 10);
      return x >= fromISO && x <= toISO;
    };

    let grossSales = 0;
    let discounts = 0;
    let gstCollected = 0;
    let refunds = 0;
    let netRevenue = 0;

    sales.filter((s) => inRange(s.date)).forEach((s) => {
      const r = saleNetRevenue(s);
      grossSales += r.gross;
      discounts += r.discount;
      gstCollected += r.gst;
      if (s.status === "void") refunds += r.gross;
      netRevenue += r.net;
    });

    // COGS: paid purchases + supplier payments in range
    let cogs = 0;
    purchases
      .filter((p) => inRange(p.date) && (p.paidStatus === "paid" || p.status === "paid"))
      .forEach((p) => {
        cogs += Number(p.price) || 0;
      });
    supplierPayments.filter((p) => inRange(p.date)).forEach((p) => {
      cogs += Number(p.amount) || 0;
    });

    let dailyExpenses = 0;
    const expenseByCat = {};
    expenses
      .filter((e) => inRange(e.date) && e.status === "paid")
      .forEach((e) => {
        const amt = Number(e.amount) || 0;
        dailyExpenses += amt;
        const cat = e.category || "Other";
        expenseByCat[cat] = (expenseByCat[cat] || 0) + amt;
      });

    const staff = staffCostForRange({
      fixedSalaries: input.fixedSalaries,
      attendance: input.attendance,
      advances: input.advances,
      fromISO,
      toISO
    });

    const fixed = allocateFixedCosts(input.fixedCosts, fromISO, toISO);
    const plat = platformCommission(
      sales.filter((s) => inRange(s.date)),
      input.settings || {}
    );

    const otherIncome = Number(input.otherIncome) || 0;
    const otherExpense = Number(input.otherExpense) || 0;

    netRevenue += otherIncome;
    const grossProfit = netRevenue - cogs;
    const operatingExpenses =
      dailyExpenses + staff.staffCost + fixed.total + plat.commission + plat.gateway + otherExpense;
    const netProfit = grossProfit - operatingExpenses;
    const netMarginPct = netRevenue > 0 ? (netProfit / netRevenue) * 100 : null;

    // Daily breakdown
    const days = eachDateInclusive(fromISO, toISO);
    const daily = days.map((iso) => {
      let dayRev = 0;
      sales
        .filter((s) => String(s.date).slice(0, 10) === iso)
        .forEach((s) => {
          dayRev += saleNetRevenue(s).net;
        });
      let dayCogs = 0;
      purchases
        .filter((p) => String(p.date).slice(0, 10) === iso && (p.paidStatus === "paid" || p.status === "paid"))
        .forEach((p) => {
          dayCogs += Number(p.price) || 0;
        });
      let dayExp = 0;
      expenses
        .filter((e) => String(e.date).slice(0, 10) === iso && e.status === "paid")
        .forEach((e) => {
          dayExp += Number(e.amount) || 0;
        });
      const dayFixed = fixed.byDay[iso] || 0;
      const dayStaff = staff.staffCost / Math.max(1, days.length);
      const dayProfit = dayRev - dayCogs - dayExp - dayFixed - dayStaff;
      const dayMargin = dayRev > 0 ? (dayProfit / dayRev) * 100 : null;
      return {
        date: iso,
        revenue: dayRev,
        costs: dayCogs + dayExp + dayFixed + dayStaff,
        profit: dayProfit,
        marginPct: dayMargin
      };
    });

    return {
      grossSales,
      discounts,
      gstCollected,
      refunds,
      netRevenue,
      cogs,
      grossProfit,
      dailyExpenses,
      expenseByCat,
      staffCost: staff.staffCost,
      staffNote: staff.note,
      fixedCostAllocated: fixed.total,
      platformCommission: plat.commission,
      gatewayCharges: plat.gateway,
      operatingExpenses,
      netProfit,
      netMarginPct,
      daily,
      warnings: fixed.warnings.concat(
        !(input.fixedSalaries || []).length ? ["No staff salary configured"] : []
      )
    };
  }

  function defaultRangeToday() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const toISO = `${y}-${m}-${d}`;
    const fromISO = `${y}-${m}-01`;
    return { fromISO, toISO, label: "1st → today" };
  }

  function rangePreset(preset) {
    const now = new Date();
    const iso = (dt) => {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };
    const today = iso(now);
    if (preset === "today") return { fromISO: today, toISO: today, label: "Today" };
    if (preset === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const s = iso(y);
      return { fromISO: s, toISO: s, label: "Yesterday" };
    }
    if (preset === "week") {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { fromISO: iso(s), toISO: today, label: "This week" };
    }
    if (preset === "lastMonth") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { fromISO: iso(first), toISO: iso(last), label: "Last month" };
    }
    if (preset === "month") {
      return defaultRangeToday();
    }
    return defaultRangeToday();
  }

  async function loadFixedCosts() {
    try {
      const snap = await firebase.firestore().collection("fixedCosts").get();
      return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    } catch (_) {
      return [];
    }
  }

  async function saveFixedCost(item) {
    const db = firebase.firestore();
    const id = item.id || db.collection("fixedCosts").doc().id;
    await db
      .collection("fixedCosts")
      .doc(id)
      .set(
        {
          name: item.name,
          amount: Number(item.amount) || 0,
          month: item.month || "",
          recurring: !!item.recurring,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    return id;
  }

  function renderDashboardBox(result, el) {
    if (!el) return;
    const money = root.KG && root.KG.money;
    const fmt = (n) => (money ? money.formatINR(n) : "₹" + (Number(n) || 0).toFixed(0));
    const pct =
      result.netMarginPct == null || !Number.isFinite(result.netMarginPct)
        ? "—"
        : result.netMarginPct.toFixed(1) + "%";
    const tone = result.netProfit >= 0 ? "positive" : "negative";
    el.className = "card dpro-panel kg-margin-box " + tone;
    el.innerHTML = `
      <div class="kg-margin-label">Net Margin</div>
      <div class="kg-margin-pct">${pct}</div>
      <div class="kg-margin-profit">${fmt(result.netProfit)}</div>
      <canvas id="kgMarginSpark" width="160" height="36" aria-hidden="true"></canvas>
      <button type="button" class="kg-margin-open" id="kgMarginOpenBtn">Breakdown</button>`;
    drawSpark(
      document.getElementById("kgMarginSpark"),
      (result.daily || []).map((d) => d.profit)
    );
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function drawSpark(canvas, values) {
    if (!canvas || !values?.length) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const span = max - min || 1;
    ctx.strokeStyle = values[values.length - 1] >= 0 ? "#15803d" : "#b91c1c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * (w - 4) + 2;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function toCSV(result) {
    const rows = [["date", "revenue", "costs", "profit", "margin_pct"]];
    (result.daily || []).forEach((d) => {
      rows.push([
        d.date,
        d.revenue,
        d.costs,
        d.profit,
        d.marginPct == null ? "" : d.marginPct.toFixed(2)
      ]);
    });
    return rows.map((r) => r.join(",")).join("\n");
  }

  const api = {
    daysInMonth,
    eachDateInclusive,
    allocateFixedCosts,
    saleNetRevenue,
    staffCostForRange,
    platformCommission,
    computeNetMargin,
    defaultRangeToday,
    rangePreset,
    loadFixedCosts,
    saveFixedCost,
    renderDashboardBox,
    toCSV
  };

  root.KG = root.KG || {};
  root.KG.finance = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
