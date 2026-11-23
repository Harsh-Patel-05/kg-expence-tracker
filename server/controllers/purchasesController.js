const { validationResult } = require("express-validator");
const Purchase = require("../models/Purchase");
const { addQtyFromPurchase } = require("../utils/inventoryHelpers");

function toDto(doc) {
  return {
    id: doc._id.toString(),
    date: doc.date,
    item: doc.item,
    seller: doc.seller,
    qty: doc.qty,
    price: doc.price,
    paidStatus: doc.paidStatus,
    paymentMethod: doc.paymentMethod || (doc.paidStatus === "paid" ? "cash" : "unpaid"),
    createdAt: doc.createdAt
  };
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const { date, item, seller, qty, price, paidStatus, paymentMethod } = req.body;
    const nextPaidStatus = paidStatus === "paid" ? "paid" : "unpaid";
    const nextPaymentMethod =
      nextPaidStatus === "paid"
        ? paymentMethod === "online"
          ? "online"
          : "cash"
        : "unpaid";
    const purchase = await Purchase.create({
      userId: req.user.id,
      date,
      item: String(item).trim(),
      seller: String(seller).trim(),
      qty: Number(qty) || 0,
      price: Number(price),
      paidStatus: nextPaidStatus,
      paymentMethod: nextPaymentMethod
    });
    // Auto-update inventory stock when raw material is purchased
    await addQtyFromPurchase(req.user.id, purchase.item, purchase.qty);
    return res.status(201).json(toDto(purchase));
  } catch (e) {
    return res.status(500).json({ message: "Failed to add purchase" });
  }
}

async function list(req, res) {
  try {
    const purchases = await Purchase.find({ userId: req.user.id }).sort({ date: -1, createdAt: -1 });
    return res.json(purchases.map(toDto));
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch purchases" });
  }
}

async function update(req, res) {
  try {
    const p = await Purchase.findOne({ _id: req.params.id, userId: req.user.id });
    if (!p) return res.status(404).json({ message: "Not found" });
    if (req.body.paidStatus !== undefined) {
      p.paidStatus = req.body.paidStatus === "paid" ? "paid" : "unpaid";
    }
    if (req.body.paymentMethod !== undefined) {
      p.paymentMethod = req.body.paymentMethod === "online" ? "online" : req.body.paymentMethod === "cash" ? "cash" : p.paymentMethod;
    }
    if (p.paidStatus === "unpaid") p.paymentMethod = "unpaid";
    await p.save();
    return res.json(toDto(p));
  } catch (e) {
    return res.status(500).json({ message: "Failed to update purchase" });
  }
}

async function remove(req, res) {
  try {
    const p = await Purchase.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!p) return res.status(404).json({ message: "Not found" });
    return res.json({ message: "Deleted" });
  } catch (e) {
    return res.status(500).json({ message: "Failed to delete purchase" });
  }
}

module.exports = { create, list, update, remove };
