import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, Bell, CreditCard, Home, IndianRupee, Receipt, Users } from "lucide-react";
import { clsx } from "clsx";

const nav = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/sales", label: "Add Sales", icon: IndianRupee },
  { to: "/staff", label: "Staff", icon: Users },
  { to: "/suppliers", label: "Suppliers", icon: Receipt },
  { to: "/expenses", label: "Expenses", icon: CreditCard },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/reminders", label: "Reminders", icon: Bell }
];

export function AppShell() {
  const loc = useLocation();
  return (
    <div className="min-h-screen kg-grid-bg">
      <div className="mx-auto flex max-w-[1400px] gap-4 p-4">
        <aside className="hidden w-[260px] shrink-0 lg:block">
          <div className="rounded-2xl border border-stroke-0 bg-card-0 p-4 shadow-panel backdrop-blur">
            <div className="mb-4 flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-stroke-1 bg-white/5 text-sm font-semibold shadow-neonCyan">
                KG
              </div>
              <div>
                <div className="text-sm font-semibold">Expense Manager</div>
                <div className="text-xs text-white/60">Owner dashboard</div>
              </div>
            </div>
            <nav className="grid gap-1">
              {nav.map((n) => {
                const Icon = n.icon;
                return (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    className={({ isActive }) =>
                      clsx(
                        "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white",
                        isActive && "bg-white/10 text-white shadow-neonBlue"
                      )
                    }
                  >
                    <Icon size={18} className="text-white/70 group-hover:text-white" />
                    {n.label}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-2xl border border-stroke-0 bg-card-0 p-4 shadow-panel backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-white/60">Restaurant dashboard</div>
                <div className="truncate text-lg font-semibold">
                  {nav.find((n) => n.to === loc.pathname)?.label ?? "Dashboard"}
                </div>
              </div>
              <div className="hidden items-center gap-2 text-xs text-white/60 sm:flex">
                <span className="inline-flex h-2 w-2 rounded-full bg-accent-cyan shadow-neonCyan" />
                Firebase • Real-time
              </div>
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

