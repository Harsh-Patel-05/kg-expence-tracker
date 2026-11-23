/**
 * Shared KDS Firestore helpers (manager SPA + POS bridge + kitchen PWA).
 */
(function (root) {
  "use strict";

  const COLLECTION = "kds_orders";
  const MENU = "kds_menu";
  const ACTIVE = ["waiting", "preparing", "ready"];
  const NEXT = {
    waiting: "preparing",
    preparing: "ready",
    ready: "served"
  };

  function db() {
    if (!root.firebase?.firestore) throw new Error("Firestore not ready");
    return root.firebase.firestore();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeOrderType(v) {
    const s = String(v || "Takeaway").trim().toLowerCase();
    if (s === "dine-in" || s === "dinein" || s === "dine_in") return "Dine-in";
    if (s === "delivery") return "Delivery";
    if (s === "swiggy") return "Swiggy";
    if (s === "zomato") return "Zomato";
    return "Takeaway";
  }

  function normalizeItem(raw, addedAt, isNew) {
    const it = raw || {};
    const strip = (n) =>
      String(n || "")
        .replace(/\s*[·\-–—]\s*Default\s*$/i, "")
        .replace(/\s*\(\s*Default\s*\)\s*$/i, "")
        .replace(/\s*\(\s*\d+(?:\.\d+)?\s*(?:kg|g|gm|gms)\s*\)\s*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    let variant = String(it.variant || it.variantLabel || "").trim();
    if (!variant || /^default$/i.test(variant)) variant = "";
    const nameEn = strip(it.nameEn || it.name_en || it.name || "");
    const nameHi = strip(it.nameHi || it.name_hi || "");
    const compact = (x) =>
      String(x || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/gms?/g, "g");
    if (variant && (compact(nameHi).includes(compact(variant)) || compact(nameEn).includes(compact(variant)))) {
      variant = "";
    }
    return {
      id: String(it.id || uid("item")),
      nameEn,
      nameHi,
      qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
      variant,
      itemNote: String(it.itemNote || it.item_note || it.note || "").trim(),
      addedAt: addedAt || nowIso(),
      isNew: isNew != null ? !!isNew : !!it.isNew
    };
  }

  function mapDoc(doc) {
    const d = doc.data ? doc.data() : doc;
    const id = String(doc.id || d.orderId || d.id || "");
    return {
      ...d,
      id,
      orderId: String(d.orderId || id),
      status: String(d.status || "").toLowerCase()
    };
  }

  function safeDocId(raw) {
    // Firestore doc ids cannot contain "/"
    return String(raw || uid("ord"))
      .trim()
      .replace(/\//g, "-")
      .slice(0, 700) || uid("ord");
  }

  async function createOrder(payload) {
    const body = payload || {};
    const orderId = safeDocId(body.orderId || body.order_id || uid("ord"));
    const createdAt = String(body.createdAt || body.created_time || nowIso());
    const items = (Array.isArray(body.items) ? body.items : []).map((it) =>
      normalizeItem(it, createdAt, false)
    );
    if (!items.length) throw new Error("items required");

    const ref = db().collection(COLLECTION).doc(orderId);
    const existing = await ref.get();

    const orderType = normalizeOrderType(body.orderType || body.order_type || body.channel);
    const platformOrderNo = String(body.platformOrderNo || body.platform_order_no || "").trim();
    const channel = String(body.channel || orderType || "takeaway").toLowerCase();
    const payLater = !!(body.payLater || body.pay_later || body.paymentStatus === "unpaid");
    const billId = String(body.billId || body.bill_id || "").trim();
    const grandTotal = Number(body.grandTotal || body.grand_total) || 0;
    const dailyNo = Number(body.dailyNo || body.daily_no || body.tokenNo || body.token_no) || 0;
    const tokenNo = Number(body.tokenNo || body.token_no || body.dailyNo || body.daily_no) || dailyNo || 0;

    // Retry / pay-later re-push: merge meta so ticket stays visible & unpaid badge sticks
    if (existing.exists) {
      const prev = existing.data() || {};
      const prevSt = String(prev.status || "").toLowerCase();
      // Never revive a cancelled ticket unless POS explicitly asks (prevents cancel→auto-respawn)
      const forceReopen = body.forceReopen === true || body.force_reopen === true;
      const reopen =
        forceReopen &&
        (["cancelled", "served", ""].includes(prevSt) || !ACTIVE.includes(prevSt));
      const patch = {
        billId: billId || prev.billId || "",
        payLater: prevSt === "cancelled" && !forceReopen ? !!prev.payLater : payLater,
        paymentStatus:
          prevSt === "cancelled" && !forceReopen
            ? String(prev.paymentStatus || "unpaid")
            : payLater
              ? "unpaid"
              : String(body.paymentStatus || prev.paymentStatus || "paid"),
        grandTotal: grandTotal || Number(prev.grandTotal) || 0,
        dailyNo: dailyNo || Number(prev.dailyNo) || 0,
        tokenNo: tokenNo || Number(prev.tokenNo) || 0,
        platformOrderNo: platformOrderNo || prev.platformOrderNo || "",
        channel: channel || prev.channel || "takeaway",
        orderType: orderType || prev.orderType || "Takeaway",
        orderNote: String(body.orderNote || body.order_note || prev.orderNote || "").trim(),
        updatedAt: nowIso(),
        beepFlag: prevSt === "cancelled" && !forceReopen ? false : true,
        lastEvent: reopen ? "reopened" : payLater ? "pay_later_sync" : "updated"
      };
      if (!(prevSt === "cancelled" && !forceReopen)) {
        patch.highlightUntil = new Date(Date.now() + 20000).toISOString();
      }
      if (reopen) {
        patch.status = "waiting";
        patch.cancelledAt = root.firebase.firestore.FieldValue.delete();
        patch.servedAt = root.firebase.firestore.FieldValue.delete();
        patch.payLater = payLater;
        patch.paymentStatus = payLater ? "unpaid" : patch.paymentStatus;
        patch.beepFlag = true;
        if (items.length) patch.items = items;
      }
      await ref.set(patch, { merge: true });
      const snap = await ref.get();
      return mapDoc(snap);
    }

    const doc = {
      orderId,
      tableNo: String(body.tableNo || body.table_no || "").trim(),
      orderType,
      channel,
      platformOrderNo,
      status: "waiting",
      items,
      orderNote: String(body.orderNote || body.order_note || "").trim(),
      waiterName: String(body.waiterName || body.waiter_name || "").trim(),
      billId,
      payLater,
      paymentStatus: payLater ? "unpaid" : "paid",
      grandTotal,
      dailyNo,
      tokenNo,
      createdAt,
      updatedAt: nowIso(),
      statusHistory: [{ from: null, to: "waiting", at: createdAt, by: body.by || "app" }],
      liveNotes: [],
      highlightUntil: new Date(Date.now() + 20000).toISOString(),
      beepFlag: true,
      lastEvent: "created",
      prepStartedAt: null,
      readyAt: null,
      servedAt: null,
      cancelledAt: null
    };
    const clean = JSON.parse(JSON.stringify(doc)); // Firestore rejects undefined
    await ref.set(clean);
    return { id: orderId, ...clean };
  }

  async function addItems(orderId, items, by) {
    const ref = db().collection(COLLECTION).doc(String(orderId));
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Order not found");
    const data = snap.data();
    if (!ACTIVE.includes(data.status)) throw new Error("Order is closed");
    const at = nowIso();
    const incoming = (items || []).map((it) => normalizeItem(it, at, true));
    const patch = {
      items: [...(data.items || []), ...incoming],
      updatedAt: at,
      highlightUntil: new Date(Date.now() + 20000).toISOString(),
      beepFlag: true,
      lastEvent: "items_added",
      lastBy: by || "app"
    };
    await ref.update(patch);
    return { id: orderId, ...data, ...patch };
  }

  async function addNote(orderId, text, from) {
    const ref = db().collection(COLLECTION).doc(String(orderId));
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Order not found");
    const data = snap.data();
    if (data.status === "served" || data.status === "cancelled") throw new Error("Order is closed");
    const at = nowIso();
    const note = {
      id: uid("note"),
      text: String(text || "").trim(),
      from: String(from || "app").trim(),
      createdAt: at,
      isNew: true
    };
    if (!note.text) throw new Error("note required");
    const patch = {
      liveNotes: [...(data.liveNotes || []), note],
      updatedAt: at,
      highlightUntil: new Date(Date.now() + 20000).toISOString(),
      beepFlag: true,
      lastEvent: "note"
    };
    await ref.update(patch);
    return { id: orderId, ...data, ...patch };
  }

  async function setStatus(orderId, status, by) {
    const next = String(status || "").toLowerCase();
    const ref = db().collection(COLLECTION).doc(String(orderId));
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Order not found");
    const data = snap.data();
    const at = nowIso();
    const patch = {
      status: next,
      updatedAt: at,
      statusHistory: [
        ...(data.statusHistory || []),
        { from: data.status, to: next, at, by: by || "app" }
      ],
      lastEvent: "status",
      beepFlag: next === "ready" || next === "waiting"
    };
    if (next === "preparing" && !data.prepStartedAt) patch.prepStartedAt = at;
    if (next === "ready") patch.readyAt = at;
    if (next === "served") patch.servedAt = at;
    if (next === "cancelled") patch.cancelledAt = at;
    await ref.update(patch);
    return { id: orderId, ...data, ...patch };
  }

  async function advanceStatus(orderId, by) {
    const snap = await db().collection(COLLECTION).doc(String(orderId)).get();
    if (!snap.exists) throw new Error("Order not found");
    const cur = snap.data().status;
    const next = NEXT[cur];
    if (!next) throw new Error("Cannot advance from " + cur);
    return setStatus(orderId, next, by);
  }

  async function undoStatus(orderId, by) {
    const ref = db().collection(COLLECTION).doc(String(orderId));
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Order not found");
    const data = snap.data();
    const hist = data.statusHistory || [];
    if (hist.length < 2) throw new Error("Nothing to undo");
    const last = hist[hist.length - 1];
    const prev = last.from;
    if (!prev) throw new Error("Nothing to undo");
    const at = nowIso();
    const patch = {
      status: prev,
      updatedAt: at,
      statusHistory: [
        ...hist,
        { from: data.status, to: prev, at, by: by || "undo", undo: true }
      ],
      lastEvent: "undo"
    };
    await ref.update(patch);
    return { id: orderId, ...data, ...patch };
  }

  async function cancelOrder(orderId, reason, by) {
    const snap = await db().collection(COLLECTION).doc(String(orderId)).get();
    if (!snap.exists) throw new Error("Order not found");
    const st = String(snap.data().status || "").toLowerCase();
    // Only brand-new waiting tickets can be cancelled — not preparing / ready
    if (st !== "waiting") {
      throw new Error(
        st === "preparing" || st === "ready"
          ? "Only waiting orders can be cancelled"
          : "Order cannot be cancelled"
      );
    }
    return setStatus(orderId, "cancelled", by || reason || "cancel");
  }

  /** Mark kitchen ticket as paid after Pay-later collect */
  async function markPaid(orderId, by) {
    const ref = db().collection(COLLECTION).doc(String(orderId));
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Order not found");
    const at = nowIso();
    await ref.update({
      payLater: false,
      paymentStatus: "paid",
      paidAt: at,
      updatedAt: at,
      lastEvent: "paid",
      paidBy: by || "pos"
    });
    return { id: orderId, ...snap.data(), payLater: false, paymentStatus: "paid" };
  }

  function subscribeActive(onChange, onError) {
    const cutoffMs = Date.now() - 90 * 86400000;

    function emit(snap) {
      const orders = snap.docs
        .map(mapDoc)
        .filter((o) => {
          const st = String(o.status || "").toLowerCase();
          // Always keep live kitchen tickets; include recent closed for POS/KDS flash events
          if (!ACTIVE.includes(st) && st !== "served" && st !== "cancelled") return false;
          if (!ACTIVE.includes(st)) {
            const u = new Date(o.updatedAt || o.createdAt || 0).getTime();
            if (Number.isFinite(u) && Date.now() - u > 10 * 60 * 1000) return false;
          }
          if (!o.createdAt) return true;
          const t = new Date(o.createdAt).getTime();
          return !Number.isFinite(t) || t >= cutoffMs;
        })
        .sort((a, b) =>
          String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))
        );
      onChange(orders);
    }

    let unsub = null;
    let stage = 0;

    const listenPlain = () => {
      stage = 3;
      unsub = db()
        .collection(COLLECTION)
        .limit(500)
        .onSnapshot(emit, (err2) => {
          if (typeof onError === "function") onError(err2);
          else console.error(err2);
        });
    };

    const listenOrderBy = () => {
      stage = 2;
      unsub = db()
        .collection(COLLECTION)
        .orderBy("updatedAt", "desc")
        .limit(250)
        .onSnapshot(emit, (err) => {
          console.warn("KDS orderBy listen failed, falling back", err?.message || err);
          try {
            if (unsub) unsub();
          } catch (_) {}
          if (stage === 2) listenPlain();
        });
    };

    // Primary: every waiting/preparing/ready ticket (pay-later included; no cap that drops new bills)
    const listenStatusIn = () => {
      stage = 1;
      unsub = db()
        .collection(COLLECTION)
        .where("status", "in", ACTIVE)
        .onSnapshot(emit, (err) => {
          console.warn("KDS status-in listen failed, falling back", err?.message || err);
          try {
            if (unsub) unsub();
          } catch (_) {}
          if (stage === 1) listenOrderBy();
        });
    };

    listenStatusIn();

    return () => {
      try {
        if (unsub) unsub();
      } catch (_) {}
    };
  }

  async function listMenu() {
    const snap = await db().collection(MENU).limit(500).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.nameEn || "").localeCompare(String(b.nameEn || "")));
  }

  async function upsertMenuItem(item) {
    const id = String(item.id || uid("menu"));
    const doc = {
      nameEn: String(item.nameEn || "").trim(),
      nameHi: String(item.nameHi || "").trim(),
      category: String(item.category || "").trim(),
      active: item.active !== false,
      updatedAt: nowIso()
    };
    await db().collection(MENU).doc(id).set(doc, { merge: true });
    return { id, ...doc };
  }

  async function clearBeep(orderId) {
    await db().collection(COLLECTION).doc(String(orderId)).update({
      beepFlag: false,
      updatedAt: nowIso()
    });
  }

  async function clearItemHighlights(orderId) {
    const ref = db().collection(COLLECTION).doc(String(orderId));
    const snap = await ref.get();
    if (!snap.exists) return;
    const data = snap.data();
    const items = (data.items || []).map((it) => ({ ...it, isNew: false }));
    const liveNotes = (data.liveNotes || []).map((n) => ({ ...n, isNew: false }));
    await ref.update({ items, liveNotes, highlightUntil: null, lastEvent: "ack" });
  }

  async function pruneOlderThan(days) {
    const d = Math.max(1, Number(days) || 90);
    const cutoff = new Date(Date.now() - d * 86400000).toISOString();
    const snap = await db()
      .collection(COLLECTION)
      .where("updatedAt", "<", cutoff)
      .limit(200)
      .get();
    const batch = db().batch();
    let n = 0;
    snap.docs.forEach((doc) => {
      const st = doc.data().status;
      if (st === "served" || st === "cancelled") {
        batch.delete(doc.ref);
        n += 1;
      }
    });
    if (n) await batch.commit();
    return n;
  }

  function computeReports(orders) {
    const list = orders || [];
    const completed = list.filter((o) => o.readyAt && o.createdAt);
    const prepMs = completed
      .map((o) => new Date(o.readyAt).getTime() - new Date(o.createdAt).getTime())
      .filter((n) => Number.isFinite(n) && n >= 0);
    const avgPrepMin = prepMs.length
      ? prepMs.reduce((a, b) => a + b, 0) / prepMs.length / 60000
      : 0;

    const byHour = {};
    list.forEach((o) => {
      if (!o.createdAt) return;
      const h = new Date(o.createdAt).getHours();
      byHour[h] = (byHour[h] || 0) + 1;
    });

    const delayed = list.filter((o) => {
      if (!ACTIVE.includes(o.status) || !o.createdAt) return false;
      return Date.now() - new Date(o.createdAt).getTime() > 20 * 60000;
    });

    return {
      avgPrepMin: Math.round(avgPrepMin * 10) / 10,
      ordersPerHour: byHour,
      delayedCount: delayed.length,
      delayed,
      total: list.length,
      completed: completed.length
    };
  }

  root.KG = root.KG || {};
  root.KG.kdsStore = {
    COLLECTION,
    MENU,
    ACTIVE,
    NEXT,
    createOrder,
    addItems,
    addNote,
    setStatus,
    advanceStatus,
    undoStatus,
    cancelOrder,
    markPaid,
    subscribeActive,
    listMenu,
    upsertMenuItem,
    clearBeep,
    clearItemHighlights,
    pruneOlderThan,
    computeReports,
    normalizeOrderType,
    normalizeItem
  };
})(typeof window !== "undefined" ? window : globalThis);
