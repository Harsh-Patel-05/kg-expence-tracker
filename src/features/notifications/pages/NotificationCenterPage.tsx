import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { NotificationDoc, NotificationKind, NotificationPriority } from "@/features/pos/types";
import type { NotificationPreferencesDoc } from "@/features/analytics/types";
import {
  archiveNotification,
  markAllNotificationsRead,
  markNotificationRead,
  pinNotification,
  snoozeNotification,
  softDeleteNotification,
  upsertNotificationPreferences
} from "../services/notificationEngine";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

import { ContentLoading } from "@/components/ui/Loading";

const KINDS: NotificationKind[] = [
  "new_order",
  "low_stock",
  "out_of_stock",
  "payment",
  "task",
  "scheduled_reminder",
  "expense_approval",
  "vendor_due",
  "salary_due",
  "security",
  "system",
  "info",
  "custom"
];

export function NotificationCenterPage() {
  const { user } = usePosAuth();
  const { data, loading, error } = useRestaurantCollection<NotificationDoc>({ path: "notifications" });
  const { data: prefs } = useRestaurantCollection<NotificationPreferencesDoc>({ path: "notificationPreferences" });

  const [q, setQ] = useState("");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState<"unread" | "read" | "archived" | "all">("unread");
  const [kind, setKind] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);

  const myPrefs = prefs.find((p) => p.userId === user?.uid) || prefs[0];

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return [...data]
      .filter((n) => {
        const rs = n.readStatus || (n.read ? "read" : "unread");
        if (status !== "all" && rs !== status) return false;
        if (status === "unread" && n.snoozedUntil && n.snoozedUntil > new Date().toISOString()) return false;
        if (priority !== "all" && (n.priority || "medium") !== priority) return false;
        if (kind !== "all" && n.kind !== kind) return false;
        if (myPrefs?.mutedKinds?.includes(n.kind)) return false;
        if (!query) return true;
        return `${n.title} ${n.body} ${n.kind}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        return String((b as any).createdAt?.seconds || b.updatedAt || "").localeCompare(String((a as any).createdAt?.seconds || a.updatedAt || ""));
      });
  }, [data, q, priority, status, kind, myPrefs]);

  const unreadIds = data.filter((n) => (n.readStatus || (n.read ? "read" : "unread")) === "unread").map((n) => n.id);

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Inbox"
        title="Notification center"
        actions={
          <>
          <button
            className="kg-btn kg-btn-primary"
            onClick={async () => {
              await markAllNotificationsRead(unreadIds);
              setMsg("All marked read");
            }}
          >
            Mark all read ({unreadIds.length})
          </button>
          <Link to="/analytics" className="kg-btn kg-btn-secondary">
            Analytics
          </Link>
          </>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input className="kg-input min-w-[180px] flex-1 !w-auto" placeholder="Search notifications…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="kg-input !w-auto" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            <select className="kg-input !w-auto" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="all">All priorities</option>
              {(["critical", "high", "medium", "low"] as NotificationPriority[]).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select className="kg-input !w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All types</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          {loading ? <ContentLoading variant="table" label="Loading" /> : null}

          <div className="space-y-2">
            {rows.map((n) => {
              const rs = n.readStatus || (n.read ? "read" : "unread");
              return (
                <div key={n.id} className={`rounded-[var(--radius-xl)] border p-4 shadow-panel ${rs === "unread" ? "border-primary/30 bg-primary-light" : "border-stroke-0 bg-card-0"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-bold text-text-primary">{n.title}</div>
                        {n.pinned ? <span className="rounded-md bg-warning-bg px-2 text-[10px] font-bold uppercase text-warning">pinned</span> : null}
                        <span className="rounded-md bg-bg-1 px-2 text-[10px] font-bold uppercase">{n.priority || "medium"}</span>
                        <span className="rounded-md bg-bg-1 px-2 text-[10px] font-bold uppercase">{n.kind}</span>
                      </div>
                      <div className="mt-1 text-[13px] text-text-secondary">{n.body}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {n.link ? (
                        <Link to={n.link} className="text-xs font-semibold text-primary">
                          Open
                        </Link>
                      ) : null}
                      <button className="text-xs font-semibold text-success" onClick={() => markNotificationRead(n.id, rs !== "read")}>
                        {rs === "read" ? "Unread" : "Read"}
                      </button>
                      <button className="text-xs font-semibold text-warning" onClick={() => pinNotification(n.id, !n.pinned)}>
                        {n.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        className="text-xs font-semibold text-text-secondary"
                        onClick={async () => {
                          const until = new Date();
                          until.setHours(until.getHours() + 4);
                          await snoozeNotification(n.id, until.toISOString());
                          setMsg("Snoozed 4h");
                        }}
                      >
                        Snooze
                      </button>
                      <button className="text-xs font-semibold text-text-secondary" onClick={() => archiveNotification(n.id)}>
                        Archive
                      </button>
                      <button className="text-xs font-semibold text-danger" onClick={() => softDeleteNotification(n.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!rows.length && !loading ? <EmptyState title="No notifications." /> : null}
          </div>
        </div>

        <Card padding="sm" hover={false}>
          <SectionTitle title="Preferences" />
          <label className="mb-2 flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={myPrefs?.soundEnabled !== false}
              onChange={async (e) => {
                await upsertNotificationPreferences({
                  userId: user?.uid || "owner",
                  soundEnabled: e.target.checked,
                  desktopEnabled: myPrefs?.desktopEnabled !== false,
                  mobileEnabled: myPrefs?.mobileEnabled !== false,
                  mutedKinds: myPrefs?.mutedKinds || [],
                  quietHoursStart: myPrefs?.quietHoursStart || "22:00",
                  quietHoursEnd: myPrefs?.quietHoursEnd || "07:00"
                });
                setMsg("Preferences saved");
              }}
            />
            Sound
          </label>
          <label className="mb-2 flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={myPrefs?.desktopEnabled !== false}
              onChange={async (e) => {
                await upsertNotificationPreferences({
                  userId: user?.uid || "owner",
                  soundEnabled: myPrefs?.soundEnabled !== false,
                  desktopEnabled: e.target.checked,
                  mobileEnabled: myPrefs?.mobileEnabled !== false,
                  mutedKinds: myPrefs?.mutedKinds || []
                });
              }}
            />
            Desktop
          </label>
          <label className="mb-2 flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={myPrefs?.mobileEnabled !== false}
              onChange={async (e) => {
                await upsertNotificationPreferences({
                  userId: user?.uid || "owner",
                  soundEnabled: myPrefs?.soundEnabled !== false,
                  desktopEnabled: myPrefs?.desktopEnabled !== false,
                  mobileEnabled: e.target.checked,
                  mutedKinds: myPrefs?.mutedKinds || []
                });
              }}
            />
            Mobile
          </label>
          <div className="mt-3 text-xs text-text-muted">
            Quiet hours: {myPrefs?.quietHoursStart || "22:00"} – {myPrefs?.quietHoursEnd || "07:00"}
          </div>
          <div className="mt-4 text-xs text-text-muted">Channels architecture-ready: Email · WhatsApp · SMS</div>
          <div className="mt-4 rounded-lg bg-bg-1 p-3 text-xs text-text-secondary">Today: {isoDate()} · Unread {unreadIds.length}</div>
        </Card>
      </div>
    </div>
  );
}
