import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { EmployeeDoc, LeaveRequestDoc, ReminderDoc, TaskDoc, RecurrenceFreq } from "@/features/hr/types";
import type { CalendarEventDoc, CalendarEventType, UnifiedCalendarItem } from "../types";
import { EVENT_COLORS } from "../types";
import {
  archiveCalendarEvent,
  buildUnifiedCalendar,
  duplicateCalendarEvent,
  moveCalendarEvent,
  softDeleteCalendarEvent,
  upsertCalendarEvent
} from "../services/calendarService";

type View = "month" | "week" | "day" | "agenda" | "year";

const TYPES: CalendarEventType[] = [
  "meeting",
  "event",
  "task",
  "vendor_payment",
  "inventory_count",
  "purchase",
  "equipment_service",
  "license_renewal",
  "catering",
  "custom"
];

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: string | null }> = [];
  for (let i = 0; i < startPad; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }
  return cells;
}

export function CalendarPage() {
  const today = isoDate();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const [typeFilter, setTypeFilter] = useState("all");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    date: today,
    startTime: "10:00",
    endTime: "11:00",
    allDay: false,
    eventType: "meeting" as CalendarEventType,
    recurrence: "once" as RecurrenceFreq,
    notes: ""
  });

  const { data: events } = useRestaurantCollection<CalendarEventDoc>({ path: "calendarEvents" });
  const { data: reminders } = useRestaurantCollection<ReminderDoc>({ path: "reminders" });
  const { data: tasks } = useRestaurantCollection<TaskDoc>({ path: "tasks" });
  const { data: leaves } = useRestaurantCollection<LeaveRequestDoc>({ path: "leaveRequests" });
  const { data: staff } = useRestaurantCollection<EmployeeDoc>({ path: "staff" });
  const { data: orders } = useRestaurantCollection<{ date?: string; orderNumber?: string; status?: string; total?: number }>({
    path: "orders",
    max: 200
  });

  const unified = useMemo(
    () =>
      buildUnifiedCalendar({
        events,
        reminders,
        tasks,
        leaves,
        staff,
        orders
      }),
    [events, reminders, tasks, leaves, staff, orders]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return unified.filter((i) => {
      if (typeFilter !== "all" && i.eventType !== typeFilter) return false;
      if (!query) return true;
      return `${i.title} ${i.eventType}`.toLowerCase().includes(query);
    });
  }, [unified, typeFilter, q]);

  const [y, m] = cursor.split("-").map(Number);
  const cells = useMemo(() => monthMatrix(y, m - 1), [y, m]);

  const byDate = useMemo(() => {
    const map = new Map<string, UnifiedCalendarItem[]>();
    filtered.forEach((i) => {
      const list = map.get(i.date) || [];
      list.push(i);
      map.set(i.date, list);
    });
    return map;
  }, [filtered]);

  const todayItems = filtered.filter((i) => i.date === today);
  const upcoming = filtered.filter((i) => i.date >= today).slice(0, 12);
  const birthdays = filtered.filter((i) => i.eventType === "birthday" && i.date.slice(5) === today.slice(5));

  const weekDates = useMemo(() => {
    const d = new Date(selectedDate + "T00:00:00");
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(start);
      x.setDate(start.getDate() + i);
      return x.toISOString().slice(0, 10);
    });
  }, [selectedDate]);

  async function createEvent() {
    try {
      await upsertCalendarEvent({
        title: form.title,
        date: form.date,
        startTime: form.allDay ? "" : form.startTime,
        endTime: form.allDay ? "" : form.endTime,
        allDay: form.allDay,
        eventType: form.eventType,
        recurrence: form.recurrence,
        notes: form.notes,
        color: EVENT_COLORS[form.eventType]
      });
      setMsg("Event created");
      setForm((f) => ({ ...f, title: "", notes: "" }));
    } catch (e: any) {
      setMsg(e?.message || "Failed");
    }
  }

  async function onDropDate(date: string) {
    if (!dragId || dragId.startsWith("rem-") || dragId.startsWith("task-") || dragId.startsWith("leave-") || dragId.startsWith("bday-") || dragId.startsWith("ord-")) {
      setDragId(null);
      return;
    }
    await moveCalendarEvent(dragId, date);
    setDragId(null);
    setMsg("Rescheduled");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scheduling</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Calendar</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/documents" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Documents
          </Link>
          <Link to="/reminders" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Reminders
          </Link>
          <Link to="/tasks" className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white">
            Tasks
          </Link>
        </div>
      </div>

      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today" value={todayItems.length} />
        <Stat label="Upcoming" value={upcoming.length} />
        <Stat label="Birthdays today" value={birthdays.length} />
        <Stat label="Open tasks on calendar" value={filtered.filter((i) => i.source === "task").length} />
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {(["month", "week", "day", "agenda", "year"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-sm capitalize ${view === v ? "bg-slate-900 text-white" : "text-slate-600"}`}>
            {v}
          </button>
        ))}
        <input type="month" className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm" value={cursor} onChange={(e) => setCursor(e.target.value)} />
        <input className="min-w-[160px] flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {Object.keys(EVENT_COLORS).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 xl:grid-cols-[300px_1fr_280px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold">Create event</div>
          <input className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <input type="date" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <label className="mb-2 flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={form.allDay} onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))} />
            All day
          </label>
          {!form.allDay ? (
            <div className="mb-2 flex gap-2">
              <input type="time" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
              <input type="time" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
            </div>
          ) : null}
          <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.eventType} onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value as CalendarEventType }))}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as RecurrenceFreq }))}>
            <option value="once">One time</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <textarea className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes" />
          <button disabled={!form.title.trim()} onClick={createEvent} className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            Save event
          </button>
          <div className="mt-3 text-[10px] text-slate-500">Drag calendar events onto another day to reschedule. Integrated reminders/tasks/leave/orders are read-only.</div>
        </div>

        <div className="min-w-0 space-y-3">
          {view === "month" || view === "year" ? (
            <div className="grid grid-cols-7 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="px-1 py-1 text-center text-[10px] font-bold uppercase text-slate-400">
                  {d}
                </div>
              ))}
              {cells.map((c, i) => (
                <div
                  key={i}
                  className={`min-h-[88px] rounded-lg border border-slate-100 p-1 ${c.date === today ? "bg-cyan-50" : "bg-slate-50/40"} ${c.date === selectedDate ? "ring-2 ring-cyan-400" : ""}`}
                  onClick={() => c.date && setSelectedDate(c.date)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => c.date && onDropDate(c.date)}
                >
                  {c.date ? <div className="text-[10px] font-bold text-slate-600">{Number(c.date.slice(-2))}</div> : null}
                  {(byDate.get(c.date || "") || []).slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      draggable={ev.source === "calendar"}
                      onDragStart={() => setDragId(ev.id)}
                      className="mb-0.5 truncate rounded px-1 text-[9px] font-semibold text-white"
                      style={{ background: ev.color }}
                      title={ev.title}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {(byDate.get(c.date || "") || []).length > 3 ? <div className="text-[9px] text-slate-400">+{(byDate.get(c.date || "") || []).length - 3}</div> : null}
                </div>
              ))}
            </div>
          ) : null}

          {view === "week" ? (
            <div className="grid grid-cols-7 gap-2">
              {weekDates.map((d) => (
                <div key={d} className="min-h-[220px] rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" onDragOver={(e) => e.preventDefault()} onDrop={() => onDropDate(d)}>
                  <div className="mb-2 text-xs font-bold">{d}</div>
                  {(byDate.get(d) || []).map((ev) => (
                    <EventChip key={ev.id} ev={ev} onDrag={() => setDragId(ev.id)} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {view === "day" || view === "agenda" ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <input type="date" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                <div className="text-sm font-bold">{view === "agenda" ? "Agenda" : "Day timeline"}</div>
              </div>
              {(view === "day" ? byDate.get(selectedDate) || [] : upcoming).map((ev) => (
                <div key={ev.id} className="mb-2 flex items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold">{ev.title}</div>
                    <div className="text-xs text-slate-500">
                      {ev.date} {ev.startTime || ""} · {ev.eventType} · {ev.source}
                    </div>
                  </div>
                  {ev.source === "calendar" ? (
                    <div className="flex gap-2">
                      <button className="text-xs font-semibold text-cyan-700" onClick={async () => { await duplicateCalendarEvent(ev.id); setMsg("Duplicated"); }}>
                        Dup
                      </button>
                      <button className="text-xs font-semibold text-amber-700" onClick={async () => { await archiveCalendarEvent(ev.id); setMsg("Archived"); }}>
                        Archive
                      </button>
                      <button className="text-xs font-semibold text-rose-600" onClick={async () => { await softDeleteCalendarEvent(ev.id); setMsg("Deleted"); }}>
                        Del
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {!(view === "day" ? byDate.get(selectedDate) || [] : upcoming).length ? <div className="py-10 text-center text-sm text-slate-500">No events.</div> : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-bold">Today</div>
            {todayItems.slice(0, 8).map((i) => (
              <div key={i.id} className="mb-1 truncate text-xs font-semibold" style={{ color: i.color }}>
                {i.title}
              </div>
            ))}
            {!todayItems.length ? <div className="text-xs text-slate-500">Nothing scheduled.</div> : null}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-bold">Legend</div>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(EVENT_COLORS).slice(0, 10).map(([k, c]) => (
                <div key={k} className="flex items-center gap-1 text-[10px]">
                  <span className="h-2 w-2 rounded-full" style={{ background: c }} />
                  {k}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-xl font-black">{value}</div>
    </div>
  );
}

function EventChip({ ev, onDrag }: { ev: UnifiedCalendarItem; onDrag: () => void }) {
  return (
    <div
      draggable={ev.source === "calendar"}
      onDragStart={onDrag}
      className="mb-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-white"
      style={{ background: ev.color }}
    >
      {ev.startTime ? `${ev.startTime} ` : ""}
      {ev.title}
    </div>
  );
}
