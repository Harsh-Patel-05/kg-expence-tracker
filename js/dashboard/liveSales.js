/**
 * Live dashboard: sales docs are source of truth (KPIs + hourly + donut).
 * dailySalesSummary is optional/fast path only — never trusted over sales.
 */
(function (root) {
  "use strict";

  let unsubSummary = null;
  let unsubSales = null;
  let chartHourly = null;
  let chartDonut = null;
  let selectedDate = null;

  function $(id) {
    return document.getElementById(id);
  }

  function todayISO() {
    if (root.KG?.salesBridge?.businessDateISO) {
      const cut = root.KG.posState?.getState()?.settings?.businessDayCutOff ?? 4;
      return root.KG.salesBridge.businessDateISO(new Date(), cut);
    }
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function fmt(n) {
    return root.KG?.money?.formatINR(n) || "₹" + (Number(n) || 0).toFixed(0);
  }

  function isActiveSale(s) {
    const st = String(s?.status || "")
      .toLowerCase()
      .trim();
    if (st === "void" || st === "cancelled" || st === "refunded") return false;
    // Advances / non-revenue money movements — exclude from completed-sale KPIs
    if (s?.countsAsRevenue === false) return false;
    if (String(s?.revenueKind || "") === "customer_advance") return false;
    if (String(s?.source || "") === "scheduled_advance") return false;
    return true;
  }

  /** Shop UPI/card = otherOnline (or legacy onlineAmount); platforms stay separate. */
  function saleParts(s) {
    const cash = Number(s.cashAmount) || 0;
    const swiggy = Number(s.swiggyAmount) || 0;
    const zomato = Number(s.zomatoAmount) || 0;
    const other = Number(s.otherOnlineAmount) || 0;
    const legacy = Number(s.onlineAmount) || 0;
    const upi = swiggy > 0 || zomato > 0 || other > 0 ? other : legacy;
    const onlineTotal = upi + swiggy + zomato;
    const total = Number(s.totalAmount) || cash + onlineTotal;
    return { cash, swiggy, zomato, upi, onlineTotal, total };
  }

  function summarizeSales(sales) {
    let totalSales = 0;
    let cashSales = 0;
    let onlineSales = 0;
    let swiggySales = 0;
    let zomatoSales = 0;
    let billCount = 0;
    let cashBillCount = 0;
    let onlineBillCount = 0;
    (sales || []).forEach((s) => {
      if (!isActiveSale(s)) return;
      const p = saleParts(s);
      totalSales += p.total;
      cashSales += p.cash;
      onlineSales += p.upi;
      swiggySales += p.swiggy;
      zomatoSales += p.zomato;
      billCount += 1;
      if (p.cash > 0) cashBillCount += 1;
      if (p.upi > 0) onlineBillCount += 1;
    });
    return {
      totalSales,
      cashSales,
      onlineSales,
      swiggySales,
      zomatoSales,
      billCount,
      cashBillCount,
      onlineBillCount
    };
  }

  function detach() {
    if (unsubSummary) {
      unsubSummary();
      unsubSummary = null;
    }
    if (unsubSales) {
      unsubSales();
      unsubSales = null;
    }
  }

  function setKPI(data, meta) {
    const d = data || {};
    const set = (id, v) => {
      const el = $(id);
      if (el) el.textContent = v;
    };
    set("kgLiveTotalSales", fmt(d.totalSales || 0));
    set("kgLiveBillCount", String(d.billCount || 0));
    set("kgLiveCashSales", fmt(d.cashSales || 0));
    set("kgLiveCashCount", String(d.cashBillCount || 0) + " bills");
    set("kgLiveOnlineSales", fmt(d.onlineSales || 0));
    set("kgLiveOnlineCount", String(d.onlineBillCount || 0) + " bills");
    set("kgLiveSwiggy", fmt(d.swiggySales || 0));
    set("kgLiveZomato", fmt(d.zomatoSales || 0));
    const aov = d.billCount ? (d.totalSales || 0) / d.billCount : 0;
    set("kgLiveAov", fmt(aov));
    const badge = $("kgLiveBadge");
    if (badge) {
      badge.classList.toggle("offline", !!(meta && meta.offline));
      badge.textContent = meta?.offline ? "OFFLINE" : "LIVE";
    }
    const updated = $("kgLiveUpdated");
    if (updated) updated.textContent = "Updated " + new Date().toLocaleTimeString("en-IN");
    const empty = $("kgLiveEmpty");
    if (empty) empty.style.display = d.billCount ? "none" : "block";
  }

  function businessHours(cutOffHour) {
    const cut = Number.isFinite(cutOffHour) ? cutOffHour : 4;
    const hours = [];
    for (let i = 0; i < 24; i++) hours.push((cut + i) % 24);
    return hours;
  }

  function hourBuckets(sales, businessDate) {
    const cut = root.KG?.posState?.getState()?.settings?.businessDayCutOff ?? 4;
    const hours = businessHours(cut);
    const cash = {};
    const online = {};
    const count = {};
    hours.forEach((h) => {
      cash[h] = 0;
      online[h] = 0;
      count[h] = 0;
    });

    (sales || []).forEach((s) => {
      if (!isActiveSale(s)) return;
      if (String(s.date || "").slice(0, 10) !== businessDate) return;
      let hour = 12;
      try {
        const ts = s.createdAt?.toDate ? s.createdAt.toDate() : s.at ? new Date(s.at) : null;
        if (ts && !Number.isNaN(ts.getTime())) hour = ts.getHours();
      } catch (_) {}
      if (cash[hour] == null) hour = hours[0];
      const p = saleParts(s);
      cash[hour] += p.cash;
      online[hour] += p.onlineTotal;
      count[hour] += 1;
    });

    return {
      labels: hours.map((h) => `${String(h).padStart(2, "0")}:00`),
      cash: hours.map((h) => cash[h]),
      online: hours.map((h) => online[h]),
      count: hours.map((h) => count[h]),
      hours
    };
  }

  function sameWeekdayLastWeekISO(iso) {
    const p = String(iso || "").split("-").map(Number);
    if (p.length !== 3) return "";
    const d = new Date(p[0], p[1] - 1, p[2]);
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function renderCharts(buckets, summary, compareBuckets) {
    if (typeof Chart === "undefined") return;
    const hourlyCanvas = $("kgLiveHourlyChart");
    const donutCanvas = $("kgLiveDonutChart");
    // Hourly chart merged into dashboard Sales pulse — skip when hidden
    if (hourlyCanvas && !hourlyCanvas.hidden) {
      if (chartHourly) chartHourly.destroy();
      const datasets = [
        {
          label: "Cash",
          data: buckets.cash,
          backgroundColor: "rgba(34,197,94,0.7)",
          stack: "s",
          type: "bar"
        },
        {
          label: "Online (UPI + platforms)",
          data: buckets.online,
          backgroundColor: "rgba(59,130,246,0.7)",
          stack: "s",
          type: "bar"
        }
      ];
      if (compareBuckets) {
        const lastWeekTotal = compareBuckets.hours.map(
          (h, i) => (compareBuckets.cash[i] || 0) + (compareBuckets.online[i] || 0)
        );
        datasets.push({
          label: "Same weekday last week",
          data: lastWeekTotal,
          type: "line",
          borderColor: "rgba(148,163,184,0.95)",
          borderDash: [6, 4],
          pointRadius: 0,
          tension: 0.25,
          yAxisID: "y",
          order: 0
        });
      }
      chartHourly = new Chart(hourlyCanvas, {
        type: "bar",
        data: {
          labels: buckets.labels,
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                afterBody(items) {
                  const i = items[0]?.dataIndex;
                  if (i == null) return "";
                  const c = buckets.cash[i] || 0;
                  const o = buckets.online[i] || 0;
                  return [`Bills: ${buckets.count[i]}`, `Hour total: ${fmt(c + o)}`];
                }
              }
            }
          },
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
        }
      });
    }
    if (donutCanvas) {
      if (chartDonut) chartDonut.destroy();
      const cash = Number(summary?.cashSales) || 0;
      // Donut Online = shop UPI + Swiggy + Zomato for the day
      const online =
        Number(summary?.onlineSales || 0) +
        Number(summary?.swiggySales || 0) +
        Number(summary?.zomatoSales || 0);
      chartDonut = new Chart(donutCanvas, {
        type: "doughnut",
        data: {
          labels: ["Cash", "Online"],
          datasets: [
            {
              data: [cash, online],
              backgroundColor: ["rgba(34,197,94,0.8)", "rgba(59,130,246,0.8)"]
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label(ctx) {
                  const v = Number(ctx.parsed) || 0;
                  return `${ctx.label}: ${fmt(v)}`;
                }
              }
            }
          }
        }
      });
    }
  }

  function attach(dateISO) {
    detach();
    selectedDate = dateISO || todayISO();
    const dateInput = $("kgLiveDate");
    if (dateInput && !dateInput.value) dateInput.value = selectedDate;

    if (typeof firebase === "undefined" || !firebase.firestore) {
      setKPI({}, { offline: true });
      return;
    }

    const db = firebase.firestore();
    // Keep listening to summary only as a loading hint; sales overwrite KPIs.
    unsubSummary = db
      .collection("dailySalesSummary")
      .doc(selectedDate)
      .onSnapshot(
        () => {},
        (err) => console.warn(err)
      );

    const lastWeek = sameWeekdayLastWeekISO(selectedDate);
    let compareBucketsCache = null;
    let latestBuckets = null;
    let latestSummary = null;

    function paint() {
      if (latestSummary) setKPI(latestSummary, { offline: !navigator.onLine });
      if (latestBuckets) renderCharts(latestBuckets, latestSummary, compareBucketsCache);
    }

    if (lastWeek) {
      db.collection("sales")
        .where("date", "==", lastWeek)
        .get()
        .then((snap) => {
          const sales = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
          compareBucketsCache = hourBuckets(sales, lastWeek);
          paint();
        })
        .catch(() => {});
    }

    unsubSales = db
      .collection("sales")
      .where("date", "==", selectedDate)
      .onSnapshot(
        (snap) => {
          const sales = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
          latestBuckets = hourBuckets(sales, selectedDate);
          latestSummary = summarizeSales(sales);
          paint();
        },
        (err) => {
          console.warn(err);
          setKPI({}, { offline: true });
        }
      );
  }

  async function refreshNetMargin() {
    const box = $("kgNetMarginBox");
    if (!box || !root.KG?.finance) return;
    const range = root.KG.finance.defaultRangeToday();
    const state = root.state || {};
    let fixedCosts = [];
    try {
      fixedCosts = await root.KG.finance.loadFixedCosts();
    } catch (_) {}
    const settings = root.KG.posState?.getState()?.settings || {};
    const result = root.KG.finance.computeNetMargin({
      sales: state.sales || [],
      expenses: state.expenses || [],
      purchases: state.purchases || [],
      supplierPayments: state.supplierPayments || [],
      fixedSalaries: state.fixedSalaries || [],
      attendance: state.attendance || [],
      advances: state.advances || [],
      fixedCosts,
      settings,
      fromISO: range.fromISO,
      toISO: range.toISO
    });
    result._label = range.label;
    root.KG.finance.renderDashboardBox(result, box);
    $("kgMarginOpenBtn")?.addEventListener("click", () => openBreakdown(result));
  }

  function openBreakdown(result) {
    const ov = $("kgMarginOverlay");
    const body = $("kgMarginBody");
    if (!ov || !body) return;
    const money = root.KG.money;
    const fmtMoney = (n) => money.formatINR(n);
    body.innerHTML = `
      <div class="kg-waterfall">
        <div>Net Revenue <b>${fmtMoney(result.netRevenue)}</b></div>
        <div>− COGS <b>${fmtMoney(result.cogs)}</b></div>
        <div>− Daily expenses <b>${fmtMoney(result.dailyExpenses)}</b></div>
        <div>− Staff <b>${fmtMoney(result.staffCost)}</b></div>
        <div>− Fixed costs <b>${fmtMoney(result.fixedCostAllocated)}</b></div>
        <div>− Commission <b>${fmtMoney(result.platformCommission)}</b></div>
        <div>− Gateway <b>${fmtMoney(result.gatewayCharges)}</b></div>
        <div class="kg-waterfall-net">Net Profit <b>${fmtMoney(result.netProfit)}</b> (${
      result.netMarginPct == null ? "—" : result.netMarginPct.toFixed(1) + "%"
    })</div>
      </div>
      <table class="kg-margin-table"><thead><tr><th>Date</th><th>Revenue</th><th>Costs</th><th>Profit</th><th>Margin</th></tr></thead>
      <tbody>${(result.daily || [])
        .map(
          (d) =>
            `<tr><td>${d.date}</td><td>${fmtMoney(d.revenue)}</td><td>${fmtMoney(d.costs)}</td><td>${fmtMoney(
              d.profit
            )}</td><td>${d.marginPct == null ? "—" : d.marginPct.toFixed(1) + "%"}</td></tr>`
        )
        .join("")}</tbody></table>
      <button type="button" class="btn btn-secondary" id="kgMarginCsv">Export CSV</button>
      <button type="button" class="btn btn-secondary" id="kgFixedCostsBtn">Fixed Costs</button>`;
    ov.style.display = "flex";
    $("kgMarginCsv")?.addEventListener("click", () => {
      const csv = root.KG.finance.toCSV(result);
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "net-margin.csv";
      a.click();
    });
    $("kgFixedCostsBtn")?.addEventListener("click", openFixedCosts);
  }

  function openFixedCosts() {
    const ov = $("kgFixedCostsOverlay");
    if (ov) ov.style.display = "flex";
    root.KG.finance.loadFixedCosts().then((list) => {
      const el = $("kgFixedCostsList");
      if (!el) return;
      el.innerHTML =
        list
          .map(
            (f) =>
              `<div class="list-item"><b>${f.name}</b> · ${root.KG.money.formatINR(f.amount)} · ${
                f.recurring ? "recurring" : f.month || ""
              }</div>`
          )
          .join("") || "<div class='muted'>No fixed costs yet</div>";
    });
  }

  function onDashboardEnter() {
    attach(selectedDate || todayISO());
    refreshNetMargin();
  }

  function onDashboardLeave() {
    detach();
  }

  function bindOnce() {
    if (document.__kgLiveBound) return;
    document.__kgLiveBound = true;
    $("kgLiveDate")?.addEventListener("change", (e) => {
      attach(e.target.value);
    });
    $("kgMarginClose")?.addEventListener("click", () => {
      const ov = $("kgMarginOverlay");
      if (ov) ov.style.display = "none";
    });
    $("kgFixedCostsClose")?.addEventListener("click", () => {
      const ov = $("kgFixedCostsOverlay");
      if (ov) ov.style.display = "none";
    });
    $("kgFixedCostSave")?.addEventListener("click", async () => {
      const name = $("kgFixedCostName")?.value?.trim();
      const amount = Number($("kgFixedCostAmount")?.value) || 0;
      const recurring = !!$("kgFixedCostRecurring")?.checked;
      if (!name || !(amount > 0)) return root.toast?.("Enter name and amount", "error");
      await root.KG.finance.saveFixedCost({ name, amount, recurring, month: todayISO().slice(0, 7) });
      root.toast?.("Fixed cost saved", "success");
      openFixedCosts();
      refreshNetMargin();
    });
    $("kgRebuildSummaries")?.addEventListener("click", async () => {
      if (!confirm("Rebuild daily sales summaries from all sales? This is safe to re-run.")) return;
      try {
        const r = await root.KG.salesBridge.rebuildDailySummaries();
        root.toast?.(`Rebuilt ${r.days} day(s)`, "success");
        attach(selectedDate || todayISO());
      } catch (e) {
        root.toast?.(e.message || "Rebuild failed", "error");
      }
    });
  }

  const api = {
    attach,
    detach,
    onDashboardEnter,
    onDashboardLeave,
    refreshNetMargin,
    bindOnce,
    todayISO,
    summarizeSales,
    saleParts
  };

  root.KG = root.KG || {};
  root.KG.liveSales = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
