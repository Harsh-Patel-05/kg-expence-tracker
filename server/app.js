const express = require("express");
const cors = require("cors");

const salesRoutes = require("./routes/salesRoutes");
const purchasesRoutes = require("./routes/purchasesRoutes");
const expensesRoutes = require("./routes/expensesRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const salariesRoutes = require("./routes/salariesRoutes");
const advancesRoutes = require("./routes/advancesRoutes");
const suppliersRoutes = require("./routes/suppliersRoutes");
const staffRoutes = require("./routes/staffRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const backupRoutes = require("./routes/backupRoutes");
const supplierPaymentsRoutes = require("./routes/supplierPaymentsRoutes");
const menuItemsRoutes = require("./routes/menuItemsRoutes");
const ordersRoutes = require("./routes/ordersRoutes");
const kdsRoutes = require("./routes/kdsRoutes");
const { isFirebaseEnabled, getFirestore } = require("./config/firebaseAdmin");

const app = express();

const clientUrl = process.env.CLIENT_URL;
const isProd = process.env.NODE_ENV === "production";
const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === "null") {
        if (isProd) return callback(null, false);
        return callback(null, true);
      }
      if (clientUrl && origin === clientUrl) return callback(null, true);
      if (!isProd && localhostOrigin.test(origin)) return callback(null, true);
      if (!clientUrl && !isProd) return callback(null, true);
      if (clientUrl) return callback(null, false);
      callback(null, true);
    },
    credentials: true
  })
);
app.use(express.json({ limit: "8mb" }));

app.get("/health", async (req, res) => {
  const payload = {
    ok: true,
    service: "restaurant-tracker-api",
    firebaseAdmin: isFirebaseEnabled()
  };
  if (isFirebaseEnabled() && req.query.firestore === "1") {
    try {
      const db = getFirestore();
      const snap = await db.collection("_health").doc("ping").get();
      payload.firestoreReachable = true;
      payload.firestoreSample = snap.exists ? "doc exists" : "no ping doc (ok)";
    } catch (e) {
      payload.firestoreReachable = false;
      payload.firestoreError = e.message;
    }
  }
  res.json(payload);
});

app.use("/api/sales", salesRoutes);
app.use("/api/purchases", purchasesRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/salaries", salariesRoutes);
app.use("/api/advances", advancesRoutes);
app.use("/api/suppliers", suppliersRoutes);
app.use("/api/supplier-payments", supplierPaymentsRoutes);
app.use("/api/menu-items", menuItemsRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/kds", kdsRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/backup", backupRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: err.message || "Internal server error" });
});

module.exports = app;
