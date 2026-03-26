const bcrypt = require("bcryptjs");
const User = require("../models/User");

/** Fixed account for single-user / local mode (no login UI). */
const LOCAL_EMAIL = "local@localhost";

let cachedUser = null;

async function ensureDefaultUser() {
  if (cachedUser) return cachedUser;
  let user = await User.findOne({ email: LOCAL_EMAIL }).select("+password");
  if (!user) {
    const password = await bcrypt.hash("local-single-user-not-used", 10);
    user = await User.create({
      email: LOCAL_EMAIL,
      password,
      name: "Local"
    });
  }
  cachedUser = {
    id: user._id.toString(),
    email: user.email,
    name: user.name
  };
  return cachedUser;
}

function getCachedUser() {
  return cachedUser;
}

module.exports = { ensureDefaultUser, getCachedUser, LOCAL_EMAIL };
