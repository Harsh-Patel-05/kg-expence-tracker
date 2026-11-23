const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    items: [
      {
        name: { type: String, required: true, trim: true },
        rate: { type: Number, default: 0, min: 0 }
      }
    ]
  },
  { timestamps: true }
);

supplierSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Supplier", supplierSchema);
