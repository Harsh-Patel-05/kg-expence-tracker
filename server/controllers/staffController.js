const { validationResult } = require("express-validator");
const Staff = require("../models/Staff");

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const name = String(req.body.name).trim();
    await Staff.create({ userId: req.user.id, name });
    const list = await Staff.find({ userId: req.user.id }).sort({ name: 1 });
    return res.status(201).json({ items: list.map((s) => ({ id: s._id.toString(), name: s.name })) });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: "Staff already exists" });
    }
    return res.status(500).json({ message: "Failed to add staff" });
  }
}

async function list(req, res) {
  try {
    const list = await Staff.find({ userId: req.user.id }).sort({ name: 1 });
    return res.json({ items: list.map((s) => ({ id: s._id.toString(), name: s.name })) });
  } catch (e) {
    return res.status(500).json({ message: "Failed to list staff" });
  }
}

async function remove(req, res) {
  try {
    const s = await Staff.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!s) return res.status(404).json({ message: "Not found" });
    const list = await Staff.find({ userId: req.user.id }).sort({ name: 1 });
    return res.json({ items: list.map((s) => ({ id: s._id.toString(), name: s.name })) });
  } catch (e) {
    return res.status(500).json({ message: "Failed to remove staff" });
  }
}

module.exports = { create, list, remove };
