const { getCachedUser } = require("../config/defaultUser");

/**
 * Single-tenant local mode: no JWT. All data is scoped to one auto-created user.
 */
function authMiddleware(req, res, next) {
  const u = getCachedUser();
  if (!u) {
    return res.status(503).json({ message: "Server not ready yet; retry in a moment." });
  }
  req.user = { id: u.id, email: u.email, name: u.name };
  next();
}

module.exports = { authMiddleware };
