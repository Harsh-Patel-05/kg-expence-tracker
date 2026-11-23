/**
 * POS → Firestore sales + dailySalesSummary (idempotent).
 * Reuses existing sales field names for dashboard / balanceMath compatibility.
 */
(function (root) {
  "use strict";

  function businessDateISO(d, cutOffHour) {
    const cut = Number.isFinite(cutOffHour) ? cutOffHour : 4;
    const dt = d instanceof Date ? new Date(d.getTime()) : new Date();
    // Shift by cut-off: before 04:00 IST counts as previous calendar day
    const istOffsetMin = 5.5 * 60;
    const utc = dt.getTime() + dt.getTimezoneOffset() * 60000;
    const ist = new Date(utc + istOffsetMin * 60000);
    if (ist.getHours() < cut) ist.setDate(ist.getDate() - 1);
    const y = ist.getFullYear();
    const m = String(ist.getMonth() + 1).padStart(2, "0");
    const day = String(ist.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function paymentMethod(parts) {
    const cash = Number(parts.cashAmount) || 0;
    const online =
      (Number(parts.onlineAmount) || 0) ||
      (Number(parts.otherOnlineAmount) || 0) +
        (Number(parts.swiggyAmount) || 0) +
        (Number(parts.zomatoAmount) || 0);
    if (cash > 0 && online > 0) return "mixed";
    if (online > 0 && cash <= 0) return "online";
    return "cash";
  }

  /**
   * Map a settled POS bill to a sales document payload (no Firestore writes).
   */
  function mapBillToSale(bill, opts) {
    const o = opts || {};
    const cash = Number(bill.cashAmount) || 0;
    const swiggy = Number(bill.swiggyAmount) || 0;
    const zomato = Number(bill.zomatoAmount) || 0;
    const otherOnline = Number(bill.otherOnlineAmount != null ? bill.otherOnlineAmount : bill.onlineAmount) || 0;
    const onlineAmount = swiggy + zomato + otherOnline;
    const totalAmount =
      Number(bill.totalAmount != null ? bill.totalAmount : cash + onlineAmount) || 0;
    const date = bill.date || businessDateISO(new Date(), o.businessDayCutOff);
    const payload = {
      date,
      cashAmount: cash,
      swiggyAmount: swiggy,
      zomatoAmount: zomato,
      otherOnlineAmount: otherOnline,
      onlineAmount,
      totalAmount,
      method: bill.method || paymentMethod({ cashAmount: cash, otherOnlineAmount: otherOnline, swiggyAmount: swiggy, zomatoAmount: zomato }),
      source: bill.source || "pos",
      billId: bill.billId || bill.id,
      billNo: bill.billNo || "",
      orderType: bill.orderType || "takeaway",
      itemsCount: Number(bill.itemsCount) || (Array.isArray(bill.items) ? bill.items.length : 0),
      createdBy: bill.createdBy || "",
      status: bill.status || "settled",
      discountTotal: Number(bill.discountTotal) || 0,
      taxTotal: Number(bill.taxTotal) || 0,
      notes: bill.notes || `POS bill ${bill.billNo || ""}`.trim()
    };
    if (bill.countsAsRevenue === false) payload.countsAsRevenue = false;
    if (bill.revenueKind) payload.revenueKind = bill.revenueKind;
    if (bill.scheduledOrderId) payload.scheduledOrderId = bill.scheduledOrderId;
    return payload;
  }

  function aggregateIncrements(sale) {
    const cash = Number(sale.cashAmount) || 0;
    const swiggy = Number(sale.swiggyAmount) || 0;
    const zomato = Number(sale.zomatoAmount) || 0;
    const other = Number(sale.otherOnlineAmount) || 0;
    const online = other; // UPI/card bucket for dashboard chips
    const total = Number(sale.totalAmount) || cash + swiggy + zomato + other;
    const sign = sale.status === "void" ? -1 : 1;
    // Customer advances / refunds move cash but must not inflate completed-sale KPIs
    const countsRevenue = sale.countsAsRevenue !== false && sale.revenueKind !== "customer_advance";
    return {
      totalSales: countsRevenue ? sign * total : 0,
      cashSales: sign * cash,
      onlineSales: sign * online,
      swiggySales: sign * swiggy,
      zomatoSales: sign * zomato,
      billCount: countsRevenue ? sign * 1 : 0,
      cashBillCount: cash > 0 ? sign * 1 : 0,
      onlineBillCount: online > 0 ? sign * 1 : 0,
      discountTotal: countsRevenue ? sign * (Number(sale.discountTotal) || 0) : 0,
      taxTotal: countsRevenue ? sign * (Number(sale.taxTotal) || 0) : 0
    };
  }

  /**
   * Idempotent post: sale doc id = billId. Aggregates via FieldValue.increment.
   * Offline-safe when Firestore persistence is on.
   */
  async function postBillToSales(bill, deps) {
    const d = deps || {};
    const db = d.db || (typeof firebase !== "undefined" && firebase.firestore && firebase.firestore());
    if (!db) throw new Error("Firestore not ready");
    const sale = mapBillToSale(bill, d);
    const billId = String(sale.billId || "").trim();
    if (!billId) throw new Error("billId required for idempotent sales");

    const saleRef = db.collection("sales").doc(billId);
    const summaryRef = db.collection("dailySalesSummary").doc(sale.date);
    const incr = firebase.firestore.FieldValue.increment;
    const increments = aggregateIncrements(sale);

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(saleRef);
      if (existing.exists) {
        const st = existing.data()?.status;
        if (st !== "void") {
          // Already posted — no-op (idempotent)
          return { alreadyExists: true, saleId: billId, sale };
        }
      }
      tx.set(
        saleRef,
        {
          ...sale,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      const summaryPatch = {};
      Object.keys(increments).forEach((k) => {
        summaryPatch[k] = incr(increments[k]);
      });
      summaryPatch.date = sale.date;
      summaryPatch.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      tx.set(summaryRef, summaryPatch, { merge: true });
    });

    return { saleId: billId, sale, alreadyExists: false };
  }

  async function voidSaleForBill(billId, reason, deps) {
    const d = deps || {};
    const db = d.db || (typeof firebase !== "undefined" && firebase.firestore && firebase.firestore());
    if (!db) throw new Error("Firestore not ready");
    const saleRef = db.collection("sales").doc(String(billId));
    const incr = firebase.firestore.FieldValue.increment;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(saleRef);
      if (!snap.exists) throw new Error("Sale not found");
      const data = snap.data();
      if (data.status === "void") return;
      const sale = { ...data, status: "void" };
      const increments = aggregateIncrements(sale); // negative
      const summaryRef = db.collection("dailySalesSummary").doc(String(data.date));
      tx.update(saleRef, {
        status: "void",
        voidReason: reason || "",
        voidedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      const summaryPatch = {};
      Object.keys(increments).forEach((k) => {
        summaryPatch[k] = incr(increments[k]);
      });
      summaryPatch.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      tx.set(summaryRef, summaryPatch, { merge: true });
    });
  }

  /**
   * Rebuild dailySalesSummary from all sales docs (owner tool).
   */
  async function rebuildDailySummaries(deps) {
    const d = deps || {};
    const db = d.db || (typeof firebase !== "undefined" && firebase.firestore && firebase.firestore());
    if (!db) throw new Error("Firestore not ready");
    const snap = await db.collection("sales").get();
    const byDate = {};
    snap.forEach((doc) => {
      const s = doc.data() || {};
      if (s.status === "void") return;
      const date = String(s.date || "").slice(0, 10);
      if (!date) return;
      if (!byDate[date]) {
        byDate[date] = {
          date,
          totalSales: 0,
          cashSales: 0,
          onlineSales: 0,
          swiggySales: 0,
          zomatoSales: 0,
          billCount: 0,
          cashBillCount: 0,
          onlineBillCount: 0,
          discountTotal: 0,
          taxTotal: 0
        };
      }
      const row = byDate[date];
      const cash = Number(s.cashAmount) || 0;
      const swiggy = Number(s.swiggyAmount) || 0;
      const zomato = Number(s.zomatoAmount) || 0;
      const other = Number(s.otherOnlineAmount) || 0;
      const legacy = Number(s.onlineAmount) || 0;
      const upi = swiggy > 0 || zomato > 0 || other > 0 ? other : legacy;
      const total = Number(s.totalAmount) || cash + swiggy + zomato + upi;
      const countsRevenue = s.countsAsRevenue !== false && s.revenueKind !== "customer_advance";
      if (countsRevenue) row.totalSales += total;
      row.cashSales += cash;
      row.onlineSales += upi;
      row.swiggySales += swiggy;
      row.zomatoSales += zomato;
      if (countsRevenue) row.billCount += 1;
      if (cash > 0) row.cashBillCount += 1;
      if (upi > 0) row.onlineBillCount += 1;
      if (countsRevenue) row.discountTotal += Number(s.discountTotal) || 0;
      row.taxTotal += Number(s.taxTotal) || 0;
    });

    const batchSize = 400;
    const dates = Object.keys(byDate);
    for (let i = 0; i < dates.length; i += batchSize) {
      const batch = db.batch();
      dates.slice(i, i + batchSize).forEach((date) => {
        batch.set(db.collection("dailySalesSummary").doc(date), {
          ...byDate[date],
          rebuiltAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }
    return { days: dates.length };
  }

  const api = {
    businessDateISO,
    mapBillToSale,
    aggregateIncrements,
    postBillToSales,
    voidSaleForBill,
    rebuildDailySummaries,
    paymentMethod
  };

  root.KG = root.KG || {};
  root.KG.salesBridge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
