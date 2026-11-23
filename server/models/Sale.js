const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true },
    // Legacy fields (kept for compatibility)
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ["cash", "online", "mixed"], default: "cash" },

    // New split fields (optional)
    cashAmount: { type: Number, min: 0, default: 0 },
    swiggyAmount: { type: Number, min: 0, default: 0 },
    zomatoAmount: { type: Number, min: 0, default: 0 },
    otherOnlineAmount: { type: Number, min: 0, default: 0 },
    onlineAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, default: 0 },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
