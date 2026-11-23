const express = require("express");
const { body, param } = require("express-validator");
const controller = require("../controllers/salesController");
const { authMiddleware } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();
router.use(authMiddleware);

router.post(
  "/",
  // Accept both legacy { amount, method } and new split fields (validated in controller)
  [body("date").notEmpty(), validateRequest],
  controller.create
);
router.get("/", controller.list);
router.delete("/:id", [param("id").isMongoId(), validateRequest], controller.remove);

module.exports = router;
