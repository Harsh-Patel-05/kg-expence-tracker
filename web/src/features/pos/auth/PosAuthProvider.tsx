import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
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
};

const AuthCtx = createContext<AuthState>({
  user: null,
  role: "admin",
  profile: { role: "admin", displayName: "Admin" },
  loading: true,
  isAdmin: true,
  restaurantName: BRAND.restaurantName,
  appName: BRAND.appName
});

async function ensureAdminProfile(u: User) {
  const ref = doc(db, "users", u.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Record<string, unknown>;
      const role = normalizePosRole(data.role);
      if (!isFullAdmin(role)) {
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
      displayName: u.displayName || u.email || "Admin",
      email: u.email || "",
      restaurantName: BRAND.restaurantName,
      appName: BRAND.appName
    };
    await setDoc(ref, seed, { merge: true });
    return seed;
  } catch {
    return {
      role: "admin",
      displayName: u.displayName || "Admin",
      restaurantName: BRAND.restaurantName,
      appName: BRAND.appName
    };
  }
}

export function PosAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>({ role: "admin" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (cancelled) return;

      if (!u) {
        // Firestore rules require signed-in users — anonymous session unlocks your data as Admin
        try {
          await signInAnonymously(auth);
          return; // onAuthStateChanged will fire again with the anonymous user
        } catch (e) {
          console.warn("Anonymous sign-in failed — enable Anonymous Auth in Firebase Console", e);
          setUser(null);
          setProfile({
            role: "admin",
            displayName: "Admin",
            restaurantName: BRAND.restaurantName,
            appName: BRAND.appName
          });
          setLoading(false);
          return;
        }
      }

      setUser(u);
      const p = await ensureAdminProfile(u);
      if (!cancelled) {
        setProfile(p);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const role = normalizePosRole(profile?.role ?? "admin");

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      role,
      isAdmin: isFullAdmin(role),
      restaurantName: String(profile?.restaurantName || BRAND.restaurantName),
      appName: String(profile?.appName || BRAND.appName)
    }),
    [user, profile, loading, role]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function usePosAuth() {
  return useContext(AuthCtx);
}
