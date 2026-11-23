const express = require("express");
const { body, param } = require("express-validator");
const controller = require("../controllers/suppliersController");
const { authMiddleware } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();
router.use(authMiddleware);

router.post("/", [body("name").notEmpty().trim(), validateRequest], controller.create);
router.get("/", controller.list);
router.put(
  "/:id",
  [
    param("id").isMongoId(),
    body("name").optional().trim(),
    body("items").optional().isArray(),
    validateRequest
  ],
  controller.update
);
router.delete("/:id", [param("id").isMongoId(), validateRequest], controller.remove);

module.exports = router;
