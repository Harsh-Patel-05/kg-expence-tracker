const { validationResult } = require("express-validator");
const Expense = require("../models/Expense");

function toDto(doc) {
  return {
    id: doc._id.toString(),
    date: doc.date,
    category: doc.category,
    type: doc.category,
    amount: doc.amount,
    status: doc.status,
    paymentMethod: doc.paymentMethod || "cash",
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
    const { date, category, amount, status, note, paymentMethod } = req.body;
    const expense = await Expense.create({
      userId: req.user.id,
      date,
      category: String(category).trim(),
      amount: Number(amount),
      status: status || "unpaid",
      paymentMethod: paymentMethod === "online" ? "online" : "cash",
      note: note || ""
    });
    return res.status(201).json(toDto(expense));
  } catch (e) {
    return res.status(500).json({ message: "Failed to add expense" });
  }
}

async function list(req, res) {
  try {
    const expenses = await Expense.find({ userId: req.user.id }).sort({ date: -1, createdAt: -1 });
    return res.json(expenses.map(toDto));
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch expenses" });
  }
}

async function update(req, res) {
  try {
    const doc = await Expense.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ message: "Not found" });
    if (req.body.status !== undefined) {
      doc.status = req.body.status === "paid" ? "paid" : "unpaid";
    }
    if (req.body.paymentMethod !== undefined) {
      doc.paymentMethod = req.body.paymentMethod === "online" ? "online" : "cash";
    }
    await doc.save();
    return res.json(toDto(doc));
  } catch (e) {
    return res.status(500).json({ message: "Failed to update expense" });
  }
}

async function remove(req, res) {
  try {
    const doc = await Expense.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json({ message: "Deleted" });
  } catch (e) {
    return res.status(500).json({ message: "Failed to delete expense" });
  }
}

module.exports = { create, list, update, remove };
