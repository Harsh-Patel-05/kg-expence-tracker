import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";

export type WithId<T> = T & { id: string };

/**
 * Restaurant-scoped collections.
 * Waits for Firebase Auth (incl. anonymous) before subscribing — prevents
 * "Missing or insufficient permissions" flashes while auth boots.
 */
export function useRestaurantCollection<T extends DocumentData>(args: {
  path: string;
  orderByField?: string;
  orderDir?: "asc" | "desc";
  whereField?: string;
  whereOp?: "==" | "!=" | ">" | ">=" | "<" | "<=";
  whereValue?: unknown;
  enabled?: boolean;
  max?: number;
}) {
  const {
    path,
    orderByField,
    orderDir = "desc",
    whereField,
    whereOp = "==",
    whereValue,
    enabled = true,
    max
  } = args;
  const [data, setData] = useState<Array<WithId<T>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthReady(!!u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!enabled || !authReady) {
      setLoading(true);
      setError(null);
      if (!enabled) setData([]);
      return;
    }

    let cancelled = false;
    let unsub: Unsubscribe | null = null;
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const constraints: QueryConstraint[] = [];
        if (whereField != null && whereValue !== undefined) {
          constraints.push(where(whereField, whereOp as any, whereValue as any));
        }
        if (orderByField) constraints.push(orderBy(orderByField, orderDir));
        if (typeof max === "number" && max > 0) constraints.push(limit(max));
        const q = constraints.length ? query(collection(db, path), ...constraints) : collection(db, path);

        unsub = onSnapshot(
          q,
          (snap) => {
            if (cancelled) return;
            const rows = snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as T) }))
              .filter((r) => !(r as any).isDeleted && !(r as any).deleted);
            setData(rows);
            setLoading(false);
            setError(null);
          },
          (e) => {
            if (cancelled) return;
            setError(e?.message ?? "Failed to load");
            setLoading(false);
            setData([]);
          }
        );
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Failed to subscribe");
        setLoading(false);
        setData([]);
      }
    }, 40);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (unsub) {
        try {
          unsub();
        } catch {
          /* ignore */
        }
      }
    };
  }, [path, orderByField, orderDir, whereField, whereOp, whereValue, enabled, max, authReady]);

  return { data, loading, error };
}

export async function getById<T>(path: string, id: string): Promise<WithId<T> | null> {
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, path, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as T) };
}

export async function listAll<T>(path: string): Promise<Array<WithId<T>>> {
  const { getDocs } = await import("firebase/firestore");
  const snap = await getDocs(collection(db, path));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}
