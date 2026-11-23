/**
 * KDS POS integration auth — require matching x-api-key header.
 * Set KDS_API_KEY in env (or fall back to process.env.API_KEY).
 */
function kdsApiKey(req, res, next) {
  const expected = String(process.env.KDS_API_KEY || process.env.API_KEY || "").trim();
  if (!expected) {
    return res.status(503).json({
      message: "KDS API key not configured. Set KDS_API_KEY on the server."
    });
  }
  const provided =
    String(req.get("x-api-key") || req.get("X-API-Key") || req.query.api_key || "").trim();
  if (!provided || provided !== expected) {
    return res.status(401).json({ message: "Invalid or missing API key" });
  }
  next();
}

module.exports = { kdsApiKey };
