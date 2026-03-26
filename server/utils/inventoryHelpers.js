const Inventory = require("../models/Inventory");

/**
 * On purchase: add qty to inventory row for same item name (case-insensitive).
 * Creates row with unit "unit" if missing.
 */
async function addQtyFromPurchase(userId, itemName, qty) {
  const q = Number(qty) || 0;
  if (q <= 0) return;

  const trimmed = itemName.trim();
  const existing = await Inventory.findOne({
    userId,
    item: new RegExp(`^${escapeRegex(trimmed)}$`, "i")
  });

  if (existing) {
    existing.qty = Number(existing.qty) + q;
    await existing.save();
  } else {
    await Inventory.create({
      userId,
      item: trimmed,
      unit: "unit",
      qty: q,
      threshold: 0
    });
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { addQtyFromPurchase };
