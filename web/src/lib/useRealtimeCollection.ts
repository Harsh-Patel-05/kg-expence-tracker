import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, type DocumentData } from "firebase/firestore";
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

  const q = useMemo(() => {
    const base = query(collection(db, path), where("userId", "==", userId));
    return query(base, orderBy(orderByField as any, "desc"));
  }, [path, userId, orderByField]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })));
        setLoading(false);
      },
      (e) => {
        setError(e?.message ?? "Failed to load data");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [q]);

  return { data, loading, error };
}

