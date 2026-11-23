import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/ui/PageHeader";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { NotificationDoc } from "@/features/pos/types";
import { markNotificationRead } from "@/features/notifications/services/notificationEngine";

export function NotificationBell() {
  const { data } = useRestaurantCollection<NotificationDoc>({ path: "notifications", max: 40 });
  const [open, setOpen] = useState(false);

  const unread = useMemo(
    () => data.filter((n) => (n.readStatus || (n.read ? "read" : "unread")) === "unread" && !n.isDeleted),
    [data]
  );
  const preview = useMemo(() => unread.slice(0, 6), [unread]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-stroke-0 text-text-muted hover:bg-bg-1"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={15} aria-hidden />
        {unread.length ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold text-white">
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 shadow-float" role="dialog" aria-label="Notification list">
          <div className="flex items-center justify-between border-b border-stroke-0 px-4 py-3">
            <div className="text-[14px] font-bold text-text-primary">Notifications</div>
            <Link to="/notifications" className="text-[12px] font-semibold text-primary" onClick={() => setOpen(false)}>
              View all
            </Link>
          </div>
          <div className="max-h-80 overflow-auto">
            {preview.map((n) => (
              <button
                key={n.id}
                type="button"
                className="block w-full border-b border-stroke-0 px-4 py-3 text-left hover:bg-bg-1"
                onClick={async () => {
                  await markNotificationRead(n.id, true);
                  setOpen(false);
                }}
              >
                <div className="text-[13px] font-semibold text-text-primary">{n.title}</div>
                <div className="truncate text-[12px] text-text-muted">{n.body}</div>
              </button>
            ))}
            {!preview.length ? <EmptyState className="m-3" icon={<Bell size={18} />} title="You&apos;re all caught up" description="New alerts will show up here." /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
