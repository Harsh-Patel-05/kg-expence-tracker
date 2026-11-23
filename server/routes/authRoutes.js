const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const { authMiddleware } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();

router.post(
  "/register",
  [
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
    body("name").optional().trim(),
    validateRequest
  ],
  authController.register
);

router.post(
  "/login",
  [body("email").isEmail().normalizeEmail(), body("password").notEmpty(), validateRequest],
  authController.login
);

router.get("/me", authMiddleware, authController.me);

module.exports = router;
