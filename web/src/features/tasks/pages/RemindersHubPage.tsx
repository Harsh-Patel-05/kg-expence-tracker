import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { ReminderCategory, ReminderDoc, RecurrenceFreq, TaskPriority } from "@/features/hr/types";
import {
  REMINDER_PRESETS,
  completeReminder,
  snoozeReminder,
  spawnNextRecurrence,
  upsertReminder
} from "../services/taskReminderService";
import { canAccessReminders } from "@/features/hr/utils/permissions";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";

import { ContentLoading } from "@/components/ui/Loading";

const CATEGORIES: ReminderCategory[] = [
  "vendor_payment",
  "salary",
  "rent",
  "utility",
  "inventory",
  "compliance",
  "maintenance",
  "customer",
  "checklist",
  "birthday",
  "custom"
];

export function RemindersHubPage() {
  const { role } = usePosAuth();
  const canAccess = canAccessReminders(role);
  const { data, loading, error } = useRestaurantCollection<ReminderDoc>({ path: "reminders" });
  const [view, setView] = useState<"list" | "calendar" | "agenda">("list");
  const [filter, setFilter] = useState<"open" | "done" | "overdue" | "all">("open");
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(isoDate().slice(0, 7));
  const [form, setForm] = useState({
    title: "",
    dueDate: isoDate(),
    notifyBeforeDays: "1",
    category: "custom" as ReminderCategory,
    priority: "medium" as TaskPriority,
    recurrence: "once" as RecurrenceFreq,
    notes: ""
  });

  const today = isoDate();

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return data
      .filter((r) => {
        const done = !!(r.completed || r.done);
        const overdue = !done && String(r.dueDate || "") < today;
        if (filter === "open" && done) return false;
        if (filter === "done" && !done) return false;
        if (filter === "overdue" && !overdue) return false;
        if (category !== "all" && (r.category || "custom") !== category) return false;
        if (!query) return true;
        return `${r.title} ${r.notes || ""} ${(r.tags || []).join(" ")}`.toLowerCase().includes(query);
      })
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  }, [data, filter, category, q, today]);

  const stats = useMemo(() => {
    const open = data.filter((r) => !(r.completed || r.done)).length;
    const overdue = data.filter((r) => !(r.completed || r.done) && String(r.dueDate || "") < today).length;
    const dueToday = data.filter((r) => !(r.completed || r.done) && String(r.dueDate || "") === today).length;
    const done = data.filter((r) => r.completed || r.done).length;
    return { open, overdue, dueToday, done, completion: data.length ? Math.round((done / data.length) * 100) : 0 };
  }, [data, today]);

  const calendarDays = useMemo(() => {
    const [y, m] = calMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: Array<{ date: string | null; items: typeof rows }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ date: null, items: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${calMonth}-${String(d).padStart(2, "0")}`;
      cells.push({
        date,
        items: data.filter((r) => String(r.dueDate || "").slice(0, 10) === date)
      });
    }
    return cells;
  }, [calMonth, data]);

  async function save() {
    if (!canAccess) return;
    try {
      await upsertReminder({
        title: form.title,
        dueDate: form.dueDate,
        notifyBeforeDays: Number(form.notifyBeforeDays) || 1,
        category: form.category,
        priority: form.priority,
        recurrence: form.recurrence,
        notes: form.notes
      });
      setMsg("Reminder saved");
      setForm((f) => ({ ...f, title: "", notes: "" }));
    } catch (e: any) {
      setMsg(e?.message || "Failed");
    }
  }

  async function markDone(r: ReminderDoc & { id: string }) {
    await completeReminder(r.id);
    if (r.recurrence && r.recurrence !== "once") {
      await spawnNextRecurrence(r);
    }
    setMsg("Completed");
  }

  if (!canAccess) {
    return <EmptyState title="No access" description="Your role cannot open reminders." />;
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/tasks" className="text-xs font-semibold text-primary"> Tasks board → </Link>}
        title="Reminders & schedule"
        actions={
          <div className="flex flex-wrap gap-2">
            {(["list", "calendar", "agenda"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`kg-btn capitalize ${view === v ? "kg-btn-primary" : "kg-btn-secondary"}`}>
                {v}
              </button>
            ))}
          </div>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {error && !loading ? (
        <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {error.includes("permission")
            ? "Connecting to Firebase… If this stays, enable Anonymous Authentication in Firebase Console → Authentication → Sign-in method."
            : error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard title="Open" value={String(stats.open)} />
        <KpiCard title="Due today" value={String(stats.dueToday)} />
        <KpiCard title="Overdue" value={String(stats.overdue)} tone={stats.overdue > 0 ? "bad" : "neutral"} />
        <KpiCard title="Done" value={String(stats.done)} tone="good" />
        <KpiCard title="Completion" value={`${stats.completion}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-3">
          <Card padding="sm" hover={false}>
            <div className="mb-2 text-[14px] font-bold text-text-primary">Quick add</div>
            <input className="kg-input mb-2 w-full" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <input type="date" className="kg-input mb-2 w-full" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            <select className="kg-input mb-2 w-full" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ReminderCategory }))}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace("_", " ")}
                </option>
              ))}
            </select>
            <select className="kg-input mb-2 w-full" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select className="kg-input mb-2 w-full" value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as RecurrenceFreq }))}>
              <option value="once">One time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="half_yearly">Half yearly</option>
              <option value="yearly">Yearly</option>
            </select>
            <input type="number" className="kg-input mb-2 w-full" placeholder="Notify before (days)" value={form.notifyBeforeDays} onChange={(e) => setForm((f) => ({ ...f, notifyBeforeDays: e.target.value }))} />
            <button onClick={save} disabled={!form.title.trim()} className="w-full kg-btn kg-btn-primary disabled:opacity-50">
              Save reminder
            </button>
          </Card>

          <Card padding="sm" hover={false}>
            <div className="mb-2 text-[14px] font-bold text-text-primary">Presets</div>
            <div className="max-h-56 space-y-1 overflow-auto">
              {REMINDER_PRESETS.map((p) => (
                <button
                  key={p.title}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-bg-1"
                  onClick={() => setForm((f) => ({ ...f, title: p.title, category: p.category }))}
                >
                  {p.title}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input className="kg-input min-w-[160px] flex-1 !w-auto" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="kg-input !w-auto" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
              <option value="open">Open</option>
              <option value="overdue">Overdue</option>
              <option value="done">Done</option>
              <option value="all">All</option>
            </select>
            <select className="kg-input !w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {view === "calendar" ? (
              <input type="month" className="kg-input !w-auto" value={calMonth} onChange={(e) => setCalMonth(e.target.value)} />
            ) : null}
          </div>

          {loading ? <ContentLoading variant="table" label="Loading" /> : null}

          {view === "calendar" ? (
            <div className="grid grid-cols-7 gap-1 rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 p-2 shadow-panel">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="px-1 py-1 text-center text-[10px] font-bold uppercase text-text-muted">
                  {d}
                </div>
              ))}
              {calendarDays.map((c, i) => (
                <div key={i} className={`min-h-[72px] rounded-lg border border-stroke-0 p-1 ${c.date === today ? "bg-primary-light" : "bg-bg-1"}`}>
                  {c.date ? <div className="text-[10px] font-bold text-text-secondary">{Number(c.date.slice(-2))}</div> : null}
                  {c.items.slice(0, 2).map((r) => (
                    <div key={r.id} className="truncate rounded bg-card-0 px-1 text-[9px] font-semibold text-text-secondary">
                      {r.title}
                    </div>
                  ))}
                  {c.items.length > 2 ? <div className="text-[9px] text-text-muted">+{c.items.length - 2}</div> : null}
                </div>
              ))}
            </div>
          ) : null}

          {(view === "list" || view === "agenda") && (
            <div className="space-y-2">
              {rows.map((r) => {
                const done = !!(r.completed || r.done);
                const overdue = !done && String(r.dueDate || "") < today;
                return (
                  <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 p-4 shadow-panel">
                    <div className="min-w-0">
                      <div className={`font-semibold ${done ? "text-text-muted line-through" : "text-text-primary"}`}>{r.title}</div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-bold uppercase">
                        <span className="rounded-full bg-bg-1 px-2 py-0.5">{r.dueDate}</span>
                        <span className="rounded-full bg-bg-1 px-2 py-0.5">{r.category || "custom"}</span>
                        <span className="rounded-full bg-bg-1 px-2 py-0.5">{r.priority || "medium"}</span>
                        {r.recurrence && r.recurrence !== "once" ? <span className="rounded-full bg-primary-light px-2 py-0.5 text-primary">{r.recurrence}</span> : null}
                        {overdue ? <span className="rounded-full bg-danger-bg px-2 py-0.5 text-danger">overdue</span> : null}
                      </div>
                      {r.notes ? <div className="mt-1 text-xs text-text-muted">{r.notes}</div> : null}
                    </div>
                    {!done ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-lg bg-success-bg px-2 py-1 text-xs font-semibold text-success"
                          onClick={() => markDone(r)}
                        >
                          Complete
                        </button>
                        <button
                          className="rounded-lg bg-warning-bg px-2 py-1 text-xs font-semibold text-warning"
                          onClick={async () => {
                            const until = new Date();
                            until.setDate(until.getDate() + 1);
                            await snoozeReminder(r.id, until.toISOString());
                            setMsg("Snoozed 1 day");
                          }}
                        >
                          Snooze
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!rows.length && !loading ? <EmptyState title="No reminders match." /> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
