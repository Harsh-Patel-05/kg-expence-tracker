const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Expense = require("../models/Expense");
const Inventory = require("../models/Inventory");
const Attendance = require("../models/Attendance");
const Salary = require("../models/Salary");
const Advance = require("../models/Advance");
const Supplier = require("../models/Supplier");
const Staff = require("../models/Staff");

async function exportBackup(req, res) {
  try {
    const userId = req.user.id;
    const [
      sales,
      purchases,
      expenses,
      inventory,
      attendance,
      salaries,
      advances,
      suppliers,
      staff
    ] = await Promise.all([
      Sale.find({ userId }),
      Purchase.find({ userId }),
      Expense.find({ userId }),
      Inventory.find({ userId }),
      Attendance.find({ userId }),
      Salary.find({ userId }),
      Advance.find({ userId }),
      Supplier.find({ userId }),
      Staff.find({ userId })
    ]);

    const mapId = (docs) =>
      docs.map((d) => {
        const o = d.toObject();
        o.id = o._id.toString();
        delete o._id;
        delete o.__v;
        return o;
      });

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      data: {
        sales: mapId(sales),
        purchases: mapId(purchases),
        expenses: mapId(expenses),
        inventory: mapId(inventory),
        attendance: mapId(attendance),
        salaries: mapId(salaries),
        advances: mapId(advances),
        suppliers: suppliers.map((s) => ({ id: s._id.toString(), name: s.name })),
        staff: staff.map((s) => ({ id: s._id.toString(), name: s.name }))
      }
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="restaurant-backup.json"');
    return res.send(JSON.stringify(payload, null, 2));
  } catch (e) {
    return res.status(500).json({ message: "Export failed" });
  }
}

/**
 * POST body: { data: { sales, purchases, ... } } — replaces user's business data
 */
async function importBackup(req, res) {
  try {
    const { data } = req.body;
    if (!data || typeof data !== "object") {
      return res.status(400).json({ message: "Invalid payload: expected { data: { ... } }" });
    }

    const userId = new mongoose.Types.ObjectId(req.user.id);

    await Sale.deleteMany({ userId });
    await Purchase.deleteMany({ userId });
    await Expense.deleteMany({ userId });
    await Inventory.deleteMany({ userId });
    await Attendance.deleteMany({ userId });
    await Salary.deleteMany({ userId });
    await Advance.deleteMany({ userId });
    await Supplier.deleteMany({ userId });
    await Staff.deleteMany({ userId });

    if (Array.isArray(data.sales) && data.sales.length) {
      await Sale.insertMany(
        data.sales.map((r) => ({
          userId,
          date: r.date,
          amount: r.amount,
          method: r.method || "cash"
        }))
      );
    }
    if (Array.isArray(data.purchases) && data.purchases.length) {
      await Purchase.insertMany(
        data.purchases.map((r) => ({
          userId,
          date: r.date,
          item: r.item,
          seller: r.seller,
          qty: r.qty,
          price: r.price,
          paidStatus: r.paidStatus || "paid"
        }))
      );
    }
    if (Array.isArray(data.expenses) && data.expenses.length) {
      await Expense.insertMany(
        data.expenses.map((r) => ({
          userId,
          date: r.date,
          category: r.category || r.type,
          amount: r.amount,
          status: r.status || "unpaid",
          note: r.note || ""
        }))
      );
    }
    if (Array.isArray(data.inventory) && data.inventory.length) {
      await Inventory.insertMany(
        data.inventory.map((r) => ({
          userId,
          item: r.item,
          unit: r.unit || "unit",
          qty: r.qty,
          threshold: r.threshold
        }))
      );
    }
    if (Array.isArray(data.attendance) && data.attendance.length) {
      await Attendance.insertMany(
        data.attendance.map((r) => ({
          userId,
          date: r.date,
          name: r.name,
          status: r.status
        }))
      );
    }
    if (Array.isArray(data.salaries) && data.salaries.length) {
      await Salary.insertMany(
        data.salaries.map((r) => ({
          userId,
          month: r.month,
          name: r.name,
          amount: r.amount,
          status: r.status || "unpaid"
        }))
      );
    }
    if (Array.isArray(data.advances) && data.advances.length) {
      await Advance.insertMany(
        data.advances.map((r) => ({
          userId,
          date: r.date,
          month: r.month,
          name: r.name,
          amount: r.amount
        }))
      );
    }
    if (Array.isArray(data.suppliers)) {
      for (const s of data.suppliers) {
        const name = typeof s === "string" ? s : s.name;
        if (name) {
          try {
            await Supplier.create({ userId, name: String(name).trim() });
          } catch (e) {
            if (e.code !== 11000) throw e;
          }
        }
      }
    }
    if (Array.isArray(data.staff)) {
      for (const s of data.staff) {
        const name = typeof s === "string" ? s : s.name;
        if (name) {
          try {
            await Staff.create({ userId, name: String(name).trim() });
          } catch (e) {
            if (e.code !== 11000) throw e;
          }
        }
      }
    }

    return res.json({ message: "Import completed successfully" });
  } catch (e) {
    return res.status(500).json({ message: "Import failed" });
  }
}

module.exports = { exportBackup, importBackup };
