const express = require("express");
const { body, param } = require("express-validator");
const controller = require("../controllers/attendanceController");
const { authMiddleware } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();
router.use(authMiddleware);

router.post(
  "/",
  [
    body("date").notEmpty(),
    body("name").notEmpty().trim(),
    body("status").optional().isIn(["present", "absent", "half-day"]),
    validateRequest
  ],
  controller.create
);
router.get("/", controller.list);
router.delete("/:id", [param("id").isMongoId(), validateRequest], controller.remove);

module.exports = router;
