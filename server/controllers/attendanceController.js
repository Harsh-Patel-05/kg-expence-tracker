const { validationResult } = require("express-validator");
const Attendance = require("../models/Attendance");

function toDto(doc) {
  return {
    id: doc._id.toString(),
    date: doc.date,
    name: doc.name,
    status: doc.status,
    createdAt: doc.createdAt
  };
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const { date, name, status } = req.body;
    const row = await Attendance.create({
      userId: req.user.id,
      date,
      name: String(name).trim(),
      status: status || "present"
    });
    return res.status(201).json(toDto(row));
  } catch (e) {
    return res.status(500).json({ message: "Failed to add attendance" });
  }
}

async function list(req, res) {
  try {
    const rows = await Attendance.find({ userId: req.user.id }).sort({ date: -1, createdAt: -1 });
    return res.json(rows.map(toDto));
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch attendance" });
  }
}

async function remove(req, res) {
  try {
    const row = await Attendance.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!row) return res.status(404).json({ message: "Not found" });
    return res.json({ message: "Deleted" });
  } catch (e) {
    return res.status(500).json({ message: "Failed to delete attendance" });
  }
}

module.exports = { create, list, remove };
