const express = require("express");
const controller = require("../controllers/backupController");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

router.get("/export", controller.exportBackup);
router.post("/import", controller.importBackup);

module.exports = router;
