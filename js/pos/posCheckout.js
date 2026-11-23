/**
 * Checkout: local-first, bill numbers via transaction, sales bridge, print, offline queue.
 */
(function (root) {
  "use strict";

  function toast(msg, type) {
    if (typeof root.toast === "function") root.toast(msg, type || "info");
    else console.log("[POS]", msg);
  }

  /** Quiet logs for background sync — no cashier toast spam */
  function logQuiet(msg) {
    if (root.KG?.pos?.devPerf) console.log("[POS]", msg);
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

  /** Never hang the cashier UI on slow/dead network */
  function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label || `timeout ${ms}ms`)), ms);
      })
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  function isOnline() {
    try {
      return root.navigator.onLine !== false;
    } catch (_) {
      return true;
    }
  }

  /** Local fallback so offline still gets 1,2,3… per business day (shared all channels) */
  function offlineNextDaily(date) {
    const ymd = String(date || "").replace(/-/g, "");
    const key = `kg_pos_daily_seq_${ymd || "local"}`;
    let seq = 0;
    try {
      seq = (Number(localStorage.getItem(key)) || 0) + 1;
      localStorage.setItem(key, String(seq));
    } catch (_) {
      seq = Number(String(Date.now()).slice(-3)) || 1;
    }
    return seq;
  }

  /**
   * One shared daily counter for Takeaway + Swiggy + Zomato.
   * Resets every business day → 1, 2, 3…
   * Weak net: 2.5s cap then local number (POS never freezes).
   */
  async function nextBillNo(outletCode) {
    const date = root.KG.salesBridge.businessDateISO(
      new Date(),
      root.KG.posState.getState().settings.businessDayCutOff
    );
    const ymd = date.replace(/-/g, "");
    const code = outletCode || root.KG.posState.getState().settings.outletCode || "KG";
    const counterId = `${code}_${ymd}`;
    const localFallback = () => {
      const dailyNo = offlineNextDaily(date);
      const billNo = `${code}-${ymd}-${String(dailyNo).padStart(4, "0")}`;
      return { billNo, dailyNo, date, offline: true };
    };
    if (!isOnline()) return localFallback();
    try {
      const db = firebase.firestore();
      const ref = db.collection("billCounters").doc(counterId);
      const dailyNo = await withTimeout(
        db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const seq = (snap.exists ? Number(snap.data().seq) || 0 : 0) + 1;
          tx.set(
            ref,
            {
              seq,
              date,
              outletCode: code,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
          );
          return seq;
        }),
        2000,
        "bill# timeout"
      );
      try {
        const key = `kg_pos_daily_seq_${ymd}`;
        const local = Number(localStorage.getItem(key)) || 0;
        if (dailyNo > local) localStorage.setItem(key, String(dailyNo));
      } catch (_) {}
      const billNo = `${code}-${ymd}-${String(dailyNo).padStart(4, "0")}`;
      return { billNo, dailyNo, date };
    } catch (e) {
      return localFallback();
    }
  }

  function buildBillRecord(payment, totals, billNo, date, dailyNo) {
    const st = root.KG.posState.getState();
    const billId = root.KG.posState.uid("bill");
    const token = Math.max(1, Number(dailyNo) || 0) || Number(String(billNo).split("-").pop()) || 1;
    const payLater = !!(payment && payment.payLater);
    const cash = payLater ? 0 : Number(payment.cash) || 0;
    const online = payLater ? 0 : Number(payment.online) || 0;
    const swiggy = payLater ? 0 : Number(payment.swiggy) || 0;
    const zomato = payLater ? 0 : Number(payment.zomato) || 0;
    const channel = String(st.orderType || "takeaway").toLowerCase();
    const isAgg = channel === "swiggy" || channel === "zomato";
    return {
      id: billId,
      billId,
      billNo,
      dailyNo: token,
      tokenNo: token,
      date,
      orderType: isAgg ? (channel === "swiggy" ? "Swiggy" : "Zomato") : "Takeaway",
      channel,
      platformOrderNo: String(st.platformOrderNo || "").trim(),
      excludeFromSales: isAgg || payLater,
      payLater,
      paymentStatus: payLater ? "unpaid" : "paid",
      tableId: st.tableId,
      customerName: st.customerName,
      customerPhone: st.customerPhone,
      items: st.cart.map((l) => {
        const clean = root.KG.posMenu?.cleanVariantLabel || ((x) => (/^default$/i.test(String(x || "").trim()) ? "" : String(x || "").trim()));
        const strip = root.KG.posMenu?.cleanDisplayName || root.KG.posMenu?.stripTrailingSize || ((x) => String(x || "").trim());
        const size =
          l.isWeightMerge
            ? clean(l.variantLabel)
            : root.KG.posMenu?.sizeSuffix?.(l.nameHi || l.name, l.variantLabel) || clean(l.variantLabel);
        // Weight-merge lines already store total ₹ in price with qty 1
        const unit = Number(l.price) || 0;
        const qty = l.isWeightMerge ? 1 : l.qty;
        return {
          menuItemId: l.menuItemId,
          name: strip(l.name),
          nameHi: strip(l.nameHi),
          variantLabel: size,
          price: unit,
          qty,
          note: l.note || ""
        };
      }),
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
      method: payLater
        ? "Pay later"
        : root.KG.salesBridge.paymentMethod({
            cashAmount: cash,
            otherOnlineAmount: online,
            swiggyAmount: swiggy,
            zomatoAmount: zomato
          }),
      notes: st.amend?.label
        ? `${st.note || ""}${st.note ? " | " : ""}Amend add-on for kitchen #${st.amend.label}`.trim()
        : st.note || "",
      amendOf: st.amend?.kdsId || "",
      createdBy: cashierName(),
      status: payLater ? "pending_payment" : "settled",
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
    const cleanBill = JSON.parse(JSON.stringify(bill)); // drop undefined for Firestore
    batch.set(billRef, {
      ...cleanBill,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Keep orders collection for history compatibility
    const orderRef = db.collection("orders").doc(bill.billId);
    batch.set(orderRef, {
      date: bill.date,
      items: bill.items.map((it) => ({
        menuItemId: it.menuItemId || "",
        name: it.name,
        price: it.price,
        qty: it.qty,
        note: it.note || ""
      })),
      notes: bill.notes || "",
      subtotal: bill.subtotal,
      tax: bill.taxTotal,
      total: bill.grandTotal,
      payment: {
        cash: bill.cashAmount || 0,
        online: (bill.otherOnlineAmount || 0) + (bill.swiggyAmount || 0) + (bill.zomatoAmount || 0)
      },
      billNo: bill.billNo,
      dailyNo: bill.dailyNo || bill.tokenNo || 0,
      payLater: !!bill.payLater,
      paymentStatus: bill.paymentStatus || (bill.payLater ? "unpaid" : "paid"),
      status: bill.status || "settled",
      source: "pos",
      orderType: bill.orderType,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
    // Swiggy/Zomato: kitchen ticket only — do not post to sales (entered weekly manually)
    if (!bill.excludeFromSales) {
      await root.KG.salesBridge.postBillToSales(bill);
    }
  }

  async function syncQueue() {
    if (!isOnline()) return;
    const peek =
      root.KG.posState.peekQueueAsync || (() => Promise.resolve(root.KG.posState.peekQueue()));
    const q = await peek.call(root.KG.posState);
    if (!q.length) return;
    const remaining = [];
    let stop = false;
    for (let i = 0; i < q.length; i++) {
      const job = q[i];
      if (stop) {
        remaining.push(job);
        continue;
      }
      if (job.type !== "settle" || !job.bill) {
        remaining.push(job);
        continue;
      }
      if (i >= 12) {
        remaining.push(job);
        continue;
      }
      try {
        await withTimeout(persistBillRemote(job.bill), 6000, "bill sync timeout");
      } catch (e) {
        console.warn("sync failed", e);
        remaining.push(job);
        if (/timeout|INTERNAL ASSERTION|Unexpected state|unavailable|network/i.test(String(e?.message || ""))) {
          stop = true;
        }
      }
    }
    await root.KG.posState.setQueue(remaining);
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
    const channel = String(st.orderType || "takeaway").toLowerCase();
    const isAgg = channel === "swiggy" || channel === "zomato";
    if (isAgg && !String(st.platformOrderNo || "").trim()) {
      toast("Enter " + (channel === "swiggy" ? "Swiggy" : "Zomato") + " order number", "error");
      return null;
    }
    // Aggregator tickets: ₹0 charged in POS (sales added manually weekly)
    const payLater = !!(payment && payment.payLater);
    const pay = isAgg || payLater
      ? { cash: 0, online: 0, swiggy: 0, zomato: 0, payLater: !!payLater }
      : payment;
    if (!isAgg && !payLater) {
      const split = money.validateSplit(totals.grandPaise, {
        cashPaise: money.toPaise(pay.cash),
        onlinePaise: money.toPaise(pay.online),
        swiggyPaise: money.toPaise(pay.swiggy),
        zomatoPaise: money.toPaise(pay.zomato)
      });
      if (!split.ok) {
        toast("Payment split must equal total", "error");
        return null;
      }
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
      let billNo;
      let dailyNo;
      let date = root.KG.salesBridge.businessDateISO(new Date(), st.settings.businessDayCutOff);
      try {
        const n = await nextBillNo(st.settings.outletCode);
        billNo = n.billNo;
        dailyNo = n.dailyNo;
        date = n.date;
      } catch (e) {
        console.warn("bill counter offline, using local daily number", e);
        dailyNo = offlineNextDaily(date);
        const ymd = date.replace(/-/g, "");
        const code = st.settings.outletCode || "KG";
        billNo = `${code}-${ymd}-${String(dailyNo).padStart(4, "0")}`;
      }

      const bill = buildBillRecord(pay, totals, billNo, date, dailyNo);
      saveLocalBill(bill);
      try {
        root.KG.posFavourites?.recordBillItems?.(bill.items, bill.at);
      } catch (_) {}
      root.KG.posState.getState().lastBillId = bill.billId;
      root.KG.posState.getState().lastBillPayload = bill;

      // Print only when caller asks AND a hardware printer is available
      const canPrint = !!root.KG.print?.hasHardwarePrinter?.();
      if (o.printKOT === true && canPrint) {
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

      // Kitchen Display — one short attempt; on weak net continue checkout & retry in background
      let kdsOk = false;
      const kdsBill = {
        ...bill,
        payLater: !!bill.payLater,
        paymentStatus: bill.payLater ? "unpaid" : bill.paymentStatus || "paid",
        dailyNo: bill.dailyNo || bill.tokenNo,
        tokenNo: bill.tokenNo || bill.dailyNo,
        cashierName: cashierName(),
        orderNote: st.note || st.orderNote || bill.notes || "",
        at: bill.at ? new Date(bill.at).toISOString() : new Date().toISOString(),
        platformOrderNo: bill.platformOrderNo || st.platformOrderNo || "",
        channel: bill.channel || channel
      };
      try {
        const amendId = st.amend?.kdsId || "";
        if (amendId && root.KG?.kdsStore?.addItems) {
          const items = (bill.items || []).map((it) => ({
            nameEn: it.name,
            nameHi: it.nameHi || "",
            qty: it.qty || 1,
            variant: it.variantLabel || "",
            itemNote: it.note || ""
          }));
          await withTimeout(
            root.KG.kdsStore.addItems(amendId, items, cashierName()),
            3000,
            "kds amend timeout"
          );
          kdsOk = true;
        } else {
          const push = root.KG?.kdsClient?.pushOrderFromBill;
          if (typeof push !== "function") {
            console.error("KDS client missing — reload POS page");
          } else {
            await withTimeout(push.call(root.KG.kdsClient, kdsBill), 3000, "kds timeout");
            kdsOk = true;
          }
        }
      } catch (e) {
        console.warn("KDS push deferred (weak net)", e);
        const msg = String(e?.message || e?.code || "");
        const dead = /INTERNAL ASSERTION FAILED|Unexpected state/i.test(msg);
        if (dead) {
          try {
            sessionStorage.setItem("kg_pos_fs_soft_recover", "1");
          } catch (_) {}
        }
        logQuiet("kitchen sync deferred");
        setTimeout(() => {
          pushUnpaidBillsToKitchen({ force: false }).catch(() => {});
        }, 2000);
      }
      bill.kdsSynced = kdsOk;
      try {
        upsertLocalBill({ ...bill, kdsSynced: kdsOk });
      } catch (_) {
        saveLocalBill(bill);
      }
      if (o.printBill === true && canPrint) {
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

      // Background sync (IndexedDB queue)
      Promise.resolve(root.KG.posState.enqueueOffline({ type: "settle", bill })).catch(() => {});
      persistBillRemote(bill)
        .then(async () => {
          const peek =
            root.KG.posState.peekQueueAsync ||
            (() => Promise.resolve(root.KG.posState.peekQueue()));
          const q = (await peek.call(root.KG.posState)).filter((j) => j.bill?.billId !== bill.billId);
          await root.KG.posState.setQueue(q);
          logQuiet("bill synced");
          if (typeof root.loadAll === "function") {
            root.loadAll().catch(() => {});
          }
        })
        .catch((e) => {
          console.warn(e);
          logQuiet("bill queued offline");
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
            .catch((err) => console.warn(err));
        }
      } catch (stockErr) {
        console.warn(stockErr);
      }

      if (st.tableId && st.tables[st.tableId]) {
        st.tables[st.tableId].status = "billed";
        st.tables[st.tableId].billId = bill.billId;
      }

      const wasAmend = !!st.amend?.kdsId;
      root.KG.posState.clearCart();
      root.KG.posState.clearAmend?.();
      // One short toast only
      toast(
        wasAmend
          ? `#${bill.dailyNo || "—"} · ${money.formatINR(bill.grandTotal)}`
          : bill.payLater
            ? `Pay later #${bill.dailyNo || "—"} · ${money.formatINR(bill.grandTotal)}`
            : `#${bill.dailyNo || bill.billNo} · ${money.formatINR(bill.grandTotal)}`,
        "success"
      );
      if (typeof root.showCelebrate === "function") root.showCelebrate(money.formatINR(bill.grandTotal));
      return bill;
    } finally {
      st.settling = false;
    }
  }


  function findLocalBill(billId) {
    try {
      const key = String(billId || "");
      const arr = JSON.parse(localStorage.getItem("kg_pos_bills_local_v1") || "[]");
      return (
        (arr || []).find(
          (b) =>
            String(b.billId || b.id) === key ||
            String(b.billNo || "") === key
        ) || null
      );
    } catch (_) {
      return null;
    }
  }

  function upsertLocalBill(bill) {
    try {
      const key = "kg_pos_bills_local_v1";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      const id = String(bill.billId || bill.id);
      const next = [bill, ...(arr || []).filter((b) => String(b.billId || b.id) !== id)];
      localStorage.setItem(key, JSON.stringify(next.slice(0, 200)));
    } catch (_) {}
  }

  /**
   * Collect Cash/Online for a Pay-later bill (after kitchen ready or anytime).
   * @param {string} billId
   * @param {{ cash?: number, online?: number }} payment
   * @param {{ kdsId?: string }} opts
   */
  async function collectPayment(billId, payment, opts) {
    const o = opts || {};
    const pay = payment || {};
    const cash = Number(pay.cash) || 0;
    const online = Number(pay.online) || 0;
    if (cash <= 0 && online <= 0) {
      toast("Enter Cash or Online amount", "error");
      return null;
    }

    let bill = findLocalBill(billId);
    if (!bill) {
      try {
        const snap = await firebase.firestore().collection("posBills").doc(String(billId)).get();
        if (snap.exists) bill = { billId: snap.id, ...snap.data() };
      } catch (e) {
        console.warn(e);
      }
    }
    if (!bill) {
      toast("Bill not found for payment", "error");
      return null;
    }
    if (bill.status === "settled" && bill.paymentStatus === "paid") {
      toast("Already paid", "info");
      return bill;
    }

    const money = root.KG.money;
    const grand = Number(bill.grandTotal) || 0;
    const split = money.validateSplit(money.toPaise(grand), {
      cashPaise: money.toPaise(cash),
      onlinePaise: money.toPaise(online),
      swiggyPaise: 0,
      zomatoPaise: 0
    });
    if (!split.ok) {
      toast(`Payment must equal ${money.formatINR(grand)}`, "error");
      return null;
    }

    const patched = {
      ...bill,
      cashAmount: cash,
      otherOnlineAmount: online,
      onlineAmount: online,
      swiggyAmount: 0,
      zomatoAmount: 0,
      method: root.KG.salesBridge.paymentMethod({
        cashAmount: cash,
        otherOnlineAmount: online,
        swiggyAmount: 0,
        zomatoAmount: 0
      }),
      payLater: false,
      paymentStatus: "paid",
      status: "settled",
      excludeFromSales: false,
      paidAt: Date.now()
    };
    upsertLocalBill(patched);

    try {
      await firebase.firestore().collection("posBills").doc(String(billId)).set(
        {
          cashAmount: cash,
          otherOnlineAmount: online,
          onlineAmount: online,
          method: patched.method,
          payLater: false,
          paymentStatus: "paid",
          status: "settled",
          excludeFromSales: false,
          paidAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("bill update", e);
    }

    try {
      await root.KG.salesBridge.postBillToSales(patched);
    } catch (e) {
      console.warn("sales post", e);
      toast("Payment saved — sales sync pending", "info");
    }

    const kdsId = o.kdsId || bill.billNo || billId;
    try {
      if (root.KG?.kdsStore?.markPaid) {
        await root.KG.kdsStore.markPaid(kdsId, cashierName());
      }
    } catch (e) {
      console.warn("kds markPaid", e);
    }

    toast(`Paid ${money.formatINR(grand)} · ${patched.method}`, "success");
    if (typeof root.loadAll === "function") root.loadAll().catch(() => {});
    return patched;
  }


  /** Mark local pay-later bill cancelled so it cannot respawn on KDS */
  function markLocalBillCancelled(refIds, reason) {
    const keys = (Array.isArray(refIds) ? refIds : [refIds])
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    if (!keys.length) return null;
    try {
      const storeKey = "kg_pos_bills_local_v1";
      const arr = JSON.parse(localStorage.getItem(storeKey) || "[]");
      let hit = null;
      const next = (arr || []).map((b) => {
        if (!b) return b;
        const id = String(b.billId || b.id || "");
        const no = String(b.billNo || "");
        if (!keys.includes(id) && !keys.includes(no)) return b;
        hit = {
          ...b,
          payLater: false,
          paymentStatus: "cancelled",
          status: "cancelled",
          kdsSynced: false,
          cancelledAt: Date.now(),
          cancelReason: reason || "cancelled"
        };
        return hit;
      });
      localStorage.setItem(storeKey, JSON.stringify(next));
      return hit;
    } catch (_) {
      return null;
    }
  }

  /**
   * Re-push local bills that never reached KDS (pay-later OR paid but sync failed).
   * Pass { force: true } to retry even if marked synced.
   * Each write is time-capped so weak net cannot stall the POS.
   */
  async function pushUnpaidBillsToKitchen(opts) {
    const force = !!(opts && opts.force);
    const pending = [];
    try {
      const arr = JSON.parse(localStorage.getItem("kg_pos_bills_local_v1") || "[]");
      (arr || []).forEach((b) => {
        if (!b) return;
        if (b.status === "cancelled" || b.status === "void" || b.paymentStatus === "cancelled") return;
        if (!(b.items || []).length) return;
        // Never revive blocked/cancelled kitchen tickets
        try {
          const blocked = JSON.parse(sessionStorage.getItem("kg_pos_blocked_orders_v1") || "[]");
          const keys = [b.billId, b.id, b.billNo].map((x) => String(x || ""));
          if ((blocked || []).some((id) => keys.includes(String(id)))) return;
        } catch (_) {}
        const due = b.payLater || b.paymentStatus === "unpaid" || b.status === "pending_payment";
        // Unsynced kitchen tickets always; force only re-tries unpaid dues
        if (b.kdsSynced === true) {
          if (!force || !due) return;
        }
        const age = Date.now() - (Number(b.at) || new Date(b.at || 0).getTime() || Date.now());
        if (Number.isFinite(age) && age > 48 * 3600 * 1000) return;
        pending.push(b);
      });
    } catch (_) {}
    if (!pending.length) return { pushed: 0, failed: 0 };
    if (!isOnline()) return { pushed: 0, failed: pending.length, offline: true };
    const push = root.KG?.kdsClient?.pushOrderFromBill;
    if (typeof push !== "function") return { pushed: 0, failed: pending.length };
    let pushed = 0;
    let failed = 0;
    for (const bill of pending.slice(0, 12)) {
      try {
        const isDue =
          !!(bill.payLater || bill.paymentStatus === "unpaid" || bill.status === "pending_payment");
        const kdsBill = {
          ...bill,
          payLater: isDue,
          paymentStatus: isDue ? "unpaid" : bill.paymentStatus || "paid",
          cashierName: cashierName(),
          at: bill.at
            ? typeof bill.at === "number"
              ? new Date(bill.at).toISOString()
              : bill.at
            : new Date().toISOString(),
          channel: bill.channel || "takeaway"
        };
        await withTimeout(push.call(root.KG.kdsClient, kdsBill), 5000, "kds bg timeout");
        upsertLocalBill({
          ...bill,
          kdsSynced: true,
          payLater: isDue,
          paymentStatus: isDue ? "unpaid" : bill.paymentStatus || "paid"
        });
        pushed += 1;
      } catch (e) {
        console.warn("push kitchen pending failed", bill.billNo || bill.billId, e);
        failed += 1;
        // Stop the loop early on hard Firebase death — try again next tick
        if (/INTERNAL ASSERTION FAILED|Unexpected state/i.test(String(e?.message || ""))) break;
      }
    }
    return { pushed, failed };
  }

  let bgSyncTimer = null;
  let bgSyncRunning = false;

  async function runBackgroundSync() {
    if (bgSyncRunning) return;
    bgSyncRunning = true;
    try {
      if (!isOnline()) return;
      await syncQueue().catch(() => {});
      await pushUnpaidBillsToKitchen({ force: false }).catch(() => {});
    } finally {
      bgSyncRunning = false;
      try {
        root.KG.posUI?.syncIndicator?.();
      } catch (_) {}
    }
  }

  /** Keep POS usable on weak net — sync quietly every 15s + on reconnect */
  function startBackgroundSync() {
    if (bgSyncTimer) return;
    runBackgroundSync();
    bgSyncTimer = root.setInterval(runBackgroundSync, 20000);
    root.addEventListener?.("online", () => {
      logQuiet("back online — syncing");
      runBackgroundSync();
    });
    root.document?.addEventListener?.("visibilitychange", () => {
      if (root.document.visibilityState === "visible") runBackgroundSync();
    });
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
    collectPayment,
    pushUnpaidBillsToKitchen,
    markLocalBillCancelled,
    voidBill,
    syncQueue,
    startBackgroundSync,
    runBackgroundSync,
    withTimeout,
    nextBillNo,
    buildBillRecord,
    findLocalBill
  };

  root.KG = root.KG || {};
  root.KG.posCheckout = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
