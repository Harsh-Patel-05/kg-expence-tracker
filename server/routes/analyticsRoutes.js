const express = require("express");
const { query } = require("express-validator");
const controller = require("../controllers/analyticsController");
const { authMiddleware } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();
router.use(authMiddleware);

router.get("/", [query("type").optional().isIn(["daily", "weekly", "monthly"]), validateRequest], controller.getAnalytics);

module.exports = router;
