const mongoose = require("mongoose");

const advanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true },
    month: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ["cash", "online"], default: "cash" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Advance", advanceSchema);
