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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inbox</div>
          <h1 className="text-2xl font-black text-slate-900">Notification center</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
            onClick={async () => {
              await markAllNotificationsRead(unreadIds);
              setMsg("All marked read");
            }}
          >
            Mark all read ({unreadIds.length})
          </button>
          <Link to="/analytics" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Analytics
          </Link>
        </div>
      </div>

      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}
      {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input className="min-w-[180px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Search notifications…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="all">All priorities</option>
              {(["critical", "high", "medium", "low"] as NotificationPriority[]).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All types</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          {loading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

          <div className="space-y-2">
            {rows.map((n) => {
              const rs = n.readStatus || (n.read ? "read" : "unread");
              return (
                <div key={n.id} className={`rounded-2xl border p-4 shadow-sm ${rs === "unread" ? "border-cyan-200 bg-cyan-50/40" : "border-slate-200 bg-white"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-bold text-slate-900">{n.title}</div>
                        {n.pinned ? <span className="rounded-full bg-amber-100 px-2 text-[10px] font-bold uppercase text-amber-800">pinned</span> : null}
                        <span className="rounded-full bg-slate-100 px-2 text-[10px] font-bold uppercase">{n.priority || "medium"}</span>
                        <span className="rounded-full bg-slate-100 px-2 text-[10px] font-bold uppercase">{n.kind}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">{n.body}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {n.link ? (
                        <Link to={n.link} className="text-xs font-semibold text-cyan-700">
                          Open
                        </Link>
                      ) : null}
                      <button className="text-xs font-semibold text-emerald-700" onClick={() => markNotificationRead(n.id, rs !== "read")}>
                        {rs === "read" ? "Unread" : "Read"}
                      </button>
                      <button className="text-xs font-semibold text-amber-700" onClick={() => pinNotification(n.id, !n.pinned)}>
                        {n.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        className="text-xs font-semibold text-slate-600"
                        onClick={async () => {
                          const until = new Date();
                          until.setHours(until.getHours() + 4);
                          await snoozeNotification(n.id, until.toISOString());
                          setMsg("Snoozed 4h");
                        }}
                      >
                        Snooze
                      </button>
                      <button className="text-xs font-semibold text-slate-600" onClick={() => archiveNotification(n.id)}>
                        Archive
                      </button>
                      <button className="text-xs font-semibold text-rose-600" onClick={() => softDeleteNotification(n.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!rows.length && !loading ? <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">No notifications.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">Preferences</div>
          <label className="mb-2 flex items-center gap-2 text-sm">
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
          <label className="mb-2 flex items-center gap-2 text-sm">
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
          <label className="mb-2 flex items-center gap-2 text-sm">
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
          <div className="mt-3 text-xs text-slate-500">
            Quiet hours: {myPrefs?.quietHoursStart || "22:00"} – {myPrefs?.quietHoursEnd || "07:00"}
          </div>
          <div className="mt-4 text-xs text-slate-500">Channels architecture-ready: Email · WhatsApp · SMS</div>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Today: {isoDate()} · Unread {unreadIds.length}</div>
        </div>
      </div>
    </div>
  );
}
