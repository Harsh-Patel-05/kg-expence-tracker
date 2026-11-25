import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizePosRole, isFullAdmin } from "../utils/permissions";
import type { PosRole } from "../types";
import { BRAND } from "@/lib/brand";

/** Used when Firebase Anonymous auth is disabled — still lets POS/KDS open. */
const SHOP_GUEST_EMAIL = "pos-guest@thekilogram.local";
const SHOP_GUEST_PASS = "KilogramPOS-Guest-2024";

async function signInShopGuest() {
  try {
    await signInAnonymously(auth);
    return;
  } catch {
    /* Anonymous disabled — fall through to email guest */
  }
  try {
    await signInWithEmailAndPassword(auth, SHOP_GUEST_EMAIL, SHOP_GUEST_PASS);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || "";
    if (code === "auth/user-not-found" || code === "auth/invalid-credential" || code === "auth/wrong-password") {
      try {
        await createUserWithEmailAndPassword(auth, SHOP_GUEST_EMAIL, SHOP_GUEST_PASS);
        return;
      } catch (createErr: unknown) {
        const c2 = (createErr as { code?: string })?.code || "";
        if (c2 === "auth/email-already-in-use") {
          await signInWithEmailAndPassword(auth, SHOP_GUEST_EMAIL, SHOP_GUEST_PASS);
          return;
        }
        throw createErr;
      }
    }
    throw err;
  }
}

type AuthState = {
  user: User | null;
  role: PosRole;
  profile: Record<string, unknown> | null;
  loading: boolean;
  isAdmin: boolean;
  restaurantName: string;
  appName: string;
  displayName: string;
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

async function ensureAdminProfile(u: User) {
  const ref = doc(db, "users", u.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Record<string, unknown>;
      const role = normalizePosRole(data.role);
      if (!isFullAdmin(role) && u.isAnonymous) {
        const next = { ...data, role: "admin", restaurantName: BRAND.restaurantName, appName: BRAND.appName };
        await setDoc(ref, next, { merge: true });
        return next;
      }
      return {
        ...data,
        restaurantName: data.restaurantName || BRAND.restaurantName,
        appName: data.appName || BRAND.appName
      };
    }
    const seed = {
      role: "admin",
      displayName: u.displayName || u.email || (u.isAnonymous ? "Guest Admin" : "Admin"),
      email: u.email || "",
      restaurantName: BRAND.restaurantName,
      appName: BRAND.appName
    };
    await setDoc(ref, seed, { merge: true });
    return seed;
  } catch {
    return {
      role: "admin",
      displayName: u.displayName || u.email || "Admin",
      restaurantName: BRAND.restaurantName,
      appName: BRAND.appName
    };
  }
}

export function PosAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (cancelled) return;

      if (!u) {
        // Stay on login when user signed out on purpose; otherwise auto-restore guest for returning tabs
        const signedOut = sessionStorage.getItem("kg_signed_out") === "1";
        if (signedOut) {
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }
        try {
          await signInShopGuest();
          return;
        } catch (e) {
          console.warn("Guest sign-in failed", e);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }
      }

      setUser(u);
      const p = await ensureAdminProfile(u);
      if (!cancelled) {
        setProfile(p);
        setLoading(false);
        sessionStorage.removeItem("kg_signed_out");
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const continueAsGuest = useCallback(async () => {
    sessionStorage.removeItem("kg_signed_out");
    sessionStorage.setItem("kg_guest", "1");
    await signInShopGuest();
  }, []);

  const logout = useCallback(async () => {
    sessionStorage.setItem("kg_signed_out", "1");
    sessionStorage.removeItem("kg_guest");
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setLoading(false);
  }, []);

  const role = normalizePosRole(profile?.role ?? "admin");
  const displayName = String(
    profile?.displayName || user?.email || (user?.isAnonymous ? "Guest Admin" : "Admin")
  );

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      role,
      isAdmin: isFullAdmin(role),
      restaurantName: String(profile?.restaurantName || BRAND.restaurantName),
      appName: String(profile?.appName || BRAND.appName),
      displayName,
      continueAsGuest,
      logout
    }),
    [user, profile, loading, role, displayName, continueAsGuest, logout]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function usePosAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) {
    throw new Error("usePosAuth must be used within PosAuthProvider");
  }
  return ctx;
}
