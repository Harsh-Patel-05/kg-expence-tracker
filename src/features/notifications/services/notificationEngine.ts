import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import { pushNotification } from "@/features/orders/services/orderEngine";
import type { NotificationDoc, NotificationKind, NotificationPriority } from "@/features/pos/types";
import type { NotificationPreferencesDoc } from "@/features/analytics/types";

export async function emitNotification(input: {
  title: string;
  body: string;
  kind: NotificationKind;
  priority?: NotificationPriority;
  link?: string;
  entityType?: string;
  entityId?: string;
  orderId?: string;
  roleTargets?: string[];
  userId?: string | null;
  dedupeKey?: string;
  channels?: NotificationDoc["channels"];
}) {
  if (input.dedupeKey) {
    const q = query(collection(db, "notifications"), where("dedupeKey", "==", input.dedupeKey));
    const snap = await getDocs(q);
    const open = snap.docs.find((d) => {
      const data = d.data();
      return data.readStatus !== "read" && data.readStatus !== "archived" && data.readStatus !== "deleted" && !data.read;
    });
    if (open) return open.id;
  }

  // also queue for multi-channel delivery architecture
  const qref = doc(collection(db, "notificationQueue"));
  await setDoc(qref, {
    ...input,
    queueStatus: "queued",
    syncStatus: "synced",
    ...auditCreate({ status: "queued" })
  });

  const id = await pushNotification({
    title: input.title,
    body: input.body,
    kind: input.kind,
    priority: input.priority,
    link: input.link,
    entityType: input.entityType,
    entityId: input.entityId,
    orderId: input.orderId,
    roleTargets: input.roleTargets || ["owner", "manager", "admin"],
    userId: input.userId ?? null,
    dedupeKey: input.dedupeKey,
    channels: input.channels || ["in_app", "desktop"],
    read: false,
    readStatus: "unread",
    status: "unread",
    isDeleted: false,
    syncStatus: "synced"
  });

  await setDoc(doc(collection(db, "notificationCenter")), {
    notificationId: id,
    title: input.title,
    kind: input.kind,
    priority: input.priority || "medium",
    readStatus: "unread",
    link: input.link || null,
    syncStatus: "synced",
    ...auditCreate({ status: "unread" })
  });

  return id;
}

export async function markNotificationRead(id: string, read = true) {
  await setDoc(
    doc(db, "notifications", id),
    {
      read,
      readStatus: read ? "read" : "unread",
      ...auditUpdate({ status: read ? "read" : "unread" })
    },
    { merge: true }
  );
  await setDoc(doc(collection(db, "notificationHistory")), {
    notificationId: id,
    action: read ? "read" : "unread",
    ...auditCreate({ status: "recorded" })
  });
}

export async function markAllNotificationsRead(ids: string[]) {
  for (const id of ids) await markNotificationRead(id, true);
}

export async function archiveNotification(id: string) {
  await setDoc(doc(db, "notifications", id), { readStatus: "archived", read: true, ...auditUpdate({ status: "archived" }) }, { merge: true });
  await logActivity({ action: "notification_archived", entityType: "notifications", entityId: id, message: id });
}

export async function softDeleteNotification(id: string) {
  await setDoc(doc(db, "notifications", id), { isDeleted: true, readStatus: "deleted", ...auditUpdate({ status: "deleted" }) }, { merge: true });
}

export async function pinNotification(id: string, pinned = true) {
  await setDoc(doc(db, "notifications", id), { pinned, ...auditUpdate() }, { merge: true });
}

export async function snoozeNotification(id: string, untilISO: string) {
  await setDoc(doc(db, "notifications", id), { snoozedUntil: untilISO, ...auditUpdate() }, { merge: true });
}

export async function upsertNotificationPreferences(prefs: NotificationPreferencesDoc & { id?: string }) {
  const id = prefs.id || prefs.userId || "default";
  await setDoc(
    doc(db, "notificationPreferences", id),
    {
      ...prefs,
      syncStatus: "synced",
      ...auditCreate({ status: "active" })
    },
    { merge: true }
  );
  return id;
}

/** Scan inventory and emit low/out stock alerts (deduped). */
export async function runInventoryAlertScan(items: Array<{ id: string; item: string; qty?: number; threshold?: number; minStock?: number; reservedQty?: number }>) {
  for (const i of items) {
    const avail = Math.max(0, Number(i.qty || 0) - Number(i.reservedQty || 0));
    const thr = Number(i.threshold || i.minStock || 0);
    if (avail <= 0) {
      await emitNotification({
        title: "Out of stock",
        body: i.item,
        kind: "out_of_stock",
        priority: "critical",
        link: "/inventory/items",
        entityType: "inventory",
        entityId: i.id,
        dedupeKey: `oos-${i.id}`
      });
    } else if (thr > 0 && avail <= thr) {
      await emitNotification({
        title: "Low stock",
        body: `${i.item} · ${avail} left (min ${thr})`,
        kind: "low_stock",
        priority: "high",
        link: "/inventory/items",
        entityType: "inventory",
        entityId: i.id,
        dedupeKey: `low-${i.id}`
      });
    }
  }
}
