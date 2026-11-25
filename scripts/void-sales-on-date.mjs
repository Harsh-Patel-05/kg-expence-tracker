/**
 * Soft-delete all sales docs for a given date so cash/online balances reverse.
 * Usage: node scripts/void-sales-on-date.mjs 2026-11-23
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, getDocs, query, updateDoc, where, getFirestore } from "firebase/firestore";

const date = String(process.argv[2] || "").slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("Usage: node scripts/void-sales-on-date.mjs YYYY-MM-DD");
  process.exit(1);
}

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyAJOjwJ94w5hYtux2pCT68vZN4b7_dscP4",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "kilogram-expance-trakker.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "kilogram-expance-trakker",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "kilogram-expance-trakker.firebasestorage.app"
});
const db = getFirestore(app);
try {
  await signInAnonymously(getAuth(app));
} catch (e) {
  console.warn("Anonymous auth failed — rules may still block writes:", e?.message || e);
}

const snap = await getDocs(query(collection(db, "sales"), where("date", "==", date)));
let n = 0;
for (const d of snap.docs) {
  const data = d.data();
  if (data.isDeleted || String(data.status || "").toLowerCase() === "void") continue;
  await updateDoc(d.ref, {
    isDeleted: true,
    status: "void",
    countsAsRevenue: false,
    deletedReason: `Bulk void ${date} sales`,
    updatedAt: new Date().toISOString()
  });
  n++;
  console.log("voided", d.id, data.cashAmount, data.onlineAmount, data.swiggyAmount, data.zomatoAmount);
}
console.log(`Done. Voided ${n} sales on ${date}.`);
process.exit(0);
