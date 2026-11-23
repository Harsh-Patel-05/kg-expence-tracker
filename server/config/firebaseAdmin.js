/**
 * Optional Firebase Admin SDK — use when you want Firestore from this Express server.
 * Does nothing until credentials are set (see FIREBASE_SETUP.md).
 */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

let initialized = false;

/**
 * Call once at startup. Safe to call if env vars are missing (no-op).
 */
function initFirebaseAdmin() {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return !!admin.apps.length;
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  try {
    if (json && json.trim()) {
      const serviceAccount = JSON.parse(json);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      initialized = true;
      console.log("Firebase Admin: initialized from FIREBASE_SERVICE_ACCOUNT");
      return true;
    }
    if (credPath && credPath.trim()) {
      const abs = path.isAbsolute(credPath) ? credPath : path.join(process.cwd(), credPath);
      const serviceAccount = JSON.parse(fs.readFileSync(abs, "utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      initialized = true;
      console.log("Firebase Admin: initialized from GOOGLE_APPLICATION_CREDENTIALS");
      return true;
    }
  } catch (e) {
    console.warn("Firebase Admin: init skipped —", e.message);
  }
  return false;
}

function getFirestore() {
  if (!admin.apps.length) return null;
  return admin.firestore();
}

function isFirebaseEnabled() {
  return admin.apps.length > 0;
}

module.exports = { initFirebaseAdmin, getFirestore, isFirebaseEnabled };
