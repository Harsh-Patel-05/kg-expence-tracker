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
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No access</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/tasks" className="text-xs font-semibold text-cyan-700">
            Tasks board →
          </Link>
          <h1 className="text-2xl font-black text-slate-900">Reminders & schedule</h1>
        </div>
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm">
          {(["list", "calendar", "agenda"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 capitalize ${view === v ? "bg-slate-900 text-white" : "text-slate-600"}`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {msg ? <div className="rounded-xl border border-[#E9EDF5] bg-[#F5F7FB] px-4 py-3 text-[14px] text-[#111827]">{msg}</div> : null}
      {error && !loading ? (
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[14px] text-[#B91C1C]">
          {error.includes("permission")
            ? "Connecting to Firebase… If this stays, enable Anonymous Authentication in Firebase Console → Authentication → Sign-in method."
            : error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Open</div>
          <div className="text-xl font-black">{stats.open}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Due today</div>
          <div className="text-xl font-black">{stats.dueToday}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Overdue</div>
          <div className="text-xl font-black">{stats.overdue}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Done</div>
          <div className="text-xl font-black">{stats.done}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Completion</div>
          <div className="text-xl font-black">{stats.completion}%</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-bold">Quick add</div>
            <input className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <input type="date" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ReminderCategory }))}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace("_", " ")}
                </option>
              ))}
            </select>
            <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as RecurrenceFreq }))}>
              <option value="once">One time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="half_yearly">Half yearly</option>
              <option value="yearly">Yearly</option>
            </select>
            <input type="number" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Notify before (days)" value={form.notifyBeforeDays} onChange={(e) => setForm((f) => ({ ...f, notifyBeforeDays: e.target.value }))} />
            <button onClick={save} disabled={!form.title.trim()} className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Save reminder
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-bold">Presets</div>
            <div className="max-h-56 space-y-1 overflow-auto">
              {REMINDER_PRESETS.map((p) => (
                <button
                  key={p.title}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                  onClick={() => setForm((f) => ({ ...f, title: p.title, category: p.category }))}
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input className="min-w-[160px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
              <option value="open">Open</option>
              <option value="overdue">Overdue</option>
              <option value="done">Done</option>
              <option value="all">All</option>
            </select>
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {view === "calendar" ? (
              <input type="month" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={calMonth} onChange={(e) => setCalMonth(e.target.value)} />
            ) : null}
          </div>

          {loading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

          {view === "calendar" ? (
            <div className="grid grid-cols-7 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="px-1 py-1 text-center text-[10px] font-bold uppercase text-slate-400">
                  {d}
                </div>
              ))}
              {calendarDays.map((c, i) => (
                <div key={i} className={`min-h-[72px] rounded-lg border border-slate-100 p-1 ${c.date === today ? "bg-cyan-50" : "bg-slate-50/50"}`}>
                  {c.date ? <div className="text-[10px] font-bold text-slate-600">{Number(c.date.slice(-2))}</div> : null}
                  {c.items.slice(0, 2).map((r) => (
                    <div key={r.id} className="truncate rounded bg-white px-1 text-[9px] font-semibold text-slate-700">
                      {r.title}
                    </div>
                  ))}
                  {c.items.length > 2 ? <div className="text-[9px] text-slate-400">+{c.items.length - 2}</div> : null}
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
                  <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="min-w-0">
                      <div className={`font-semibold ${done ? "text-slate-400 line-through" : "text-slate-900"}`}>{r.title}</div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-bold uppercase">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">{r.dueDate}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">{r.category || "custom"}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">{r.priority || "medium"}</span>
                        {r.recurrence && r.recurrence !== "once" ? <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-cyan-800">{r.recurrence}</span> : null}
                        {overdue ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">overdue</span> : null}
                      </div>
                      {r.notes ? <div className="mt-1 text-xs text-slate-500">{r.notes}</div> : null}
                    </div>
                    {!done ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                          onClick={() => markDone(r)}
                        >
                          Complete
                        </button>
                        <button
                          className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
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
              {!rows.length && !loading ? <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">No reminders match.</div> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
