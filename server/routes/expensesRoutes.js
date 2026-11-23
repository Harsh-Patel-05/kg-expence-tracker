const express = require("express");
const { body, param } = require("express-validator");
const controller = require("../controllers/expensesController");
const { authMiddleware } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();
router.use(authMiddleware);

router.post(
  "/",
  [
    body("date").notEmpty(),
    body("category").notEmpty().trim(),
    body("amount").isFloat({ min: 0 }),
    body("status").optional().isIn(["paid", "unpaid"]),
    body("paymentMethod").optional().isIn(["cash", "online"]),
    body("note").optional().trim(),
    validateRequest
  ],
  controller.create
);
router.get("/", controller.list);
router.put(
  "/:id",
  [
    param("id").isMongoId(),
    body("status").optional().isIn(["paid", "unpaid"]),
    body("paymentMethod").optional().isIn(["cash", "online"]),
    validateRequest
  ],
  controller.update
);
router.delete("/:id", [param("id").isMongoId(), validateRequest], controller.remove);

module.exports = router;
