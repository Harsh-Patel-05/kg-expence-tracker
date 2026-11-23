import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyAJOjwJ94w5hYtux2pCT68vZN4b7_dscP4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "kilogram-expance-trakker.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "kilogram-expance-trakker",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "kilogram-expance-trakker.firebasestorage.app"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

