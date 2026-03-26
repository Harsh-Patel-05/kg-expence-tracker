const { validationResult } = require("express-validator");
const Supplier = require("../models/Supplier");

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      name: String(it?.name || "").trim(),
      rate: Number(it?.rate || 0)
    }))
    .filter((it) => it.name)
    .map((it) => ({ name: it.name, rate: Number.isFinite(it.rate) && it.rate >= 0 ? it.rate : 0 }));
}

function toDto(s) {
  return {
    id: s._id.toString(),
    name: s.name,
    items: Array.isArray(s.items) ? s.items.map((it) => ({ name: it.name, rate: it.rate || 0 })) : []
  };
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const name = String(req.body.name).trim();
    const items = normalizeItems(req.body.items);
    try {
      await Supplier.create({ userId: req.user.id, name, items });
    } catch (e) {
      // Treat duplicates as idempotent success (helps when the UI retries on refresh)
      if (e.code !== 11000) throw e;
      // If supplier exists, merge/overwrite items if provided
      if (items.length) {
        await Supplier.updateOne({ userId: req.user.id, name }, { $set: { items } });
      }
    }
    const list = await Supplier.find({ userId: req.user.id }).sort({ name: 1 });
    return res.status(201).json({ items: list.map(toDto) });
  } catch (e) {
    return res.status(500).json({ message: "Failed to add supplier" });
  }
}

async function list(req, res) {
  try {
    const list = await Supplier.find({ userId: req.user.id }).sort({ name: 1 });
    return res.json({ items: list.map(toDto) });
  } catch (e) {
    return res.status(500).json({ message: "Failed to list suppliers" });
  }
}

async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const patch = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: "Name cannot be empty" });
      patch.name = name;
    }
    if (req.body.items !== undefined) {
      patch.items = normalizeItems(req.body.items);
    }

    const updated = await Supplier.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: patch },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Not found" });

    const list = await Supplier.find({ userId: req.user.id }).sort({ name: 1 });
    return res.json({ items: list.map(toDto) });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: "Supplier name already exists" });
    }
    return res.status(500).json({ message: "Failed to update supplier" });
  }
}

async function remove(req, res) {
  try {
    const s = await Supplier.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!s) return res.status(404).json({ message: "Not found" });
    const list = await Supplier.find({ userId: req.user.id }).sort({ name: 1 });
    return res.json({ items: list.map(toDto) });
  } catch (e) {
    return res.status(500).json({ message: "Failed to remove supplier" });
  }
}

module.exports = { create, list, update, remove };
