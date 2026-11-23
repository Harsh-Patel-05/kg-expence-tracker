const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    item: { type: String, required: true, trim: true },
    unit: { type: String, default: "unit", trim: true },
    qty: { type: Number, default: 0, min: 0 },
    threshold: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

inventorySchema.index({ userId: 1, item: 1 }, { unique: true });

module.exports = mongoose.model("Inventory", inventorySchema);
