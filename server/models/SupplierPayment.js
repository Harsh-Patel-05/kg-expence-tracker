const mongoose = require("mongoose");

const supplierPaymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true }, // ISO yyyy-mm-dd
    seller: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ["cash", "online"], default: "cash" },
    note: { type: String, default: "" }
  },
  { timestamps: true }
);

supplierPaymentSchema.index({ userId: 1, seller: 1, date: -1 });

module.exports = mongoose.model("SupplierPayment", supplierPaymentSchema);

