const { validationResult } = require("express-validator");
const Sale = require("../models/Sale");

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toDto(doc) {
  return {
    id: doc._id.toString(),
    date: doc.date,
    amount: doc.amount,
    method: doc.method,
    cashAmount: doc.cashAmount,
    swiggyAmount: doc.swiggyAmount,
    zomatoAmount: doc.zomatoAmount,
    otherOnlineAmount: doc.otherOnlineAmount,
    onlineAmount: doc.onlineAmount,
    totalAmount: doc.totalAmount,
    notes: doc.notes,
    createdAt: doc.createdAt
  };
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const body = req.body || {};
    const date = body.date;

    // New UI sends split amounts. Legacy UI sends { amount, method }.
    const cashAmount = num(body.cashAmount);
    const swiggyAmount = num(body.swiggyAmount);
    const zomatoAmount = num(body.zomatoAmount);
    const otherOnlineAmount = num(body.otherOnlineAmount);
    const onlineAmount = num(body.onlineAmount) || swiggyAmount + zomatoAmount + otherOnlineAmount;
    const totalAmount =
      num(body.totalAmount) ||
      (cashAmount + onlineAmount) ||
      num(body.amount);

    if (!(totalAmount >= 0) || !Number.isFinite(totalAmount)) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // Keep legacy fields populated so older parts (analytics) still work.
    let method = String(body.method || "").toLowerCase();
    if (!method) {
      if (cashAmount > 0 && onlineAmount > 0) method = "mixed";
      else if (onlineAmount > 0) method = "online";
      else method = "cash";
    }
    if (!["cash", "online", "mixed"].includes(method)) method = "mixed";

    const sale = await Sale.create({
      userId: req.user.id,
      date,
      amount: totalAmount,
      method,
      cashAmount,
      swiggyAmount,
      zomatoAmount,
      otherOnlineAmount,
      onlineAmount,
      totalAmount,
      notes: String(body.notes || "").trim()
    });
    return res.status(201).json(toDto(sale));
  } catch (e) {
    return res.status(500).json({ message: "Failed to add sale" });
  }
}

async function list(req, res) {
  try {
    const sales = await Sale.find({ userId: req.user.id }).sort({ date: -1, createdAt: -1 });
    return res.json(sales.map(toDto));
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch sales" });
  }
}

async function remove(req, res) {
  try {
    const sale = await Sale.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!sale) return res.status(404).json({ message: "Sale not found" });
    return res.json({ message: "Deleted" });
  } catch (e) {
    return res.status(500).json({ message: "Failed to delete sale" });
  }
}

module.exports = { create, list, remove };
