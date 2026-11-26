import { startTransition, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlarmClock,
  ArrowLeftRight,
  BarChart3,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Command,
  CreditCard,
  Database,
  FileStack,
  Globe,
  Home,
  IndianRupee,
  LineChart,
  LogOut,
  Menu,
  MonitorSmartphone,
  Package,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
  UtensilsCrossed,
  X
} from "lucide-react";

import { clsx } from "clsx";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { RouteErrorBoundary } from "@/components/ui/RouteErrorBoundary";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { BRAND } from "@/lib/brand";
import { LoadingLabel } from "@/components/ui/Loading";

type NavItem = { to: string; label: string; icon: typeof Home; external?: boolean };
type NavGroup = { id: string; label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    id: "main",
    label: "Main",
    items: [
      { to: "/", label: "Dashboard", icon: Home },
      { to: "/sales", label: "Sales", icon: IndianRupee },
      { to: "/expenses", label: "Expenses", icon: CreditCard },
      { to: "/suppliers", label: "Suppliers", icon: Receipt },
      { to: "/hr", label: "Employees", icon: Users },
      { to: "/pos", label: "POS", icon: ShoppingBag },
      { to: "/scheduled", label: "Advance orders", icon: CalendarClock },
      { to: "/analytics", label: "Analytics", icon: LineChart },
      { to: "/reports", label: "Reports", icon: BarChart3 }
    ]
  },
  {
    id: "ops",
    label: "More",
    items: [
      { to: "/menu", label: "Menu", icon: UtensilsCrossed },
      { to: "/orders", label: "Orders", icon: ClipboardList },
      { to: "/orders/online", label: "Online Orders", icon: Globe },
      { to: "/kds", label: "Kitchen (KDS)", icon: MonitorSmartphone, external: true },
      { to: "/tasks", label: "Tasks", icon: CheckSquare },
      { to: "/reminders", label: "Reminders", icon: AlarmClock },
      { to: "/calendar", label: "Calendar", icon: CalendarDays },
      { to: "/documents", label: "Documents", icon: FileStack },
      { to: "/profit-analysis", label: "Profit analysis", icon: TrendingUp },
      { to: "/forecast", label: "AI Forecast", icon: Sparkles },
      { to: "/inventory", label: "Inventory", icon: Package },
      { to: "/investments", label: "Investments", icon: PiggyBank },
      { to: "/balance-transfer", label: "Balance transfer", icon: ArrowLeftRight },
      { to: "/backup", label: "Backup", icon: Database }
    ]
  }
];

const flatNav = groups.flatMap((g) => g.items);

/** `/orders` must not stay active on `/orders/online` (sibling nav item). */
function isNavActive(to: string, pathname: string) {
  if (to === "/") return pathname === "/";
  if (to === "/orders") {
    if (pathname === "/orders") return true;
    if (!pathname.startsWith("/orders/")) return false;
    return !pathname.startsWith("/orders/online");
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

function titleFor(pathname: string) {
  const exact = flatNav.find((n) => n.to === pathname)?.label;
  if (exact) return exact;
  if (pathname.startsWith("/transactions")) return "Transactions";
  if (pathname.startsWith("/notifications")) return "Notifications";
  if (pathname.startsWith("/forecast")) return "AI Forecast";
  if (pathname.startsWith("/menu")) return "Menu Management";
  if (pathname.startsWith("/orders/online")) return "Online Orders";
  if (pathname.startsWith("/orders")) return "Orders";
  if (pathname.startsWith("/scheduled")) return "Advance orders";
  if (pathname.startsWith("/hr")) return "Employees";
  if (pathname.startsWith("/inventory")) return "Inventory";
  if (pathname.startsWith("/suppliers")) return "Suppliers";
  if (pathname.startsWith("/expenses")) return "Expenses";
  if (pathname.startsWith("/investments")) return "Investments";
  if (pathname.startsWith("/balance-transfer") || pathname.startsWith("/finance/balance")) return "Balance transfer";
  if (pathname.startsWith("/finance")) return "Finance";
  if (pathname.startsWith("/profit-analysis")) return "Profit analysis";
  if (pathname.startsWith("/backup")) return "Backup";
  if (pathname.startsWith("/analytics")) return "Analytics";
  if (pathname.startsWith("/reports")) return "Reports";
  return "Dashboard";
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
  const reduceMotion = useReducedMotion();
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
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.15 }}
        >
          <button type="button" className="absolute inset-0 bg-[color:var(--rp-overlay)]" aria-label="Close command palette" onClick={onClose} />
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 6 }}
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-stroke-0 bg-card-0 shadow-float"
          >
            <div className="flex items-center gap-3 border-b border-stroke-0 px-4 py-3">
              <Search size={16} className="text-text-muted" aria-hidden />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Jump to a module…"
                aria-label="Search modules"
                className="w-full border-0 bg-transparent text-[14px] font-medium text-text-primary outline-none placeholder:text-text-muted"
              />
              <kbd className="rounded-md border border-stroke-0 bg-bg-1 px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-auto p-1.5">
              {results.map((n) => {
                const Icon = n.icon;
                return (
                  <button
                    key={n.to}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-bg-1"
                    onClick={() => {
                      onClose();
                      if (n.external) {
                        window.open(n.to, "_blank", "noopener,noreferrer");
                        return;
                      }
                      startTransition(() => navigate(n.to));
                    }}
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-bg-1 text-text-secondary">
                      <Icon size={15} strokeWidth={2} />
                    </span>
                    <span className="text-[13px] font-semibold text-text-primary">{n.label}</span>
                    <span className="ml-auto text-[11px] text-text-muted">{n.to}</span>
                  </button>
                );
              })}
              {!results.length ? <div className="px-3 py-8 text-center text-sm text-text-muted">No matches</div> : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const loc = useLocation();
  return (
    <nav className="space-y-4" aria-label="Main">
      {groups.map((g) => (
        <div key={g.id}>
          <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted/80">{g.label}</div>
          <div className="grid gap-0.5">
            {g.items.map((n) => {
              const Icon = n.icon;
              const active = isNavActive(n.to, loc.pathname);
              const className = clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium no-underline transition",
                active
                  ? "bg-primary text-white shadow-[var(--shadow-neonCyan)]"
                  : "text-text-secondary hover:bg-bg-1 hover:text-text-primary"
              );
              if (n.external) {
                return (
                  <a
                    key={n.to}
                    href={n.to}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onNavigate?.()}
                    className={className}
                  >
                    <Icon size={17} strokeWidth={2} className={active ? "text-white" : "text-text-muted"} aria-hidden />
                    <span className="truncate">{n.label}</span>
                  </a>
                );
              }
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate?.()}
                  className={className}
                >
                  <Icon size={17} strokeWidth={2} className={active ? "text-white" : "text-text-muted"} aria-hidden />
                  <span className="truncate">{n.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppShell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { restaurantName, appName, loading: authLoading, logout } = usePosAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [posNavOpen, setPosNavOpen] = useState(false);
  const [navBusy, setNavBusy] = useState(false);
  const reduceMotion = useReducedMotion();
  const clock = useClock();
  const title = titleFor(loc.pathname);
  const isPos = loc.pathname === "/pos";
  const showDesktopSidebar = !isPos || posNavOpen;

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

  // Top progress bar on every route change (page refresh / navigation)
  useEffect(() => {
    setNavBusy(true);
    const t = window.setTimeout(() => setNavBusy(false), 450);
    return () => window.clearTimeout(t);
  }, [loc.pathname]);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg-0">
      {authLoading || navBusy ? (
        <div className="fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-stroke-0" role="progressbar" aria-label="Loading">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}

      {/* Desktop sidebar — hidden on POS for cashier focus (FAB reopens) */}
      {showDesktopSidebar ? (
        <aside className={clsx("h-full w-[260px] shrink-0 flex-col border-r border-stroke-0 bg-card-0", isPos ? "fixed inset-y-0 left-0 z-50 flex shadow-float" : "hidden md:flex")}>
          <div className="flex items-center gap-3 border-b border-stroke-0 px-4 py-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-[13px] font-bold text-white shadow-[var(--shadow-neonCyan)]" aria-hidden>
              {BRAND.restaurantShort}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-bold text-text-primary">{appName}</div>
              <div className="truncate text-[12px] text-text-muted">{restaurantName}</div>
            </div>
            {isPos ? (
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-bg-1"
                aria-label="Close menu"
                onClick={() => setPosNavOpen(false)}
              >
                <X size={18} aria-hidden />
              </button>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 kg-hide-scrollbar">
            <SidebarNav onNavigate={isPos ? () => setPosNavOpen(false) : undefined} />
          </div>

          <div className="border-t border-stroke-0 p-3">
            <button
              type="button"
              disabled={loggingOut}
              onClick={() => {
                setLoggingOut(true);
                void logout().finally(() => setLoggingOut(false));
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-text-secondary transition hover:bg-danger-bg hover:text-danger"
              title="Sign out"
              aria-label="Sign out"
            >
              {loggingOut ? (
                <LoadingLabel>Signing out…</LoadingLabel>
              ) : (
                <>
                  <LogOut size={16} aria-hidden />
                  <span>Sign out</span>
                </>
              )}
            </button>
          </div>
        </aside>
      ) : null}
      {isPos && posNavOpen ? (
        <button type="button" className="fixed inset-0 z-40 bg-[color:var(--rp-overlay)] md:block" aria-label="Close menu" onClick={() => setPosNavOpen(false)} />
      ) : null}

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
          >
            <button type="button" className="absolute inset-0 bg-[color:var(--rp-overlay)]" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
            <motion.div
              initial={reduceMotion ? false : { x: -300 }}
              animate={{ x: 0 }}
              exit={reduceMotion ? undefined : { x: -300 }}
              className="absolute left-0 top-0 flex h-full w-[280px] flex-col border-r border-stroke-0 bg-card-0 shadow-float"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <div className="flex items-center justify-between gap-2 border-b border-stroke-0 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-[12px] font-bold text-white" aria-hidden>
                    {BRAND.restaurantShort}
                  </div>
                  <div className="truncate text-[14px] font-bold text-text-primary">{appName}</div>
                </div>
                <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-bg-1" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
                  <X size={18} aria-hidden />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-4 kg-hide-scrollbar">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </div>
              <div className="border-t border-stroke-0 p-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-text-secondary hover:bg-danger-bg hover:text-danger"
                  onClick={() => {
                    setMobileOpen(false);
                    void logout();
                  }}
                >
                  <LogOut size={16} aria-hidden />
                  Sign out
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Main column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className={clsx("z-40 flex shrink-0 flex-wrap items-center gap-3 border-b border-stroke-0 bg-card-0 px-3 py-3 md:px-5", isPos && "md:py-2")}>
          <button
            type="button"
            className={clsx("grid h-10 w-10 place-items-center rounded-xl bg-primary text-white", isPos ? "" : "md:hidden")}
            onClick={() => (isPos ? setPosNavOpen(true) : setMobileOpen(true))}
            aria-label="Open navigation"
          >
            <Menu size={18} aria-hidden />
          </button>

          <div className="min-w-0">
            <div className="text-[11px] font-medium text-text-muted">{restaurantName}</div>
            <h1 className="truncate text-[18px] font-bold tracking-tight text-text-primary md:text-[20px]">{title}</h1>
          </div>

          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="ml-auto flex min-w-[140px] max-w-md flex-1 items-center gap-2 rounded-xl border border-stroke-0 bg-bg-1 px-3 py-2.5 text-left text-[13px] text-text-muted hover:border-stroke-1"
            aria-label="Open search"
          >
            <Search size={15} className="text-text-muted" aria-hidden />
            <span className="flex-1 truncate">Search…</span>
            <span className="hidden items-center gap-0.5 rounded border border-stroke-0 bg-card-0 px-1.5 py-0.5 text-[10px] font-semibold text-text-muted sm:inline-flex">
              <Command size={9} aria-hidden />K
            </span>
          </button>

          <div className="flex items-center gap-1.5">
            <div className="hidden rounded-xl border border-stroke-0 bg-bg-1 px-2.5 py-2 text-[11px] font-semibold text-text-muted lg:block">
              {clock.date} · {clock.time}
            </div>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-xl border border-stroke-0 text-text-muted hover:bg-bg-1"
              aria-label="Tasks"
              onClick={() => navigate("/tasks")}
            >
              <CheckSquare size={16} aria-hidden />
            </button>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-xl border border-stroke-0 text-text-muted hover:bg-bg-1"
              aria-label="Reminders"
              onClick={() => navigate("/reminders")}
            >
              <Bell size={16} aria-hidden />
            </button>
            <NotificationBell />
            <button
              type="button"
              onClick={() => navigate("/expenses#daily-expense-add")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 text-[12px] font-semibold text-white shadow-[var(--shadow-neonCyan)] hover:bg-primary-hover"
              title="Add daily expense"
            >
              <Plus size={14} aria-hidden />
              <span className="hidden sm:inline">Add expense</span>
            </button>
          </div>
        </header>

        <main className={clsx("min-h-0 min-w-0 flex-1", isPos ? "overflow-hidden p-3 md:p-4" : "overflow-y-auto p-4 md:p-6")}>
          <RouteErrorBoundary key={loc.pathname} label={loc.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
