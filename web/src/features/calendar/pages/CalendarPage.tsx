import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
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
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";

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
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Scheduling"
        title="Calendar"
        actions={
          <>
          <Link to="/documents" className="kg-btn kg-btn-secondary">
            Documents
          </Link>
          <Link to="/reminders" className="kg-btn kg-btn-secondary">
            Reminders
          </Link>
          <Link to="/tasks" className="kg-btn kg-btn-primary">
            Tasks
          </Link>
          </>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today" value={todayItems.length} />
        <Stat label="Upcoming" value={upcoming.length} />
        <Stat label="Birthdays today" value={birthdays.length} />
        <Stat label="Open tasks on calendar" value={filtered.filter((i) => i.source === "task").length} />
      </div>

      <Card hover={false} className="!p-3"><div className="flex flex-wrap gap-2">
        {(["month", "week", "day", "agenda", "year"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`kg-btn capitalize ${view === v ? "kg-btn-primary" : "kg-btn-secondary"}`}>
            {v}
          </button>
        ))}
        <input type="month" className="kg-input !w-auto" value={cursor} onChange={(e) => setCursor(e.target.value)} />
        <input className="kg-input min-w-[160px] flex-1 !w-auto" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="kg-input !w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {Object.keys(EVENT_COLORS).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div></Card>

      <div className="grid gap-4 xl:grid-cols-[300px_1fr_280px]">
        <Card padding="sm" hover={false}>
          <div className="mb-2 text-[14px] font-bold text-text-primary">Create event</div>
          <input className="kg-input mb-2 w-full" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <input type="date" className="kg-input mb-2 w-full" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <label className="mb-2 flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={form.allDay} onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))} />
            All day
          </label>
          {!form.allDay ? (
            <div className="mb-2 flex gap-2">
              <input type="time" className="kg-input w-full" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
              <input type="time" className="kg-input w-full" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
            </div>
          ) : null}
          <select className="kg-input mb-2 w-full" value={form.eventType} onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value as CalendarEventType }))}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select className="kg-input mb-2 w-full" value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as RecurrenceFreq }))}>
            <option value="once">One time</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <textarea className="kg-input mb-2 w-full" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes" />
          <button disabled={!form.title.trim()} onClick={createEvent} className="w-full kg-btn kg-btn-primary disabled:opacity-50">
            Save event
          </button>
          <div className="mt-3 text-[10px] text-text-muted">Drag calendar events onto another day to reschedule. Integrated reminders/tasks/leave/orders are read-only.</div>
        </Card>

        <div className="min-w-0 space-y-3">
          {view === "month" || view === "year" ? (
            <div className="grid grid-cols-7 gap-1 rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 p-2 shadow-panel">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="px-1 py-1 text-center text-[10px] font-bold uppercase text-text-muted">
                  {d}
                </div>
              ))}
              {cells.map((c, i) => (
                <div
                  key={i}
                  className={`min-h-[88px] rounded-lg border border-stroke-0 p-1 ${c.date === today ? "bg-primary-light" : "bg-bg-1"} ${c.date === selectedDate ? "ring-2 ring-primary" : ""}`}
                  onClick={() => c.date && setSelectedDate(c.date)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => c.date && onDropDate(c.date)}
                >
                  {c.date ? <div className="text-[10px] font-bold text-text-secondary">{Number(c.date.slice(-2))}</div> : null}
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
                  {(byDate.get(c.date || "") || []).length > 3 ? <div className="text-[9px] text-text-muted">+{(byDate.get(c.date || "") || []).length - 3}</div> : null}
                </div>
              ))}
            </div>
          ) : null}

          {view === "week" ? (
            <div className="grid grid-cols-7 gap-2">
              {weekDates.map((d) => (
                <div key={d} className="min-h-[220px] rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 p-2 shadow-panel" onDragOver={(e) => e.preventDefault()} onDrop={() => onDropDate(d)}>
                  <div className="mb-2 text-xs font-bold">{d}</div>
                  {(byDate.get(d) || []).map((ev) => (
                    <EventChip key={ev.id} ev={ev} onDrag={() => setDragId(ev.id)} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {view === "day" || view === "agenda" ? (
            <Card padding="sm" hover={false}>
              <div className="mb-3 flex items-center gap-2">
                <input type="date" className="kg-input !w-auto" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                <div className="text-[14px] font-bold text-text-primary">{view === "agenda" ? "Agenda" : "Day timeline"}</div>
              </div>
              {(view === "day" ? byDate.get(selectedDate) || [] : upcoming).map((ev) => (
                <div key={ev.id} className="mb-2 flex items-start justify-between gap-2 rounded-lg border border-stroke-0 bg-bg-1 px-3 py-2">
                  <div>
                    <div className="text-[14px] font-bold text-text-primary">{ev.title}</div>
                    <div className="text-xs text-text-muted">
                      {ev.date} {ev.startTime || ""} · {ev.eventType} · {ev.source}
                    </div>
                  </div>
                  {ev.source === "calendar" ? (
                    <div className="flex gap-2">
                      <button className="text-xs font-semibold text-primary" onClick={async () => { await duplicateCalendarEvent(ev.id); setMsg("Duplicated"); }}>
                        Dup
                      </button>
                      <button className="text-xs font-semibold text-warning" onClick={async () => { await archiveCalendarEvent(ev.id); setMsg("Archived"); }}>
                        Archive
                      </button>
                      <button className="text-xs font-semibold text-danger" onClick={async () => { await softDeleteCalendarEvent(ev.id); setMsg("Deleted"); }}>
                        Del
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {!(view === "day" ? byDate.get(selectedDate) || [] : upcoming).length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No events." /> : null}
            </Card>
          ) : null}
        </div>

        <div className="space-y-3">
          <Card padding="sm" hover={false}>
            <div className="mb-2 text-[14px] font-bold text-text-primary">Today</div>
            {todayItems.slice(0, 8).map((i) => (
              <div key={i.id} className="mb-1 truncate text-xs font-semibold" style={{ color: i.color }}>
                {i.title}
              </div>
            ))}
            {!todayItems.length ? <div className="text-xs text-text-muted">Nothing scheduled.</div> : null}
          </Card>
          <Card padding="sm" hover={false}>
            <div className="mb-2 text-[14px] font-bold text-text-primary">Legend</div>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(EVENT_COLORS).slice(0, 10).map(([k, c]) => (
                <div key={k} className="flex items-center gap-1 text-[10px]">
                  <span className="h-2 w-2 rounded-full" style={{ background: c }} />
                  {k}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <KpiCard title={label} value={String(value)} />;
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
