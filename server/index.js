require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { initFirebaseAdmin } = require("./config/firebaseAdmin");
initFirebaseAdmin();

const app = require("./app");
const { connectDB } = require("./config/db");
const { ensureDefaultUser } = require("./config/defaultUser");

const PORT = Number(process.env.PORT) || 5050;

connectDB()
  .then(() => ensureDefaultUser())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API listening on port ${PORT} (single-user mode, no login)`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
