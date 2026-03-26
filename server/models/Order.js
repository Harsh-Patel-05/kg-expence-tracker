const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true }, // yyyy-mm-dd
    items: [
      {
        menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" },
        name: { type: String, required: true },
        qty: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
        note: { type: String, default: "" }
      }
    ],
    notes: { type: String, default: "" },
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    payment: {
      cash: { type: Number, default: 0, min: 0 },
      online: { type: Number, default: 0, min: 0 }
    },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sale" }
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, date: -1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);

