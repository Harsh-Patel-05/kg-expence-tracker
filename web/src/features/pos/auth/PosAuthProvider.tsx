import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInAnonymously, signOut, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizePosRole, isFullAdmin } from "../utils/permissions";
import type { PosRole } from "../types";
import { BRAND } from "@/lib/brand";

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
          await signInAnonymously(auth);
          return;
        } catch (e) {
          console.warn("Anonymous sign-in failed — enable Anonymous Auth in Firebase Console", e);
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
    await signInAnonymously(auth);
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
