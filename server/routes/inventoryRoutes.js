const express = require("express");
const { body, param } = require("express-validator");
const controller = require("../controllers/inventoryController");
const { authMiddleware } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();
router.use(authMiddleware);

router.post(
  "/",
  [
    body("item").notEmpty().trim(),
    body("unit").optional().trim(),
    body("qty").optional().isFloat({ min: 0 }),
    body("threshold").optional().isFloat({ min: 0 }),
    validateRequest
  ],
  controller.create
);
router.get("/", controller.list);
router.put(
  "/:id",
  [
    param("id").isMongoId(),
    body("item").optional().trim(),
    body("unit").optional(),
    body("qty").optional().isFloat({ min: 0 }),
    body("threshold").optional().isFloat({ min: 0 }),
    validateRequest
  ],
  controller.update
);
router.delete("/:id", [param("id").isMongoId(), validateRequest], controller.remove);

module.exports = router;
