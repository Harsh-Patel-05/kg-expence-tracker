const { validationResult } = require("express-validator");
const Inventory = require("../models/Inventory");

function toDto(doc) {
  return {
    id: doc._id.toString(),
    item: doc.item,
    unit: doc.unit,
    qty: doc.qty,
    threshold: doc.threshold,
    createdAt: doc.createdAt,
    lowStock: Number(doc.qty) <= Number(doc.threshold)
  };
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const { item, unit, qty, threshold } = req.body;
    const name = String(item).trim();
    let inv = await Inventory.findOne({
      userId: req.user.id,
      item: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
    });
    if (inv) {
      inv.unit = unit || inv.unit;
      inv.qty = qty !== undefined ? Number(qty) : inv.qty;
      inv.threshold = threshold !== undefined ? Number(threshold) : inv.threshold;
      await inv.save();
    } else {
      inv = await Inventory.create({
        userId: req.user.id,
        item: name,
        unit: unit || "unit",
        qty: Number(qty) || 0,
        threshold: Number(threshold) || 0
      });
    }
    return res.status(201).json(toDto(inv));
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: "Item already exists; use PUT to update" });
    }
    return res.status(500).json({ message: "Failed to save inventory" });
  }
}

async function list(req, res) {
  try {
    const items = await Inventory.find({ userId: req.user.id }).sort({ item: 1 });
    return res.json(items.map(toDto));
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch inventory" });
  }
}

async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const { item, unit, qty, threshold } = req.body;
    const inv = await Inventory.findOne({ _id: req.params.id, userId: req.user.id });
    if (!inv) return res.status(404).json({ message: "Inventory item not found" });
    if (item !== undefined) inv.item = String(item).trim();
    if (unit !== undefined) inv.unit = unit;
    if (qty !== undefined) inv.qty = Number(qty);
    if (threshold !== undefined) inv.threshold = Number(threshold);
    await inv.save();
    return res.json(toDto(inv));
  } catch (e) {
    return res.status(500).json({ message: "Failed to update inventory" });
  }
}

async function remove(req, res) {
  try {
    const inv = await Inventory.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!inv) return res.status(404).json({ message: "Not found" });
    return res.json({ message: "Deleted" });
  } catch (e) {
    return res.status(500).json({ message: "Failed to delete inventory" });
  }
}

module.exports = { create, list, update, remove };
