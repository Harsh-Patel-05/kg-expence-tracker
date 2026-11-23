const express = require("express");
const { body, param } = require("express-validator");
const controller = require("../controllers/advancesController");
const { authMiddleware } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();
router.use(authMiddleware);

router.post(
  "/",
  [
    body("date").notEmpty(),
    body("month").notEmpty(),
    body("name").notEmpty().trim(),
    body("amount").isFloat({ min: 0 }),
    body("method").optional().isIn(["cash", "online"]),
    validateRequest
  ],
  controller.create
);
router.get("/", controller.list);
router.delete("/:id", [param("id").isMongoId(), validateRequest], controller.remove);

module.exports = router;
