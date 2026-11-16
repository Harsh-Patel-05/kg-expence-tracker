/**
 * Checkout: local-first, bill numbers via transaction, sales bridge, print, offline queue.
 */
(function (root) {
  "use strict";

  function toast(msg, type) {
    if (typeof root.toast === "function") root.toast(msg, type || "info");
    else console.log("[POS]", msg);
  }

  function role() {
    try {
      return String(root.KgAuth?.getProfile?.()?.role || root.KgAuth?.currentProfile?.role || "employee").toLowerCase();
    } catch (_) {
      return "employee";
    }
  }

  function cashierName() {
    try {
      return (
        root.KgAuth?.getProfile?.()?.name ||
        root.KgAuth?.currentUser?.email ||
        root.KG?.posState?.getState()?.cashierName ||
        ""
      );
    } catch (_) {
      return "";
    }
  }

  async function nextBillNo(outletCode) {
    const db = firebase.firestore();
    const date = root.KG.salesBridge.businessDateISO(
      new Date(),
      root.KG.posState.getState().settings.businessDayCutOff
    );
    const ymd = date.replace(/-/g, "");
    const code = outletCode || root.KG.posState.getState().settings.outletCode || "KG";
    const counterId = `${code}_${ymd}`;
    const ref = db.collection("billCounters").doc(counterId);
    const billNo = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const seq = (snap.exists ? Number(snap.data().seq) || 0 : 0) + 1;
      tx.set(
        ref,
        { seq, date, outletCode: code, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return `${code}-${ymd}-${String(seq).padStart(4, "0")}`;
    });
    return { billNo, date };
  }

  function buildBillRecord(payment, totals, billNo, date) {
    const st = root.KG.posState.getState();
    const billId = root.KG.posState.uid("bill");
    const cash = Number(payment.cash) || 0;
    const online = Number(payment.online) || 0;
    const swiggy = Number(payment.swiggy) || 0;
    const zomato = Number(payment.zomato) || 0;
    return {
      id: billId,
      billId,
      billNo,
      date,
      orderType: st.orderType,
      tableId: st.tableId,
      customerName: st.customerName,
      customerPhone: st.customerPhone,
      items: st.cart.map((l) => ({
        menuItemId: l.menuItemId,
        name: l.name,
        nameHi: l.nameHi,
        price: l.price,
        qty: l.qty,
        note: l.note || ""
      })),
      itemsCount: st.cart.reduce((s, l) => s + (l.qty || 0), 0),
      subtotal: totals.subtotal,
      discount: totals.discount,
      charges: totals.charges,
      gst: totals.gst,
      roundOff: totals.roundOff,
      grandTotal: totals.grandTotal,
      totalAmount: totals.grandTotal,
      discountTotal: totals.discount,
      taxTotal: totals.gst,
      cashAmount: cash,
      otherOnlineAmount: online,
      onlineAmount: online + swiggy + zomato,
      swiggyAmount: swiggy,
      zomatoAmount: zomato,
      method: root.KG.salesBridge.paymentMethod({
        cashAmount: cash,
        otherOnlineAmount: online,
        swiggyAmount: swiggy,
        zomatoAmount: zomato
      }),
      notes: st.note || "",
      createdBy: cashierName(),
      status: "settled",
      idempotencyKey: st.idempotencyKey || billId,
      at: Date.now()
    };
  }

  function saveLocalBill(bill) {
    try {
      const key = "kg_pos_bills_local_v1";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.unshift(bill);
      localStorage.setItem(key, JSON.stringify(arr.slice(0, 200)));
    } catch (_) {}
  }

  async function persistBillRemote(bill) {
    const db = firebase.firestore();
    const batch = db.batch();
    const billRef = db.collection("posBills").doc(bill.billId);
    batch.set(billRef, {
      ...bill,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Keep orders collection for history compatibility
    const orderRef = db.collection("orders").doc(bill.billId);
    batch.set(orderRef, {
      date: bill.date,
      items: bill.items.map((it) => ({
        menuItemId: it.menuItemId,
        name: it.name,
        price: it.price,
        qty: it.qty,
        note: it.note || ""
      })),
      notes: bill.notes,
      subtotal: bill.subtotal,
      tax: bill.taxTotal,
      total: bill.grandTotal,
      payment: {
        cash: bill.cashAmount,
        online: bill.otherOnlineAmount + bill.swiggyAmount + bill.zomatoAmount
      },
      billNo: bill.billNo,
      source: "pos",
      orderType: bill.orderType,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
    await root.KG.salesBridge.postBillToSales(bill);
  }

  async function syncQueue() {
    const q = root.KG.posState.peekQueue();
    if (!q.length) return;
    const remaining = [];
    for (const job of q) {
      if (job.type !== "settle" || !job.bill) {
        remaining.push(job);
        continue;
      }
      try {
        await persistBillRemote(job.bill);
      } catch (e) {
        console.warn("sync failed", e);
        remaining.push(job);
      }
    }
    root.KG.posState.setQueue(remaining);
  }

  /**
   * Settle bill — never blocks printing on network.
   * @param {object} payment { cash, online, swiggy, zomato, receivedCash? }
   * @param {{ printBill?: boolean, printKOT?: boolean }} opts
   */
  async function settle(payment, opts) {
    const o = opts || {};
    const st = root.KG.posState.getState();
    if (st.settling) {
      toast("Checkout already in progress", "error");
      return null;
    }
    if (!st.cart.length) {
      toast("Cart is empty", "error");
      return null;
    }

    const totals = root.KG.posState.computeTotals();
    const money = root.KG.money;
    const split = money.validateSplit(totals.grandPaise, {
      cashPaise: money.toPaise(payment.cash),
      onlinePaise: money.toPaise(payment.online),
      swiggyPaise: money.toPaise(payment.swiggy),
      zomatoPaise: money.toPaise(payment.zomato)
    });
    if (!split.ok) {
      toast("Payment split must equal total", "error");
      return null;
    }

    // Discount role check
    const r = role();
    const maxEmp = st.settings.maxDiscountPercentEmployee || 5;
    if ((r === "employee" || r === "kitchen") && st.discountPercent > maxEmp) {
      toast(`Discount above ${maxEmp}% needs manager`, "error");
      return null;
    }

    st.settling = true;
    st.idempotencyKey = st.idempotencyKey || root.KG.posState.uid("idem");
    const t0 = performance.now();

    try {
      let billNo = "LOCAL-" + Date.now();
      let date = root.KG.salesBridge.businessDateISO(new Date(), st.settings.businessDayCutOff);
      try {
        const n = await nextBillNo(st.settings.outletCode);
        billNo = n.billNo;
        date = n.date;
      } catch (e) {
        console.warn("bill counter offline, using local number", e);
      }

      const bill = buildBillRecord(payment, totals, billNo, date);
      saveLocalBill(bill);
      root.KG.posState.getState().lastBillId = bill.billId;
      root.KG.posState.getState().lastBillPayload = bill;

      // Print immediately
      if (o.printKOT !== false) {
        root.KG.print.printKOT({
          billNo: bill.billNo,
          kotNo: bill.billNo,
          orderType: bill.orderType,
          tableId: bill.tableId,
          items: bill.items,
          cart: st.cart.slice(),
          at: bill.at,
          helpers: {
            prepLabel: root.prepLabel || ((p) => p),
            translateEnToHi: root.translateEnToHi || (async (x) => x),
            escapeHtml: (s) =>
              String(s || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
          }
        });
      }
      if (o.printBill) {
        const parts = [];
        if (bill.cashAmount) parts.push("Cash");
        if (bill.otherOnlineAmount) parts.push("Online");
        if (bill.swiggyAmount) parts.push("Swiggy");
        if (bill.zomatoAmount) parts.push("Zomato");
        root.KG.print.printBill({
          ...bill,
          paymentLabel: parts.join(" + ")
        });
      }

      const localMs = performance.now() - t0;
      if (root.KG.pos?.devPerf) console.log("[POS perf] checkout local", localMs.toFixed(2), "ms");

      // Background sync
      root.KG.posState.enqueueOffline({ type: "settle", bill });
      persistBillRemote(bill)
        .then(() => {
          const q = root.KG.posState.peekQueue().filter((j) => j.bill?.billId !== bill.billId);
          root.KG.posState.setQueue(q);
          toast("Bill synced", "success");
          // Soft refresh sales into legacy state if present
          if (typeof root.loadAll === "function") {
            root.loadAll().catch(() => {});
          }
        })
        .catch((e) => {
          console.warn(e);
          toast("Saved locally — will sync when online", "info");
        });

      // Inventory — failure tolerant
      try {
        const api = root.api;
        const appState = root.state || {};
        if (root.KgPhase2?.deductRecipeForCart && api?.inventory?.adjust) {
          root.KgPhase2
            .deductRecipeForCart({
              cart: bill.items,
              menuItems: appState.menuItems || root.KG.posMenu.getAll(),
              inventory: appState.inventory || [],
              today: bill.date,
              adjustFn: (id, body) => api.inventory.adjust(id, body)
            })
            .catch((err) => {
              console.warn(err);
              toast("Stock update failed (bill OK)", "info");
            });
        }
      } catch (stockErr) {
        console.warn(stockErr);
      }

      if (st.tableId && st.tables[st.tableId]) {
        st.tables[st.tableId].status = "billed";
        st.tables[st.tableId].billId = bill.billId;
      }

      root.KG.posState.clearCart();
      toast(`Bill ${bill.billNo} · ${money.formatINR(bill.grandTotal)}`, "success");
      if (typeof root.showCelebrate === "function") root.showCelebrate(money.formatINR(bill.grandTotal));
      return bill;
    } finally {
      st.settling = false;
    }
  }

  async function voidBill(billId, reason) {
    const r = role();
    if (r !== "owner" && r !== "manager" && r !== "admin") {
      toast("Only owner/manager can void bills", "error");
      return false;
    }
    await root.KG.salesBridge.voidSaleForBill(billId, reason);
    try {
      await firebase.firestore().collection("posBills").doc(billId).set(
        {
          status: "void",
          voidReason: reason || "",
          voidedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    } catch (_) {}
    toast("Bill voided", "success");
    return true;
  }

  const api = {
    settle,
    voidBill,
    syncQueue,
    nextBillNo,
    buildBillRecord
  };

  root.KG = root.KG || {};
  root.KG.posCheckout = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
