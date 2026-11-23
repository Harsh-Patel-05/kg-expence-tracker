import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlarmClock,
  BarChart3,
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ClipboardList,
  Command,
  CreditCard,
  FileStack,
  Home,
  IndianRupee,
  LineChart,
  Menu,
  MonitorSmartphone,
  Moon,
  Package,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Sparkles,
  Users,
  X
} from "lucide-react";
import { clsx } from "clsx";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { RouteErrorBoundary } from "@/components/ui/RouteErrorBoundary";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { BRAND } from "@/lib/brand";

type NavItem = { to: string; label: string; icon: typeof Home };
type NavGroup = { id: string; label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    id: "dash",
    label: "Dashboard",
    items: [{ to: "/", label: "Dashboard", icon: Home }]
  },
  {
    id: "ops",
    label: "Restaurant Operations",
    items: [
      { to: "/pos", label: "POS", icon: ShoppingBag },
      { to: "/orders", label: "Orders", icon: ClipboardList },
      { to: "/kds", label: "Kitchen", icon: MonitorSmartphone },
      { to: "/sales", label: "Sales", icon: IndianRupee }
    ]
  },
  {
    id: "supply",
    label: "Inventory & Purchase",
    items: [
      { to: "/inventory", label: "Inventory", icon: Package },
      { to: "/suppliers", label: "Suppliers", icon: Receipt },
      { to: "/expenses", label: "Expenses", icon: CreditCard }
    ]
  },
  {
    id: "people",
    label: "People & Work",
    items: [
      { to: "/hr", label: "Employees", icon: Users },
      { to: "/tasks", label: "Tasks", icon: CheckSquare },
      { to: "/reminders", label: "Reminders", icon: AlarmClock },
      { to: "/calendar", label: "Calendar", icon: CalendarDays },
      { to: "/documents", label: "Documents", icon: FileStack }
    ]
  },
  {
    id: "intel",
    label: "Reports & AI",
    items: [
      { to: "/analytics", label: "Analytics", icon: LineChart },
      { to: "/reports", label: "Reports", icon: BarChart3 },
      { to: "/forecast", label: "AI Forecast", icon: Sparkles }
    ]
  }
];

const flatNav = groups.flatMap((g) => g.items);

function titleFor(pathname: string) {
  return (
    flatNav.find((n) => n.to === pathname)?.label ||
    (pathname.startsWith("/notifications")
      ? "Notifications"
      : pathname.startsWith("/forecast")
        ? "AI Forecast"
        : pathname.startsWith("/hr")
          ? "Employees"
          : pathname.startsWith("/inventory")
            ? "Inventory"
            : "Dashboard")
  );
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return {
    time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    date: now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
  };
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return flatNav;
    return flatNav.filter((n) => n.label.toLowerCase().includes(query) || n.to.includes(query));
  }, [q]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[14vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" className="absolute inset-0 bg-[#111827]/40 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            className="relative w-full max-w-xl overflow-hidden rounded-[20px] border border-[#E9EDF5] bg-white shadow-[0_24px_80px_rgba(17,24,39,0.18)]"
          >
            <div className="flex items-center gap-3 border-b border-[#E9EDF5] px-4 py-3.5">
              <Search size={18} className="text-[#6D5EF7]" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search modules…"
                className="w-full border-0 bg-transparent text-[15px] font-medium text-[#111827] outline-none placeholder:text-[#6B7280]"
              />
              <kbd className="rounded-lg bg-[#F5F7FB] px-2 py-1 text-[11px] font-semibold text-[#6B7280]">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-auto p-2">
              {results.map((n) => {
                const Icon = n.icon;
                return (
                  <button
                    key={n.to}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#F5F7FB]"
                    onClick={() => {
                      onClose();
                      navigate(n.to);
                    }}
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F5F7FB] text-[#6D5EF7]">
                      <Icon size={16} />
                    </span>
                    <span className="text-[15px] font-semibold text-[#111827]">{n.label}</span>
                  </button>
                );
              })}
              {!results.length ? <div className="px-3 py-8 text-center text-sm text-[#6B7280]">No matches</div> : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const loc = useLocation();
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.id}>
          {!collapsed ? (
            <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">{g.label}</div>
          ) : null}
          <div className="grid gap-1">
            {g.items.map((n) => {
              const Icon = n.icon;
              const active = n.to === "/" ? loc.pathname === "/" : loc.pathname === n.to || loc.pathname.startsWith(n.to + "/");
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  title={n.label}
                  onClick={() => onNavigate?.()}
                  className={clsx(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition duration-200",
                    active
                      ? "bg-[#6D5EF7] text-white shadow-[0_8px_20px_rgba(109,94,247,0.28)]"
                      : "text-[#6B7280] hover:bg-[#F3F0FF] hover:text-[#6D5EF7]"
                  )}
                >
                  <Icon size={18} strokeWidth={1.75} className={active ? "text-white" : "text-current"} />
                  {!collapsed ? <span className="truncate">{n.label}</span> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AppShell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { role, isAdmin, restaurantName, appName, loading: authLoading } = usePosAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const clock = useClock();
  const title = titleFor(loc.pathname);
  const sidebarW = collapsed ? "w-[88px]" : "w-[280px]";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      {authLoading ? (
        <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-[#E9EDF5]">
          <div className="h-full w-1/3 animate-pulse bg-[#6D5EF7]" />
        </div>
      ) : null}

      <div className="mx-auto flex max-w-[1500px] gap-5 p-4 md:p-5">
        <aside className={clsx("sticky top-5 hidden max-h-[calc(100vh-2.5rem)] shrink-0 md:block", sidebarW)}>
          <div className="flex h-full max-h-[calc(100vh-2.5rem)] flex-col overflow-hidden rounded-[20px] border border-[#E9EDF5] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
            <div className="border-b border-[#E9EDF5] p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#6D5EF7] text-sm font-bold text-white">
                  {BRAND.restaurantShort}
                </div>
                {!collapsed ? (
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold text-[#111827]">{appName}</div>
                    <div className="truncate text-[13px] text-[#6B7280]">{restaurantName}</div>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F5F7FB]"
                  onClick={() => setCollapsed((c) => !c)}
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeft size={16} className={clsx("transition", collapsed && "rotate-180")} />
                </button>
              </div>
              {!collapsed ? (
                <div className="mt-4 rounded-xl bg-[#F5F7FB] px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Signed in as</div>
                  <div className="text-[14px] font-semibold capitalize text-[#6D5EF7]">
                    {isAdmin ? `${role} · full access` : role}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <SidebarNav collapsed={collapsed} />
            </div>
          </div>
        </aside>

        <AnimatePresence>
          {mobileOpen ? (
            <motion.div className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button type="button" className="absolute inset-0 bg-[#111827]/40" aria-label="Close" onClick={() => setMobileOpen(false)} />
              <motion.div
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                className="absolute left-0 top-0 h-full w-[280px] overflow-y-auto bg-white p-4 shadow-xl"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="font-bold text-[#111827]">{appName}</div>
                  <button type="button" className="rounded-lg p-2 hover:bg-[#F5F7FB]" onClick={() => setMobileOpen(false)}>
                    <X size={16} />
                  </button>
                </div>
                <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main className="min-w-0 flex-1">
          <header className="mb-5 flex flex-wrap items-center gap-3 rounded-[20px] border border-[#E9EDF5] bg-white px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-xl bg-[#6D5EF7] text-white md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={18} />
            </button>

            <div className="min-w-0">
              <div className="text-[12px] font-medium text-[#6B7280]">{restaurantName}</div>
              <div className="truncate text-[22px] font-bold tracking-tight text-[#111827] md:text-[28px]">{title}</div>
            </div>

            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="ml-auto flex min-w-[160px] max-w-md flex-1 items-center gap-2 rounded-xl border border-[#E9EDF5] bg-[#F5F7FB] px-3 py-2.5 text-left text-[14px] text-[#6B7280] hover:border-[#6D5EF7]/40"
            >
              <Search size={16} className="text-[#6D5EF7]" />
              <span className="flex-1 truncate">Search…</span>
              <span className="hidden items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#6B7280] sm:inline-flex">
                <Command size={10} />K
              </span>
            </button>

            <div className="flex items-center gap-2">
              <div className="hidden rounded-xl bg-[#F5F7FB] px-3 py-2 text-[12px] font-semibold text-[#6B7280] lg:block">
                {clock.date} · {clock.time}
              </div>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-xl border border-[#E9EDF5] text-[#6B7280] hover:bg-[#F5F7FB]"
                title="Tasks"
                onClick={() => navigate("/tasks")}
              >
                <CheckSquare size={16} />
              </button>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-xl border border-[#E9EDF5] text-[#6B7280] hover:bg-[#F5F7FB]"
                title="Reminders"
                onClick={() => navigate("/reminders")}
              >
                <Bell size={16} />
              </button>
              <NotificationBell />
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-xl border border-[#E9EDF5] text-[#6B7280] hover:bg-[#F5F7FB]"
                title="Theme"
              >
                <Moon size={16} />
              </button>
              <button
                type="button"
                onClick={() => navigate("/sales")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#6D5EF7] px-3.5 py-2.5 text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(109,94,247,0.28)] hover:bg-[#7B6EF6]"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Quick Add</span>
              </button>
              <div className="grid h-10 w-10 place-items-center rounded-full bg-[#111827] text-[12px] font-bold text-white">
                {BRAND.restaurantShort}
              </div>
            </div>
          </header>

          <RouteErrorBoundary key={loc.pathname} label={loc.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
