const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ["present", "absent", "half-day"], default: "present" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Attendance", attendanceSchema);
