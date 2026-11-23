const { validationResult } = require("express-validator");
const Salary = require("../models/Salary");

function toDto(doc) {
  return {
    id: doc._id.toString(),
    month: doc.month,
    name: doc.name,
    amount: doc.amount,
    status: doc.status,
    paymentMethod: doc.paymentMethod || "cash",
    paidAt: doc.paidAt || "",
    createdAt: doc.createdAt
  };
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const { month, name, amount, status, paymentMethod, paidAt } = req.body;
    const salary = await Salary.findOneAndUpdate(
      { userId: req.user.id, month, name: String(name).trim() },
      {
        amount: Number(amount),
        status: status || "unpaid",
        paymentMethod: paymentMethod === "online" ? "online" : "cash",
        paidAt: typeof paidAt === "string" ? paidAt : ""
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.status(201).json(toDto(salary));
  } catch (e) {
    return res.status(500).json({ message: "Failed to save salary" });
  }
}

async function list(req, res) {
  try {
    const rows = await Salary.find({ userId: req.user.id }).sort({ month: -1, createdAt: -1 });
    return res.json(rows.map(toDto));
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch salaries" });
  }
}

async function update(req, res) {
  try {
    const doc = await Salary.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ message: "Not found" });
    if (req.body.status !== undefined) {
      doc.status = req.body.status === "paid" ? "paid" : "unpaid";
    }
    if (req.body.paymentMethod !== undefined) {
      doc.paymentMethod = req.body.paymentMethod === "online" ? "online" : "cash";
    }
    if (req.body.paidAt !== undefined) {
      doc.paidAt = typeof req.body.paidAt === "string" ? req.body.paidAt : "";
    }
    await doc.save();
    return res.json(toDto(doc));
  } catch (e) {
    return res.status(500).json({ message: "Failed to update salary" });
  }
}

async function remove(req, res) {
  try {
    const doc = await Salary.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json({ message: "Deleted" });
  } catch (e) {
    return res.status(500).json({ message: "Failed to delete salary" });
  }
}

module.exports = { create, list, update, remove };
