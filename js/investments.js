/**
 * Investments & Take Profit — capital in / shop purchases / owner withdrawals.
 * Not shown on dashboard; own section only.
 */
(function (root) {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function money(n) {
    if (typeof root.money === "function") return root.money(n);
    const v = Number(n) || 0;
    return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function todayISO() {
    if (typeof root.todayISO === "function") return root.todayISO();
    return new Date().toISOString().slice(0, 10);
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function toast(msg, type) {
    if (typeof root.toast === "function") return root.toast(msg, type);
    console.log(msg);
  }

  function state() {
    return root.state || {};
  }

  function totals() {
    const inv = state().investments || [];
    const wd = state().profitWithdrawals || [];
    const totalInvested = inv.reduce((s, r) => s + num(r.amount), 0);
    const totalTaken = wd.reduce((s, r) => s + num(r.amount), 0);
    return {
      totalInvested,
      totalTaken,
      netCapital: totalInvested - totalTaken
    };
  }

  function kindLabel(kind) {
    const k = String(kind || "");
    if (k === "capital_in") return "Capital added";
    if (k === "shop_purchase") return "Shop purchase";
    return k || "—";
  }

  function accountLabel(a) {
    const x = String(a || "").toLowerCase();
    if (x === "cash") return "Cash";
    if (x === "online" || x === "bank") return "Online";
    if (x === "personal") return "Personal";
    return a || "—";
  }

  function renderSummary() {
    const t = totals();
    const bal =
      typeof root.calcTotals === "function"
        ? root.calcTotals()
        : { cashBalance: 0, bankBalance: 0 };
    const set = (id, v) => {
      const el = $(id);
      if (el) el.textContent = v;
    };
    set("invTotalInvested", money(t.totalInvested));
    set("invTotalTaken", money(t.totalTaken));
    set("invNetCapital", money(t.netCapital));
    set("invAvailCash", money(bal.cashBalance));
    set("invAvailOnline", money(bal.bankBalance));
  }

  function renderInvestmentsList() {
    const el = $("invList");
    if (!el) return;
    const rows = [...(state().investments || [])].sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );
    if (!rows.length) {
      el.innerHTML = `<div class="muted" style="padding:12px;">No investments yet. Add capital or shop purchases above.</div>`;
      return;
    }
    el.innerHTML =
      `<div class="table-row"><strong>Date</strong><strong>Type</strong><strong>Item / note</strong><strong>Account</strong><strong>Amount</strong><strong></strong></div>` +
      rows
        .map(
          (r) => `<div class="table-row">
        <div>${String(r.date || "").slice(0, 10)}</div>
        <div>${kindLabel(r.kind)}</div>
        <div>${r.title || r.notes || "—"}</div>
        <div>${accountLabel(r.account)}</div>
        <div>${money(r.amount)}</div>
        <div><button type="button" class="warn btn-sm" data-inv-del="${r.id}">Delete</button></div>
      </div>`
        )
        .join("");
  }

  function renderWithdrawalsList() {
    const el = $("invWdList");
    if (!el) return;
    const rows = [...(state().profitWithdrawals || [])].sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );
    if (!rows.length) {
      el.innerHTML = `<div class="muted" style="padding:12px;">No profit withdrawals yet.</div>`;
      return;
    }
    el.innerHTML =
      `<div class="table-row"><strong>Date</strong><strong>From</strong><strong>Notes</strong><strong>Amount</strong><strong></strong></div>` +
      rows
        .map(
          (r) => `<div class="table-row">
        <div>${String(r.date || "").slice(0, 10)}</div>
        <div>${accountLabel(r.account)}</div>
        <div>${r.notes || "—"}</div>
        <div>${money(r.amount)}</div>
        <div><button type="button" class="warn btn-sm" data-wd-del="${r.id}">Delete</button></div>
      </div>`
        )
        .join("");
  }

  function renderAll() {
    renderSummary();
    renderInvestmentsList();
    renderWithdrawalsList();
  }

  async function addInvestment() {
    const api = root.api;
    if (!api?.investments?.create) return toast("Investments API not ready", "error");
    const date = ($("invDate")?.value || todayISO()).slice(0, 10);
    const amount = num($("invAmount")?.value);
    const kind = $("invKind")?.value || "capital_in";
    const account = $("invAccount")?.value || "cash";
    const title = ($("invTitle")?.value || "").trim();
    const notes = ($("invNotes")?.value || "").trim();
    if (!(amount > 0)) return toast("Enter investment amount", "error");
    if (!title) return toast("Enter item / description", "error");
    if (kind === "capital_in" && account === "personal") {
      return toast("Capital in must go to Cash or Online", "error");
    }
    if (kind === "shop_purchase" && (account === "cash" || account === "online")) {
      const bal = typeof root.calcTotals === "function" ? root.calcTotals() : null;
      if (bal) {
        const avail = account === "cash" ? bal.cashBalance : bal.bankBalance;
        if (amount > avail + 0.009) {
          return toast(`Not enough ${accountLabel(account)}. Available: ${money(avail)}`, "error");
        }
      }
    }
    await api.investments.create({ date, amount, kind, account, title, notes });
    if ($("invAmount")) $("invAmount").value = "";
    if ($("invTitle")) $("invTitle").value = "";
    if ($("invNotes")) $("invNotes").value = "";
    if (typeof root.loadAll === "function") await root.loadAll();
    else {
      state().investments = await api.investments.list();
      renderAll();
    }
    toast("Investment saved", "ok");
  }

  async function addWithdrawal() {
    const api = root.api;
    if (!api?.profitWithdrawals?.create) return toast("Take profit API not ready", "error");
    const date = ($("invWdDate")?.value || todayISO()).slice(0, 10);
    const amount = num($("invWdAmount")?.value);
    const account = $("invWdAccount")?.value || "cash";
    const notes = ($("invWdNotes")?.value || "").trim();
    if (!(amount > 0)) return toast("Enter profit amount", "error");
    const bal = typeof root.calcTotals === "function" ? root.calcTotals() : null;
    if (bal) {
      const avail = account === "cash" ? bal.cashBalance : bal.bankBalance;
      if (amount > avail + 0.009) {
        return toast(`Not enough ${accountLabel(account)}. Available: ${money(avail)}`, "error");
      }
    }
    await api.profitWithdrawals.create({ date, amount, account, notes });
    if ($("invWdAmount")) $("invWdAmount").value = "";
    if ($("invWdNotes")) $("invWdNotes").value = "";
    if (typeof root.loadAll === "function") await root.loadAll();
    else {
      state().profitWithdrawals = await api.profitWithdrawals.list();
      renderAll();
    }
    toast("Profit withdrawal saved", "ok");
  }

  async function removeInvestment(id) {
    if (!id || !confirm("Delete this investment entry?")) return;
    const api = root.api;
    if (!api?.investments?.remove) return toast("Delete not supported", "error");
    await api.investments.remove(id);
    if (typeof root.loadAll === "function") await root.loadAll();
    toast("Investment deleted", "ok");
  }

  async function removeWithdrawal(id) {
    if (!id || !confirm("Delete this take-profit entry? Balance will reverse.")) return;
    const api = root.api;
    if (!api?.profitWithdrawals?.remove) return toast("Delete not supported", "error");
    await api.profitWithdrawals.remove(id);
    if (typeof root.loadAll === "function") await root.loadAll();
    toast("Withdrawal deleted", "ok");
  }

  function onEnter() {
    if ($("invDate") && !$("invDate").value) $("invDate").value = todayISO();
    if ($("invWdDate") && !$("invWdDate").value) $("invWdDate").value = todayISO();
    renderAll();
  }

  function bind() {
    const rootEl = $("investments-section");
    if (!rootEl || rootEl.__invBound) return;
    rootEl.__invBound = true;
    $("invAddBtn")?.addEventListener("click", () => {
      (typeof root.withErr === "function" ? root.withErr : (fn) => fn())(addInvestment);
    });
    $("invWdAddBtn")?.addEventListener("click", () => {
      (typeof root.withErr === "function" ? root.withErr : (fn) => fn())(addWithdrawal);
    });
    rootEl.addEventListener("click", (e) => {
      const inv = e.target.closest("[data-inv-del]");
      if (inv) {
        (typeof root.withErr === "function" ? root.withErr : (fn) => fn())(() =>
          removeInvestment(inv.getAttribute("data-inv-del"))
        );
      }
      const wd = e.target.closest("[data-wd-del]");
      if (wd) {
        (typeof root.withErr === "function" ? root.withErr : (fn) => fn())(() =>
          removeWithdrawal(wd.getAttribute("data-wd-del"))
        );
      }
    });
  }

  const api = {
    totals,
    renderAll,
    onEnter,
    bind,
    addInvestment,
    addWithdrawal,
    removeInvestment,
    removeWithdrawal
  };

  root.KG = root.KG || {};
  root.KG.investments = api;
  root.renderInvestmentsModule = renderAll;
  root.openInvestmentsSection = onEnter;
})(typeof globalThis !== "undefined" ? globalThis : window);
