import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type WithId<T> = T & { id: string };

export function useRealtimeCollection<T extends DocumentData>(args: {
  path: string;
  userId: string;
  orderByField?: string;
}) {
  const { path, userId, orderByField = "createdAt" } = args;
  const [data, setData] = useState<Array<WithId<T>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsub: Unsubscribe | null = null;
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const q = query(collection(db, path), where("userId", "==", userId), orderBy(orderByField as any, "desc"));
        unsub = onSnapshot(
          q,
          (snap) => {
            if (cancelled) return;
            setData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })));
            setLoading(false);
          },
          (e) => {
            if (cancelled) return;
            setError(e?.message ?? "Failed to load data");
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
    }, 50);

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
  }, [path, userId, orderByField]);

  return { data, loading, error };
}
