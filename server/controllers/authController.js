const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const User = require("../models/User");

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
}

async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const { email, password, name } = req.body;
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }
    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({ email: email.toLowerCase(), password: hash, name: name || "" });
    const token = signToken(user._id);
    return res.status(201).json({
      token,
      user: { id: user._id, email: user.email, name: user.name }
    });
  } catch (e) {
    return res.status(500).json({ message: "Registration failed" });
  }
}

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const token = signToken(user._id);
    return res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name }
    });
  } catch (e) {
    return res.status(500).json({ message: "Login failed" });
  }
}

async function me(req, res) {
  return res.json({ user: req.user });
}

module.exports = { register, login, me };
