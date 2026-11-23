const express = require("express");
const { body, param } = require("express-validator");
const controller = require("../controllers/purchasesController");
const { authMiddleware } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();
router.use(authMiddleware);

router.post(
  "/",
  [
    body("date").notEmpty(),
    body("item").notEmpty().trim(),
    body("seller").notEmpty().trim(),
    body("qty").optional().isFloat({ min: 0 }),
    body("price").isFloat({ min: 0 }),
    body("paidStatus").optional().isIn(["paid", "unpaid"]),
    body("paymentMethod").optional().isIn(["cash", "online", "unpaid"]),
    validateRequest
  ],
  controller.create
);
router.get("/", controller.list);
router.put(
  "/:id",
  [
    param("id").isMongoId(),
    body("paidStatus").optional().isIn(["paid", "unpaid"]),
    body("paymentMethod").optional().isIn(["cash", "online", "unpaid"]),
    validateRequest
  ],
  controller.update
);
router.delete("/:id", [param("id").isMongoId(), validateRequest], controller.remove);

module.exports = router;
