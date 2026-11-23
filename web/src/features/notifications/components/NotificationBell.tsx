import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
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
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#E9EDF5] bg-white text-[#6B7280] hover:bg-[#F5F7FB]"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unread.length ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-[#EF4444] px-1 text-center text-[10px] font-bold text-white">
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[360px] overflow-hidden rounded-[20px] border border-[#E9EDF5] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between border-b border-[#E9EDF5] px-4 py-3">
            <div className="text-[15px] font-bold text-[#111827]">Notifications</div>
            <Link to="/notifications" className="text-[13px] font-semibold text-[#6D5EF7]" onClick={() => setOpen(false)}>
              View all
            </Link>
          </div>
          <div className="max-h-80 overflow-auto">
            {preview.map((n) => (
              <button
                key={n.id}
                type="button"
                className="block w-full border-b border-[#F5F7FB] px-4 py-3 text-left hover:bg-[#F5F7FB]"
                onClick={async () => {
                  await markNotificationRead(n.id, true);
                  setOpen(false);
                }}
              >
                <div className="text-[14px] font-semibold text-[#111827]">{n.title}</div>
                <div className="truncate text-[13px] text-[#6B7280]">{n.body}</div>
              </button>
            ))}
            {!preview.length ? <div className="px-4 py-10 text-center text-[13px] text-[#6B7280]">You&apos;re all caught up.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
