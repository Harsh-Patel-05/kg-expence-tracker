const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    nameHi: { type: String, default: "", trim: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, default: "General", trim: true },
    imageUrl: { type: String, default: "" },
    available: { type: Boolean, default: true }
  },
  { timestamps: true }
);

menuItemSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("MenuItem", menuItemSchema);

