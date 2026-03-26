const express = require("express");
const { body } = require("express-validator");
const { authMiddleware } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validateRequest");
const controller = require("../controllers/ordersController");

const router = express.Router();
router.use(authMiddleware);

router.get("/", controller.list);
router.post(
  "/",
  [
    body("date").isString().trim().notEmpty(),
    body("items").isArray({ min: 1 }),
    body("subtotal").optional().isNumeric(),
    body("tax").optional().isNumeric(),
    body("total").optional().isNumeric(),
    body("payment").custom((v) => typeof v === "object" && v !== null),
    body("payment.cash").optional().isNumeric(),
    body("payment.online").optional().isNumeric(),
    body("notes").optional().isString()
  ],
  validateRequest,
  controller.create
);

module.exports = router;

