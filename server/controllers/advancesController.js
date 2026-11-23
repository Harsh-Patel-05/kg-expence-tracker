const { validationResult } = require("express-validator");
const Advance = require("../models/Advance");

function toDto(doc) {
  return {
    id: doc._id.toString(),
    date: doc.date,
    month: doc.month,
    name: doc.name,
    amount: doc.amount,
    method: doc.method || "cash",
    createdAt: doc.createdAt
  };
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const { date, month, name, amount, method } = req.body;
    const row = await Advance.create({
      userId: req.user.id,
      date,
      month,
      name: String(name).trim(),
      amount: Number(amount),
      method: method === "online" ? "online" : "cash"
    });
    return res.status(201).json(toDto(row));
  } catch (e) {
    return res.status(500).json({ message: "Failed to add advance" });
  }
}

async function list(req, res) {
  try {
    const rows = await Advance.find({ userId: req.user.id }).sort({ date: -1, createdAt: -1 });
    return res.json(rows.map(toDto));
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch advances" });
  }
}

async function remove(req, res) {
  try {
    const row = await Advance.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!row) return res.status(404).json({ message: "Not found" });
    return res.json({ message: "Deleted" });
  } catch (e) {
    return res.status(500).json({ message: "Failed to delete advance" });
  }
}

module.exports = { create, list, remove };
