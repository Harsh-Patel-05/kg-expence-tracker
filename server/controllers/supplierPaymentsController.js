const { validationResult } = require("express-validator");
const SupplierPayment = require("../models/SupplierPayment");

function toDto(doc) {
  return {
    id: doc._id.toString(),
    date: doc.date,
    seller: doc.seller,
    amount: doc.amount,
    method: doc.method,
    note: doc.note || "",
    createdAt: doc.createdAt
  };
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const { date, seller, amount, note, method } = req.body;
    const pay = await SupplierPayment.create({
      userId: req.user.id,
      date,
      seller: String(seller).trim(),
      amount: Number(amount),
      method: method === "online" ? "online" : "cash",
      note: String(note || "").trim()
    });
    return res.status(201).json(toDto(pay));
  } catch (e) {
    return res.status(500).json({ message: "Failed to add payment" });
  }
}

async function list(req, res) {
  try {
    const payments = await SupplierPayment.find({ userId: req.user.id }).sort({ date: -1, createdAt: -1 });
    return res.json(payments.map(toDto));
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch payments" });
  }
}

async function remove(req, res) {
  try {
    const p = await SupplierPayment.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!p) return res.status(404).json({ message: "Not found" });
    return res.json({ message: "Deleted" });
  } catch (e) {
    return res.status(500).json({ message: "Failed to delete payment" });
  }
}

module.exports = { create, list, remove };

