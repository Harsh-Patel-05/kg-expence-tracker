const crypto = require("crypto");
const { getFirestore, isFirebaseEnabled } = require("../config/firebaseAdmin");

const COLLECTION = "kds_orders";
const SETTINGS = "kds_settings";
const RETENTION_DAYS = 90;

const STATUSES = ["waiting", "preparing", "ready", "served", "cancelled"];
const ACTIVE = ["waiting", "preparing", "ready"];

function dbOrFail(res) {
  if (!isFirebaseEnabled()) {
    res.status(503).json({
      message: "Firebase Admin not configured. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS."
    });
    return null;
  }
  return getFirestore();
}

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeOrderType(v) {
  const s = String(v || "Takeaway").trim().toLowerCase();
  if (s === "dine-in" || s === "dinein" || s === "dine_in") return "Dine-in";
  if (s === "delivery") return "Delivery";
  if (s === "swiggy") return "Swiggy";
  if (s === "zomato") return "Zomato";
  return "Takeaway";
}

function normalizeItem(raw, addedAt) {
  const it = raw || {};
  return {
    id: String(it.id || uid("item")),
    nameEn: String(it.name_en || it.nameEn || it.name || "").trim(),
    nameHi: String(it.name_hi || it.nameHi || "").trim(),
    qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
    variant: String(it.variant || it.variantLabel || "").trim(),
    itemNote: String(it.item_note || it.itemNote || it.note || "").trim(),
    addedAt: addedAt || nowIso(),
    isNew: !!it.isNew
  };
}

function toPublic(doc) {
  if (!doc) return null;
  const d = typeof doc.data === "function" ? { id: doc.id, ...doc.data() } : doc;
  return {
    order_id: d.orderId || d.id,
    table_no: d.tableNo || "",
    order_type: d.orderType || "Takeaway",
    status: d.status || "waiting",
    items: (d.items || []).map((it) => ({
      id: it.id,
      name_en: it.nameEn,
      name_hi: it.nameHi,
      qty: it.qty,
      variant: it.variant,
      item_note: it.itemNote,
      is_new: !!it.isNew
    })),
    order_note: d.orderNote || "",
    waiter_name: d.waiterName || "",
    created_time: d.createdAt || "",
    updated_at: d.updatedAt || "",
    live_notes: (d.liveNotes || []).map((n) => ({
      id: n.id,
      text: n.text,
      from: n.from,
      created_at: n.createdAt,
      is_new: !!n.isNew
    })),
    highlight_until: d.highlightUntil || null,
    prep_started_at: d.prepStartedAt || null,
    ready_at: d.readyAt || null,
    served_at: d.servedAt || null
  };
}

async function fireReadyWebhook(order) {
  const url = String(process.env.KDS_READY_WEBHOOK_URL || "").trim();
  if (!url || !order) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "order_ready",
        order_id: order.orderId || order.id,
        table_no: order.tableNo || "",
        order_type: order.orderType,
        status: "ready",
        ready_at: order.readyAt || nowIso(),
        waiter_name: order.waiterName || ""
      })
    });
  } catch (e) {
    console.warn("KDS ready webhook failed:", e.message);
  }
}

async function create(req, res) {
  const db = dbOrFail(res);
  if (!db) return;

  try {
    const body = req.body || {};
    const orderId = String(body.order_id || body.orderId || uid("ord")).trim();
    const createdAt = String(body.created_time || body.createdAt || nowIso());
    const items = (Array.isArray(body.items) ? body.items : []).map((it) =>
      normalizeItem(it, createdAt)
    );
    if (!items.length) {
      return res.status(400).json({ message: "items required" });
    }

    const ref = db.collection(COLLECTION).doc(orderId);
    const existing = await ref.get();
    if (existing.exists) {
      return res.status(409).json({ message: "Order already exists", order: toPublic(existing) });
    }

    const orderType = normalizeOrderType(body.order_type || body.orderType || body.channel);
    const platformOrderNo = String(
      body.platform_order_no || body.platformOrderNo || body.external_order_id || ""
    ).trim();
    const channel = String(body.channel || orderType || "takeaway").toLowerCase();

    const doc = {
      orderId,
      tableNo: String(body.table_no || body.tableNo || "").trim(),
      orderType,
      channel,
      platformOrderNo,
      status: "waiting",
      items,
      orderNote: String(body.order_note || body.orderNote || "").trim(),
      waiterName: String(body.waiter_name || body.waiterName || "").trim(),
      createdAt,
      updatedAt: nowIso(),
      statusHistory: [{ from: null, to: "waiting", at: createdAt, by: "api" }],
      liveNotes: [],
      highlightUntil: new Date(Date.now() + 15000).toISOString(),
      beepFlag: true,
      prepStartedAt: null,
      readyAt: null,
      servedAt: null,
      cancelledAt: null
    };

    await ref.set(doc);
    return res.status(201).json({ order: toPublic({ id: orderId, ...doc }) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message || "Failed to create order" });
  }
}

/**
 * Partner / aggregator intake (Zomato, Swiggy, delivery apps).
 * Use when mapping a Zomato Partner webhook or middleware into KDS.
 * Shows the platform order number on the kitchen board.
 *
 * POST /api/kds/partner-orders
 * {
 *   "channel": "zomato",
 *   "platform_order_no": "Z123456789",
 *   "items": [{ "name_en": "Misal Pav", "qty": 1 }],
 *   "order_note": "extra spicy"
 * }
 */
async function partnerCreate(req, res) {
  const body = req.body || {};
  const channel = String(body.channel || body.order_type || body.orderType || "zomato").toLowerCase();
  const platformOrderNo = String(
    body.platform_order_no || body.platformOrderNo || body.external_order_id || body.order_id || ""
  ).trim();
  if (!platformOrderNo) {
    return res.status(400).json({ message: "platform_order_no required (Zomato/Swiggy order id)" });
  }
  req.body = {
    ...body,
    order_id: body.order_id || `${channel}-${platformOrderNo}`,
    order_type: channel.includes("swiggy") ? "Swiggy" : channel.includes("zomato") ? "Zomato" : "Delivery",
    channel,
    platform_order_no: platformOrderNo,
    table_no: "",
    waiter_name: body.waiter_name || body.waiterName || channel
  };
  return create(req, res);
}

async function addItems(req, res) {
  const db = dbOrFail(res);
  if (!db) return;
  try {
    const id = String(req.params.id || "").trim();
    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: "Order not found" });
    const data = snap.data();
    if (!ACTIVE.includes(data.status)) {
      return res.status(400).json({ message: "Cannot add items to a closed order" });
    }
    const addedAt = nowIso();
    const incoming = (Array.isArray(req.body?.items) ? req.body.items : []).map((it) =>
      normalizeItem({ ...it, isNew: true }, addedAt)
    );
    if (!incoming.length) return res.status(400).json({ message: "items required" });

    const items = [...(data.items || []), ...incoming];
    const patch = {
      items,
      updatedAt: addedAt,
      highlightUntil: new Date(Date.now() + 20000).toISOString(),
      beepFlag: true,
      lastEvent: "items_added"
    };
    await ref.update(patch);
    return res.json({ order: toPublic({ id, ...data, ...patch }) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message || "Failed to add items" });
  }
}

async function addNote(req, res) {
  const db = dbOrFail(res);
  if (!db) return;
  try {
    const id = String(req.params.id || "").trim();
    const text = String(req.body?.note || req.body?.text || req.body?.order_note || "").trim();
    if (!text) return res.status(400).json({ message: "note required" });

    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: "Order not found" });
    const data = snap.data();
    if (data.status === "served" || data.status === "cancelled") {
      return res.status(400).json({ message: "Cannot note a closed order" });
    }

    const at = nowIso();
    const note = {
      id: uid("note"),
      text,
      from: String(req.body?.from || "api").trim(),
      createdAt: at,
      isNew: true
    };
    const liveNotes = [...(data.liveNotes || []), note];
    // Also append to orderNote if body.order_note style replace requested
    let orderNote = data.orderNote || "";
    if (req.body?.replace_order_note) {
      orderNote = text;
    } else if (req.body?.append_order_note) {
      orderNote = orderNote ? `${orderNote} | ${text}` : text;
    }

    const patch = {
      liveNotes,
      orderNote,
      updatedAt: at,
      highlightUntil: new Date(Date.now() + 20000).toISOString(),
      beepFlag: true,
      lastEvent: "note"
    };
    await ref.update(patch);
    return res.json({ order: toPublic({ id, ...data, ...patch }) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message || "Failed to add note" });
  }
}

async function cancel(req, res) {
  const db = dbOrFail(res);
  if (!db) return;
  try {
    const id = String(req.params.id || "").trim();
    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: "Order not found" });
    const data = snap.data();
    if (data.status === "cancelled") {
      return res.json({ order: toPublic(snap) });
    }
    const at = nowIso();
    const patch = {
      status: "cancelled",
      cancelledAt: at,
      updatedAt: at,
      statusHistory: [
        ...(data.statusHistory || []),
        { from: data.status, to: "cancelled", at, by: "api", reason: String(req.body?.reason || "") }
      ],
      beepFlag: true,
      lastEvent: "cancelled"
    };
    await ref.update(patch);
    return res.json({ order: toPublic({ id, ...data, ...patch }) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message || "Failed to cancel" });
  }
}

async function setStatus(req, res) {
  const db = dbOrFail(res);
  if (!db) return;
  try {
    const id = String(req.params.id || "").trim();
    const next = String(req.body?.status || "").trim().toLowerCase();
    if (!STATUSES.includes(next)) {
      return res.status(400).json({ message: `status must be one of: ${STATUSES.join(", ")}` });
    }
    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: "Order not found" });
    const data = snap.data();
    const at = nowIso();
    const patch = {
      status: next,
      updatedAt: at,
      statusHistory: [
        ...(data.statusHistory || []),
        { from: data.status, to: next, at, by: String(req.body?.by || "api") }
      ],
      lastEvent: "status"
    };
    if (next === "preparing" && !data.prepStartedAt) patch.prepStartedAt = at;
    if (next === "ready") {
      patch.readyAt = at;
      patch.beepFlag = true;
    }
    if (next === "served") patch.servedAt = at;
    if (next === "cancelled") patch.cancelledAt = at;

    await ref.update(patch);
    const merged = { id, ...data, ...patch };
    if (next === "ready") await fireReadyWebhook(merged);
    return res.json({ order: toPublic(merged) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message || "Failed to update status" });
  }
}

async function list(req, res) {
  const db = dbOrFail(res);
  if (!db) return;
  try {
    const status = req.query.status ? String(req.query.status) : "";
    const activeOnly = String(req.query.active || "") === "1";
    let q = db.collection(COLLECTION).orderBy("createdAt", "desc").limit(200);
    const snap = await q.get();
    let rows = snap.docs.map((d) => toPublic(d));
    if (status) rows = rows.filter((r) => r.status === status);
    if (activeOnly) rows = rows.filter((r) => ACTIVE.includes(r.status));
    return res.json({ orders: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message || "Failed to list orders" });
  }
}

async function getOne(req, res) {
  const db = dbOrFail(res);
  if (!db) return;
  try {
    const id = String(req.params.id || "").trim();
    const snap = await db.collection(COLLECTION).doc(id).get();
    if (!snap.exists) return res.status(404).json({ message: "Order not found" });
    return res.json({ order: toPublic(snap) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message || "Failed to get order" });
  }
}

async function pruneOld(req, res) {
  const db = dbOrFail(res);
  if (!db) return;
  try {
    const days = Math.max(1, Number(req.body?.days) || RETENTION_DAYS);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const snap = await db.collection(COLLECTION).where("updatedAt", "<", cutoff).limit(400).get();
    const batch = db.batch();
    let n = 0;
    snap.docs.forEach((d) => {
      const st = d.data().status;
      if (st === "served" || st === "cancelled") {
        batch.delete(d.ref);
        n += 1;
      }
    });
    if (n) await batch.commit();
    return res.json({ deleted: n, cutoff });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message || "Prune failed" });
  }
}

module.exports = {
  create,
  partnerCreate,
  addItems,
  addNote,
  cancel,
  setStatus,
  list,
  getOne,
  pruneOld,
  COLLECTION,
  SETTINGS,
  toPublic
};
