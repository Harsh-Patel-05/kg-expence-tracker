const mongoose = require("mongoose");

const salarySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    month: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["paid", "unpaid"], default: "unpaid" },
    paymentMethod: { type: String, enum: ["cash", "online"], default: "cash" },
    paidAt: { type: String, default: "" } // ISO date when marked paid
  },
  { timestamps: true }
);

salarySchema.index({ userId: 1, month: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Salary", salarySchema);
