const { validationResult } = require("express-validator");
const Order = require("../models/Order");
const Sale = require("../models/Sale");

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toDto(doc) {
  return {
    id: doc._id.toString(),
    date: doc.date,
    items: doc.items,
    notes: doc.notes,
    subtotal: doc.subtotal,
    tax: doc.tax,
    total: doc.total,
    payment: doc.payment,
    saleId: doc.saleId ? doc.saleId.toString() : "",
    createdAt: doc.createdAt
  };
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: "Validation failed", errors: errors.array() });

  try {
    const body = req.body || {};
    const date = String(body.date || "").trim();
    const items = Array.isArray(body.items) ? body.items : [];

    const normalizedItems = items
      .map((it) => ({
        menuItemId: it.menuItemId || undefined,
        name: String(it.name || "").trim(),
        qty: Math.max(1, Math.floor(num(it.qty) || 1)),
        price: Math.max(0, num(it.price)),
        note: String(it.note || "").trim()
      }))
      .filter((it) => it.name && Number.isFinite(it.price));

    if (!date) return res.status(400).json({ message: "date is required" });
    if (!normalizedItems.length) return res.status(400).json({ message: "At least 1 item required" });

    const subtotal = num(body.subtotal) || normalizedItems.reduce((s, it) => s + it.price * it.qty, 0);
    const tax = Math.max(0, num(body.tax));
    const total = num(body.total) || subtotal + tax;
    if (!Number.isFinite(total) || total < 0) return res.status(400).json({ message: "Invalid totals" });

    const cash = Math.max(0, num(body.payment?.cash));
    const online = Math.max(0, num(body.payment?.online));
    const paidSum = cash + online;
    if (Math.abs(paidSum - total) > 0.01) {
      return res.status(400).json({ message: "Payment mismatch: cash + online must equal total" });
    }

    // Create Sale in the existing split format
    const onlineAmount = online;
    const cashAmount = cash;
    const totalAmount = total;
    let method = "cash";
    if (cashAmount > 0 && onlineAmount > 0) method = "mixed";
    else if (onlineAmount > 0) method = "online";

    const saleNotesParts = [];
    if (body.notes) saleNotesParts.push(String(body.notes).trim());
    saleNotesParts.push(`POS Order (${normalizedItems.length} items)`);

    const sale = await Sale.create({
      userId: req.user.id,
      date,
      amount: totalAmount,
      method,
      cashAmount,
      swiggyAmount: 0,
      zomatoAmount: 0,
      otherOnlineAmount: onlineAmount,
      onlineAmount,
      totalAmount,
      notes: saleNotesParts.filter(Boolean).join(" | ")
    });

    const order = await Order.create({
      userId: req.user.id,
      date,
      items: normalizedItems,
      notes: String(body.notes || "").trim(),
      subtotal,
      tax,
      total,
      payment: { cash: cashAmount, online: onlineAmount },
      saleId: sale._id
    });

    return res.status(201).json({ order: toDto(order), saleId: sale._id.toString() });
  } catch (e) {
    return res.status(500).json({ message: "Failed to create order" });
  }
}

async function list(req, res) {
  try {
    const q = { userId: req.user.id };
    if (req.query.date) q.date = String(req.query.date);
    const orders = await Order.find(q).sort({ date: -1, createdAt: -1 }).limit(500);
    return res.json(orders.map(toDto));
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch orders" });
  }
}

module.exports = { create, list };

