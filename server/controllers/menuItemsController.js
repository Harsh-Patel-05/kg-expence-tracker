const { validationResult } = require("express-validator");
const MenuItem = require("../models/MenuItem");

function toDto(doc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    nameHi: doc.nameHi || "",
    price: doc.price,
    category: doc.category,
    imageUrl: doc.imageUrl,
    available: !!doc.available,
    createdAt: doc.createdAt
  };
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  try {
    const { name, nameHi, price, category, imageUrl, available } = req.body;
    const doc = await MenuItem.create({
      userId: req.user.id,
      name: String(name).trim(),
      nameHi: String(nameHi || "").trim(),
      price: Number(price),
      category: String(category || "General").trim() || "General",
      imageUrl: String(imageUrl || "").trim(),
      available: available !== undefined ? !!available : true
    });
    return res.status(201).json(toDto(doc));
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "Menu item already exists" });
    return res.status(500).json({ message: "Failed to add menu item" });
  }
}

async function bulkCreate(req, res) {
  const rows = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!rows.length) return res.status(400).json({ message: "No items provided" });
  try {
    const docs = rows
      .map((r) => ({
        userId: req.user.id,
        name: String(r?.name || "").trim(),
        nameHi: String(r?.nameHi || r?.name_hi || "").trim(),
        price: Number(r?.price || 0),
        category: String(r?.category || "General").trim() || "General",
        imageUrl: String(r?.imageUrl || "").trim(),
        available: r?.available !== undefined ? !!r.available : true
      }))
      .filter((d) => d.name && Number.isFinite(d.price) && d.price >= 0);

    if (!docs.length) return res.status(400).json({ message: "No valid rows" });

    // upsert-like behavior by name
    for (const d of docs) {
      await MenuItem.findOneAndUpdate(
        { userId: d.userId, name: d.name },
        { $set: d },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const list = await MenuItem.find({ userId: req.user.id }).sort({ category: 1, name: 1 });
    return res.json({ items: list.map(toDto) });
  } catch (e) {
    return res.status(500).json({ message: "Bulk upload failed" });
  }
}

async function list(req, res) {
  try {
    const list = await MenuItem.find({ userId: req.user.id }).sort({ category: 1, name: 1 });
    return res.json(list.map(toDto));
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch menu" });
  }
}

async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  try {
    const patch = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: "Name cannot be empty" });
      patch.name = name;
    }
    if (req.body.nameHi !== undefined) patch.nameHi = String(req.body.nameHi || "").trim();
    if (req.body.price !== undefined) patch.price = Number(req.body.price);
    if (req.body.category !== undefined) patch.category = String(req.body.category || "General").trim() || "General";
    if (req.body.imageUrl !== undefined) patch.imageUrl = String(req.body.imageUrl || "").trim();
    if (req.body.available !== undefined) patch.available = !!req.body.available;

    const doc = await MenuItem.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { $set: patch }, { new: true });
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json(toDto(doc));
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "Menu item name already exists" });
    return res.status(500).json({ message: "Failed to update menu item" });
  }
}

async function remove(req, res) {
  try {
    const doc = await MenuItem.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json({ message: "Deleted" });
  } catch (e) {
    return res.status(500).json({ message: "Failed to delete menu item" });
  }
}

async function deleteAll(req, res) {
  try {
    const r = await MenuItem.deleteMany({ userId: req.user.id });
    return res.json({ deletedCount: r.deletedCount });
  } catch (e) {
    return res.status(500).json({ message: "Failed to clear menu" });
  }
}

module.exports = { create, bulkCreate, list, update, remove, deleteAll };

