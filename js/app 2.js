/* global Chart */
(function () {

  const state = {
    suppliers: [],
    staff: [],
    sales: [],
    purchases: [],
    expenses: [],
    attendance: [],
    salaries: [],
    advances: [],
    inventory: []
  };

  // In module mode, prefer reading from `window.api` explicitly.
  let api = window.api;

  let salesExpenseChartRef = null;
  let methodChartRef = null;
  let categoryExpenseChartRef = null;
  let loadingCount = 0;

  function setLoading(on) {
    loadingCount += on ? 1 : -1;
    const el = document.getElementById("appLoading");
    if (el) el.classList.toggle("active", loadingCount > 0);
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

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function money(v) {
    return `Rs ${num(v).toLocaleString("en-IN")}`;
  }
  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function monthISO() {
    return new Date().toISOString().slice(0, 7);
  }
  function byDateDesc(a, b) {
    return new Date(b.date || b.month) - new Date(a.date || a.month);
  }

  function supplierNames() {
    return state.suppliers.map((s) => (typeof s === "string" ? s : s.name));
  }
  function staffNames() {
    return state.staff.map((s) => (typeof s === "string" ? s : s.name));
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

  async function withErr(fn, errMsg) {
    setLoading(true);
    document.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      await fn();
    } catch (e) {
      console.error(e);
      toast("Error occurred", "error");
    } finally {
      setLoading(false);
      document.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }

  async function loadAll() {
    setLoading(true);
    try {
      api = window.api;
      if (!api) throw new Error("Firestore API not initialized");

      const [
        sales,
        purchases,
        expenses,
        inventory,
        attendance,
        salaries,
        advances,
        supRes,
        stRes
      ] = await Promise.all([
        api.sales.list(),
        api.purchases.list(),
        api.expenses.list(),
        api.inventory.list(),
        api.attendance.list(),
        api.salaries.list(),
        api.advances.list(),
        api.suppliers.list(),
        api.staff.list()
      ]);
      state.sales = Array.isArray(sales) ? sales : [];
      state.purchases = Array.isArray(purchases) ? purchases : [];
      state.expenses = Array.isArray(expenses) ? expenses : [];
      state.inventory = Array.isArray(inventory) ? inventory : [];
      state.attendance = Array.isArray(attendance) ? attendance : [];
      state.salaries = Array.isArray(salaries) ? salaries : [];
      state.advances = Array.isArray(advances) ? advances : [];
      state.suppliers = Array.isArray(supRes) ? supRes : [];
      state.staff = Array.isArray(stRes) ? stRes : [];
      renderAll();
      await window.renderAnalytics();
    } catch (e) {
      console.error(e);
      toast("Error occurred", "error");
    } finally {
      setLoading(false);
    }
  }

  function salaryAdvanceFor(name, month) {
    return state.advances.filter((x) => x.name === name && x.month === month).reduce((s, x) => s + num(x.amount), 0);
  }
  function payableForSalary(sal) {
    return Math.max(0, num(sal.amount) - salaryAdvanceFor(sal.name, sal.month));
  }

  window.addSupplier = function () {
    const name = document.getElementById("newSupplierName").value.trim();
    if (!name) return;
    withErr(async () => {
      await api.suppliers.create({ name });
      document.getElementById("newSupplierName").value = "";
      await loadAll();
      toast("Saved successfully", "ok");
    }, "Failed to add supplier");
  };

  window.removeSupplier = function (id) {
    withErr(async () => {
      await api.suppliers.remove(id);
      await loadAll();
      toast("Deleted", "ok");
    }, "Failed to remove supplier");
  };

  window.addStaff = function () {
    const name = document.getElementById("newStaffName").value.trim();
    if (!name) return;
    withErr(async () => {
      await api.staff.create({ name });
      document.getElementById("newStaffName").value = "";
      await loadAll();
      toast("Saved successfully", "ok");
    }, "Failed to add staff");
  };

  window.removeStaff = function (id) {
    withErr(async () => {
      await api.staff.remove(id);
      await loadAll();
      toast("Deleted", "ok");
    }, "Failed to remove staff");
  };

  window.addSale = function () {
    const date = document.getElementById("saleDate").value || todayISO();
    const amount = num(document.getElementById("saleAmount").value);
    const method = document.getElementById("saleMethod").value;
    if (!(amount > 0)) return toast("Enter valid sale amount", "error");
    withErr(async () => {
      await api.sales.create({ date, amount, method });
      document.getElementById("saleAmount").value = "";
      await loadAll();
      toast("Saved successfully", "ok");
    }, "Failed to add sale");
  };

  window.addPurchase = function () {
    const date = document.getElementById("purchaseDate").value || todayISO();
    const item = document.getElementById("purchaseItem").value.trim();
    const seller = document.getElementById("purchaseSellerSelect").value;
    const qty = num(document.getElementById("purchaseQty").value);
    const price = num(document.getElementById("purchasePrice").value);
    const paidStatus = document.getElementById("purchasePaidStatus").value;
    if (!item || !seller || !(price > 0)) return toast("Select supplier, item and amount", "error");
    withErr(async () => {
      await api.purchases.create({ date, item, seller, qty, price, paidStatus });
      ["purchaseItem", "purchaseQty", "purchasePrice"].forEach((x) => (document.getElementById(x).value = ""));
      await loadAll();
      toast("Saved successfully", "ok");
    }, "Failed to add purchase");
  };

  window.addBill = function () {
    const date = document.getElementById("billDate").value || todayISO();
    const category = document.getElementById("billType").value;
    const amount = num(document.getElementById("billAmount").value);
    const status = document.getElementById("billStatus").value;
    const note = document.getElementById("billNote").value.trim();
    if (!(amount > 0)) return toast("Enter valid amount", "error");
    withErr(async () => {
      await api.expenses.create({ date, category, amount, status, note });
      ["billAmount", "billNote"].forEach((x) => (document.getElementById(x).value = ""));
      await loadAll();
      toast("Saved successfully", "ok");
    }, "Failed to add expense");
  };

  window.addAttendance = function () {
    const date = document.getElementById("attDate").value || todayISO();
    const name = document.getElementById("attName").value;
    const status = document.getElementById("attStatus").value;
    if (!name) return toast("Select staff", "error");
    withErr(async () => {
      await api.attendance.create({ date, name, status });
      await loadAll();
      toast("Saved successfully", "ok");
    }, "Failed to add attendance");
  };

  window.addSalary = function () {
    const month = document.getElementById("salMonth").value;
    const name = document.getElementById("salName").value;
    const amount = num(document.getElementById("salAmount").value);
    const status = document.getElementById("salStatus").value;
    if (!month || !name || !(amount > 0)) return toast("Fill month, staff and salary", "error");
    withErr(async () => {
      await api.salaries.create({ month, name, amount, status });
      document.getElementById("salAmount").value = "";
      await loadAll();
      toast("Saved successfully", "ok");
    }, "Failed to save salary");
  };

  window.addAdvance = function () {
    const date = document.getElementById("advDate").value || todayISO();
    const month = document.getElementById("advMonth").value;
    const name = document.getElementById("advStaff").value;
    const amount = num(document.getElementById("advAmount").value);
    if (!month || !name || !(amount > 0)) return toast("Fill month, staff and advance", "error");
    withErr(async () => {
      await api.advances.create({ date, month, name, amount });
      document.getElementById("advAmount").value = "";
      await loadAll();
      toast("Saved successfully", "ok");
    }, "Failed to add advance");
  };

  window.addInventory = function () {
    const item = document.getElementById("invItem").value.trim();
    const unit = document.getElementById("invUnit").value.trim() || "unit";
    const qty = num(document.getElementById("invQty").value);
    const threshold = num(document.getElementById("invThreshold").value);
    if (!item) return toast("Enter item name", "error");
    withErr(async () => {
      await api.inventory.create({ item, unit, qty, threshold });
      ["invItem", "invUnit", "invQty", "invThreshold"].forEach((x) => (document.getElementById(x).value = ""));
      await loadAll();
      toast("Saved successfully", "ok");
    }, "Failed to save inventory");
  };

  window.removeItem = function (kind, id) {
    const map = {
      sales: () => api.sales.remove(id),
      purchases: () => api.purchases.remove(id),
      expenses: () => api.expenses.remove(id),
      attendance: () => api.attendance.remove(id),
      salaries: () => api.salaries.remove(id),
      inventory: () => api.inventory.remove(id)
    };
    if (!map[kind]) return;
    withErr(async () => {
      await map[kind]();
      await loadAll();
      toast("Deleted", "ok");
    }, "Failed to delete");
  };

  window.togglePurchaseStatus = function (id) {
    const p = state.purchases.find((x) => x.id === id);
    if (!p) return;
    const next = p.paidStatus === "paid" ? "unpaid" : "paid";
    withErr(async () => {
      await api.purchases.update(id, { paidStatus: next });
      await loadAll();
    }, "Failed to update purchase");
  };

  window.toggleExpenseStatus = function (id) {
    const p = state.expenses.find((x) => x.id === id);
    if (!p) return;
    const next = p.status === "paid" ? "unpaid" : "paid";
    withErr(async () => {
      await api.expenses.update(id, { status: next });
      await loadAll();
    }, "Failed to update expense");
  };

  window.toggleSalaryStatus = function (id) {
    const p = state.salaries.find((x) => x.id === id);
    if (!p) return;
    const next = p.status === "paid" ? "unpaid" : "paid";
    withErr(async () => {
      await api.salaries.update(id, { status: next });
      await loadAll();
    }, "Failed to update salary");
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
    }, "Export failed");
  };

  window.restoreData = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        toast("Error occurred", "error");
        return;
      }
      withErr(async () => {
        await api.backup.import(parsed);
        await loadAll();
        toast("Backup imported", "ok");
      }, "Import failed");
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
      staff: []
    };
    withErr(async () => {
      await api.backup.import({ data: empty });
      await loadAll();
      toast("All data cleared", "ok");
    }, "Reset failed");
  };

  function renderKpis() {
    const totalSales = state.sales.reduce((s, x) => s + num(x.amount), 0);
    const paidPurchases = state.purchases.filter((x) => x.paidStatus === "paid").reduce((s, x) => s + num(x.price), 0);
    const paidBills = state.expenses.filter((x) => x.status === "paid").reduce((s, x) => s + num(x.amount), 0);
    const paidSalariesPayable = state.salaries.filter((x) => x.status === "paid").reduce((s, x) => s + payableForSalary(x), 0);
    const totalExpenses = paidPurchases + paidBills + paidSalariesPayable;
    const pending =
      state.purchases.filter((x) => x.paidStatus === "unpaid").reduce((s, x) => s + num(x.price), 0) +
      state.expenses.filter((x) => x.status === "unpaid").reduce((s, x) => s + num(x.amount), 0) +
      state.salaries.filter((x) => x.status === "unpaid").reduce((s, x) => s + payableForSalary(x), 0);
    const profit = totalSales - totalExpenses;
    const lowStock = state.inventory.filter((x) => num(x.qty) < num(x.threshold)).length;
    document.getElementById("kpiSales").textContent = money(totalSales);
    document.getElementById("kpiExpenses").textContent = money(totalExpenses);
    document.getElementById("kpiPending").textContent = money(pending);
    const p = document.getElementById("kpiProfit");
    p.textContent = money(profit);
    p.className = profit >= 0 ? "ok" : "bad";
    document.getElementById("kpiLowStock").textContent = String(lowStock);
  }

  function renderSuppliers() {
    const el = document.getElementById("supplierList");
    const items = state.suppliers;
    el.innerHTML =
      items
        .map((s) => {
          const id = typeof s === "string" ? s : s.id;
          const name = typeof s === "string" ? s : s.name;
          return `
        <div class="row">
          <div>${name}</div>
          <button class="warn" onclick="removeSupplier('${id}')">Remove</button>
        </div>`;
        })
        .join("") || `<div class="muted">No suppliers.</div>`;
  }

  function renderStaffMaster() {
    const el = document.getElementById("staffList");
    const items = state.staff;
    el.innerHTML =
      items
        .map((s) => {
          const id = typeof s === "string" ? s : s.id;
          const name = typeof s === "string" ? s : s.name;
          return `
        <div class="row">
          <div>${name}</div>
          <button class="warn" onclick="removeStaff('${id}')">Remove</button>
        </div>`;
        })
        .join("") || `<div class="muted">No staff.</div>`;
  }

  function renderSales() {
    const el = document.getElementById("salesList");
    el.innerHTML =
      [...state.sales]
        .sort(byDateDesc)
        .slice(0, 20)
        .map(
          (x) => `
        <div class="row">
          <div>${x.date} - ${money(x.amount)} <span class="pill">${x.method}</span></div>
          <button class="warn" onclick="removeItem('sales','${x.id}')">Delete</button>
        </div>`
        )
        .join("") || `<div class="muted">No sales.</div>`;
  }

  function renderPurchases() {
    const el = document.getElementById("purchaseList");
    el.innerHTML =
      [...state.purchases]
        .sort(byDateDesc)
        .slice(0, 20)
        .map(
          (x) => `
        <div class="row">
          <div>${x.date} - ${x.item} (${x.qty || 0}) from ${x.seller} - ${money(x.price)} <span class="pill">${x.paidStatus}</span></div>
          <button type="button" class="secondary" onclick="togglePurchaseStatus('${x.id}')">Toggle</button>
          <button class="warn" onclick="removeItem('purchases','${x.id}')">Delete</button>
        </div>`
        )
        .join("") || `<div class="muted">No purchases.</div>`;
  }

  function renderBills() {
    const el = document.getElementById("billsList");
    el.innerHTML =
      [...state.expenses]
        .sort(byDateDesc)
        .slice(0, 20)
        .map(
          (x) => `
        <div class="row">
          <div>${x.date} - ${x.category}: ${money(x.amount)} <span class="pill">${x.status}</span>${x.note ? ` (${x.note})` : ""}</div>
          <button type="button" class="secondary" onclick="toggleExpenseStatus('${x.id}')">Toggle</button>
          <button class="warn" onclick="removeItem('expenses','${x.id}')">Delete</button>
        </div>`
        )
        .join("") || `<div class="muted">No expenses.</div>`;
  }

  function renderAttendance() {
    const el = document.getElementById("attendanceList");
    el.innerHTML =
      [...state.attendance]
        .sort(byDateDesc)
        .slice(0, 25)
        .map(
          (x) => `
        <div class="row">
          <div>${x.date} - ${x.name} <span class="pill">${x.status}</span></div>
          <button class="warn" onclick="removeItem('attendance','${x.id}')">Delete</button>
        </div>`
        )
        .join("") || `<div class="muted">No attendance.</div>`;
  }

  function renderSalaries() {
    const el = document.getElementById("salaryList");
    el.innerHTML =
      [...state.salaries]
        .sort(byDateDesc)
        .slice(0, 20)
        .map((x) => {
          const adv = salaryAdvanceFor(x.name, x.month);
          const payable = Math.max(0, num(x.amount) - adv);
          return `
          <div class="row">
            <div>${x.month} - ${x.name}: Salary ${money(x.amount)}, Advance ${money(adv)}, Payable <strong>${money(payable)}</strong> <span class="pill">${x.status}</span></div>
            <button type="button" class="secondary" onclick="toggleSalaryStatus('${x.id}')">Toggle</button>
            <button class="warn" onclick="removeItem('salaries','${x.id}')">Delete</button>
          </div>`;
        })
        .join("") || `<div class="muted">No salary records.</div>`;
  }

  function renderInventory() {
    const el = document.getElementById("inventoryList");
    el.innerHTML = [...state.inventory]
      .sort((a, b) => a.item.localeCompare(b.item))
      .map((x) => {
        const low = num(x.qty) < num(x.threshold);
        return `
          <div class="row">
            <div>${x.item}: ${x.qty} ${x.unit} (alert ${x.threshold}) ${low ? '<span class="pill bad">LOW</span>' : ""}</div>
            <button class="warn" onclick="removeItem('inventory','${x.id}')">Delete</button>
          </div>`;
      })
      .join("") || `<div class="muted">No inventory.</div>`;
  }

  function renderStaffPayableTable() {
    const month = document.getElementById("salMonth").value || monthISO();
    const table = document.getElementById("staffPayableTable");
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

  window.renderAnalytics = async function () {
    const v = document.getElementById("analyticsView").value;
    setLoading(true);
    try {
      const now = new Date();

      const isoDayKey = (d) => d.toISOString().slice(0, 10);
      const parseISODateKey = (s) => new Date(`${s}T00:00:00`);
      const monthKey = (s) => (s && s.length >= 7 ? s.slice(0, 7) : "");

      // Monday-based ISO week start.
      const weekStart = (d) => {
        const x = new Date(d);
        const day = (x.getDay() + 6) % 7; // Mon=0 ... Sun=6
        x.setDate(x.getDate() - day);
        x.setHours(0, 0, 0, 0);
        return x;
      };

      const dayBuckets = [];
      const weekBuckets = [];
      const monthBuckets = [];

      if (v === "day") {
        for (let i = 13; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          dayBuckets.push({
            key: isoDayKey(d),
            label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
          });
        }
      } else if (v === "week") {
        const currentWeekStart = weekStart(now);
        for (let i = 7; i >= 0; i--) {
          const start = new Date(currentWeekStart);
          start.setDate(start.getDate() - i * 7);
          weekBuckets.push({
            key: isoDayKey(start),
            label: start.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
          });
        }
      } else {
        // monthly (6 months)
        const cur = new Date(now);
        cur.setDate(1);
        for (let i = 5; i >= 0; i--) {
          const d = new Date(cur);
          d.setMonth(d.getMonth() - i);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          monthBuckets.push({
            key,
            label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
          });
        }
      }

      const buckets = v === "day" ? dayBuckets : v === "week" ? weekBuckets : monthBuckets;
      const idx = new Map(buckets.map((b, i) => [b.key, i]));

      const salesSeries = new Array(buckets.length).fill(0);
      const expensesSeries = new Array(buckets.length).fill(0);

      const addToBucket = (key, amount, series) => {
        const i = idx.get(key);
        if (i === undefined) return;
        series[i] += num(amount);
      };

      // Sales -> buckets
      (state.sales || []).forEach((s) => {
        if (!s.date) return;
        if (v === "day") return addToBucket(s.date, s.amount, salesSeries);
        if (v === "week") {
          const wk = weekStart(parseISODateKey(s.date));
          return addToBucket(isoDayKey(wk), s.amount, salesSeries);
        }
        return addToBucket(monthKey(s.date), s.amount, salesSeries);
      });

      // Purchases + Bills -> expenses buckets (paid only)
      (state.purchases || [])
        .filter((p) => p.paidStatus === "paid")
        .forEach((p) => {
          if (!p.date) return;
          if (v === "day") return addToBucket(p.date, p.price, expensesSeries);
          if (v === "week") {
            const wk = weekStart(parseISODateKey(p.date));
            return addToBucket(isoDayKey(wk), p.price, expensesSeries);
          }
          return addToBucket(monthKey(p.date), p.price, expensesSeries);
        });

      (state.expenses || [])
        .filter((e) => e.status === "paid")
        .forEach((e) => {
          if (!e.date) return;
          if (v === "day") return addToBucket(e.date, e.amount, expensesSeries);
          if (v === "week") {
            const wk = weekStart(parseISODateKey(e.date));
            return addToBucket(isoDayKey(wk), e.amount, expensesSeries);
          }
          return addToBucket(monthKey(e.date), e.amount, expensesSeries);
        });

      if (salesExpenseChartRef) salesExpenseChartRef.destroy();
      if (methodChartRef) methodChartRef.destroy();
      if (categoryExpenseChartRef) categoryExpenseChartRef.destroy();

      salesExpenseChartRef = new Chart(document.getElementById("salesExpenseChart"), {
        type: "line",
        data: {
          labels: buckets.map((b) => b.label),
          datasets: [
            {
              label: "Sales",
              data: salesSeries,
              borderColor: "#22c55e",
              backgroundColor: "rgba(34,197,94,0.18)",
              fill: true,
              tension: 0.33
            },
            {
              label: "Expenses",
              data: expensesSeries,
              borderColor: "#ef4444",
              backgroundColor: "rgba(239,68,68,0.12)",
              fill: true,
              tension: 0.33
            }
          ]
        },
        options: chartOptions()
      });

      // Cash vs Online (overall)
      const cashOnline = { cash: 0, online: 0 };
      (state.sales || []).forEach((s) => {
        const amt = num(s.amount);
        if ((s.method || "").toLowerCase() === "cash") cashOnline.cash += amt;
        else cashOnline.online += amt;
      });

      methodChartRef = new Chart(document.getElementById("methodChart"), {
        type: "doughnut",
        data: {
          labels: ["Cash Sales", "Online Sales"],
          datasets: [{ data: [cashOnline.cash, cashOnline.online], backgroundColor: ["#38bdf8", "#f59e0b"] }]
        },
        options: chartOptions(true)
      });

      // Expense by Category (paid only)
      const expenseBar = {};
      (state.expenses || [])
        .filter((e) => e.status === "paid")
        .forEach((e) => {
          const k = e.category || "Other";
          expenseBar[k] = (expenseBar[k] || 0) + num(e.amount);
        });

      categoryExpenseChartRef = new Chart(document.getElementById("categoryExpenseChart"), {
        type: "bar",
        data: {
          labels: Object.keys(expenseBar),
          datasets: [{ data: Object.values(expenseBar).map(num), backgroundColor: ["#a855f7", "#f97316", "#14b8a6"], borderRadius: 8 }]
        },
        options: chartOptions()
      });

      renderStaffPayableTable();
    } catch (e) {
      console.error(e);
      toast("Error occurred", "error");
    } finally {
      setLoading(false);
    }
  };

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

  function renderMasterSelects() {
    fillSelect("purchaseSellerSelect", supplierNames(), "Select Supplier");
    fillSelect("attName", staffNames(), "Select Staff");
    fillSelect("salName", staffNames(), "Select Staff");
    fillSelect("advStaff", staffNames(), "Select Staff");
  }

  function renderAll() {
    document.getElementById("todayLabel").textContent = new Date().toLocaleString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
    renderMasterSelects();
    renderKpis();
    renderSuppliers();
    renderStaffMaster();
    renderSales();
    renderPurchases();
    renderBills();
    renderAttendance();
    renderSalaries();
    renderInventory();
  }

  function setDefaults() {
    ["saleDate", "purchaseDate", "billDate", "attDate", "advDate"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = todayISO();
    });
    ["salMonth", "advMonth"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = monthISO();
    });
  }

  window.addEventListener("load", async () => {
    setDefaults();
    loadAll();
  });
})();
