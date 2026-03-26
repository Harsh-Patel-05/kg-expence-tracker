const express = require("express");
const { body } = require("express-validator");
const { authMiddleware } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validateRequest");
const controller = require("../controllers/menuItemsController");

const router = express.Router();

router.use(authMiddleware);

router.get("/", controller.list);
router.post(
  "/",
  [
    body("name").isString().trim().notEmpty(),
    body("price").isNumeric(),
    body("category").optional().isString(),
    body("imageUrl").optional().isString(),
    body("available").optional().isBoolean()
  ],
  validateRequest,
  controller.create
);
router.post("/bulk", controller.bulkCreate);
router.put(
  "/:id",
  [
    body("name").optional().isString(),
    body("price").optional().isNumeric(),
    body("category").optional().isString(),
    body("imageUrl").optional().isString(),
    body("available").optional().isBoolean()
  ],
  validateRequest,
  controller.update
);
router.delete("/:id", controller.remove);

module.exports = router;

