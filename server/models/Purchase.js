const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true },
    item: { type: String, required: true, trim: true },
    seller: { type: String, required: true, trim: true },
    qty: { type: Number, default: 0, min: 0 },
    price: { type: Number, required: true, min: 0 },
    paidStatus: { type: String, enum: ["paid", "unpaid"], default: "paid" },
    paymentMethod: { type: String, enum: ["cash", "online", "unpaid"], default: "unpaid" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Purchase", purchaseSchema);
