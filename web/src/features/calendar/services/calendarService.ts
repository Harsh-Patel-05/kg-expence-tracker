import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import { emitNotification } from "@/features/notifications/services/notificationEngine";
import { nextDueDate } from "@/features/tasks/services/taskReminderService";
import type { RecurrenceFreq } from "@/features/hr/types";
import type {
  CalendarEventDoc,
  CalendarEventType,
  UnifiedCalendarItem
} from "../types";
import { EVENT_COLORS as COLORS } from "../types";
import type { ReminderDoc, TaskDoc, LeaveRequestDoc, EmployeeDoc } from "@/features/hr/types";

function eventNumber() {
  return `EVT-${Date.now().toString(36).toUpperCase()}`;
}

export async function upsertCalendarEvent(input: Partial<CalendarEventDoc> & { title: string; date: string; id?: string }) {
  const title = input.title.trim();
  if (!title) throw new Error("Title required");
  if (!input.date) throw new Error("Date required");
  if (input.startTime && input.endTime && input.startTime > input.endTime && !input.allDay) {
    throw new Error("End time must be after start time");
  }

  const id = input.id || doc(collection(db, "calendarEvents")).id;
  const ref = doc(db, "calendarEvents", id);
  const prev = await getDoc(ref);
  const eventType = (input.eventType || prev.data()?.eventType || "custom") as CalendarEventType;

  const payload: CalendarEventDoc = {
    title,
    description: input.description ?? prev.data()?.description ?? "",
    eventNumber: input.eventNumber || prev.data()?.eventNumber || eventNumber(),
    category: input.category ?? prev.data()?.category ?? eventType,
    eventType,
    priority: input.priority || prev.data()?.priority || "medium",
    date: input.date.slice(0, 10),
    startTime: input.startTime ?? prev.data()?.startTime ?? "",
    endTime: input.endTime ?? prev.data()?.endTime ?? "",
    allDay: input.allDay ?? prev.data()?.allDay ?? true,
    location: input.location ?? prev.data()?.location ?? "",
    assigneeId: input.assigneeId ?? prev.data()?.assigneeId ?? null,
    assigneeName: input.assigneeName ?? prev.data()?.assigneeName ?? null,
    department: input.department ?? prev.data()?.department ?? "",
    branch: input.branch ?? prev.data()?.branch ?? "Main",
    relatedCustomer: input.relatedCustomer ?? null,
    relatedSupplier: input.relatedSupplier ?? null,
    relatedOrderId: input.relatedOrderId ?? null,
    relatedTaskId: input.relatedTaskId ?? null,
    relatedReminderId: input.relatedReminderId ?? null,
    color: input.color || prev.data()?.color || COLORS[eventType],
    attachments: input.attachments ?? prev.data()?.attachments ?? [],
    notes: input.notes ?? prev.data()?.notes ?? "",
    recurrence: (input.recurrence || prev.data()?.recurrence || "once") as RecurrenceFreq,
    recurrenceInterval: num(input.recurrenceInterval ?? prev.data()?.recurrenceInterval) || 1,
    recurrenceEndDate: input.recurrenceEndDate ?? prev.data()?.recurrenceEndDate ?? null,
    recurrenceCount: input.recurrenceCount ?? prev.data()?.recurrenceCount ?? null,
    notifyBeforeMinutes: input.notifyBeforeMinutes ?? prev.data()?.notifyBeforeMinutes ?? [60, 1440],
    archived: input.archived ?? false,
    source: input.source || "manual",
    syncStatus: "synced",
    isDeleted: false,
    ...(prev.exists() ? auditUpdate({ status: "scheduled" }) : auditCreate({ status: "scheduled" }))
  };

  await setDoc(ref, payload, { merge: true });
  await logActivity({
    action: prev.exists() ? "calendar_event_updated" : "calendar_event_created",
    entityType: "calendarEvents",
    entityId: id,
    message: title
  });

  if (!prev.exists()) {
    await emitNotification({
      title: "Calendar event",
      body: `${title} · ${payload.date}`,
      kind: "custom",
      priority: "medium",
      link: "/calendar",
      entityType: "calendarEvents",
      entityId: id,
      dedupeKey: `cal-${id}`
    });
  }

  return id;
}

export async function moveCalendarEvent(id: string, date: string, startTime?: string, endTime?: string) {
  await setDoc(
    doc(db, "calendarEvents", id),
    {
      date: date.slice(0, 10),
      ...(startTime != null ? { startTime } : {}),
      ...(endTime != null ? { endTime } : {}),
      ...auditUpdate()
    },
    { merge: true }
  );
}

export async function softDeleteCalendarEvent(id: string) {
  await setDoc(doc(db, "calendarEvents", id), { isDeleted: true, ...auditUpdate({ status: "deleted" }) }, { merge: true });
}

export async function archiveCalendarEvent(id: string, archived = true) {
  await setDoc(doc(db, "calendarEvents", id), { archived, ...auditUpdate({ status: archived ? "archived" : "scheduled" }) }, { merge: true });
}

export async function duplicateCalendarEvent(id: string) {
  const snap = await getDoc(doc(db, "calendarEvents", id));
  if (!snap.exists()) throw new Error("Event not found");
  const data = snap.data() as CalendarEventDoc;
  return upsertCalendarEvent({
    ...data,
    title: `${data.title} (copy)`,
    eventNumber: undefined
  });
}

export async function spawnNextEventRecurrence(event: CalendarEventDoc & { id: string }) {
  if (!event.recurrence || event.recurrence === "once") return null;
  const next = nextDueDate(event.date, event.recurrence, event.recurrenceInterval || 1);
  if (event.recurrenceEndDate && next > event.recurrenceEndDate) return null;
  return upsertCalendarEvent({
    ...event,
    date: next,
    eventNumber: undefined,
    source: "manual"
  });
}

export function buildUnifiedCalendar(args: {
  events: Array<CalendarEventDoc & { id: string }>;
  reminders?: Array<ReminderDoc & { id: string }>;
  tasks?: Array<TaskDoc & { id: string }>;
  leaves?: Array<LeaveRequestDoc & { id: string }>;
  staff?: Array<EmployeeDoc & { id: string }>;
  orders?: Array<{ id: string; date?: string; orderNumber?: string; status?: string; total?: number }>;
  month?: string; // YYYY-MM for birthday filter optional
}): UnifiedCalendarItem[] {
  const items: UnifiedCalendarItem[] = [];

  for (const e of args.events) {
    if (e.isDeleted || e.archived) continue;
    items.push({
      id: e.id,
      title: e.title,
      date: String(e.date || "").slice(0, 10),
      startTime: e.startTime,
      endTime: e.endTime,
      allDay: e.allDay,
      eventType: e.eventType,
      color: e.color || COLORS[e.eventType] || COLORS.custom,
      source: "calendar",
      priority: e.priority,
      meta: { eventNumber: e.eventNumber }
    });
  }

  for (const r of args.reminders || []) {
    if (r.isDeleted || r.completed || r.done) continue;
    items.push({
      id: `rem-${r.id}`,
      title: r.title,
      date: String(r.dueDate || "").slice(0, 10),
      allDay: true,
      eventType: "reminder",
      color: COLORS.reminder,
      source: "reminder",
      priority: r.priority,
      meta: { reminderId: r.id }
    });
  }

  for (const t of args.tasks || []) {
    if (t.isDeleted || t.archived || !t.dueDate) continue;
    if (t.status === "done" || t.status === "completed" || t.status === "cancelled") continue;
    items.push({
      id: `task-${t.id}`,
      title: t.title,
      date: String(t.dueDate).slice(0, 10),
      allDay: true,
      eventType: "task",
      color: COLORS.task,
      source: "task",
      priority: t.priority,
      meta: { taskId: t.id }
    });
  }

  for (const l of args.leaves || []) {
    if (l.approvalStatus === "rejected" || l.approvalStatus === "cancelled") continue;
    const from = String(l.fromDate || "").slice(0, 10);
    const to = String(l.toDate || from).slice(0, 10);
    let d = from;
    while (d && d <= to) {
      items.push({
        id: `leave-${l.id}-${d}`,
        title: `Leave · ${l.name}`,
        date: d,
        allDay: true,
        eventType: "leave",
        color: COLORS.leave,
        source: "leave",
        meta: { leaveId: l.id, leaveType: l.leaveType }
      });
      const next = new Date(d + "T00:00:00");
      next.setDate(next.getDate() + 1);
      d = next.toISOString().slice(0, 10);
      if (items.length > 5000) break;
    }
  }

  const today = isoDate();
  const year = Number(today.slice(0, 4));
  for (const s of args.staff || []) {
    if (!s.dob || s.active === false) continue;
    const mmdd = String(s.dob).slice(5, 10);
    if (!/^\d{2}-\d{2}$/.test(mmdd)) continue;
    items.push({
      id: `bday-${s.id}-${year}`,
      title: `Birthday · ${s.name}`,
      date: `${year}-${mmdd}`,
      allDay: true,
      eventType: "birthday",
      color: COLORS.birthday,
      source: "birthday",
      meta: { staffId: s.id }
    });
  }

  for (const o of args.orders || []) {
    const d = String(o.date || "").slice(0, 10);
    if (!d) continue;
    items.push({
      id: `ord-${o.id}`,
      title: `Order ${o.orderNumber || o.id.slice(0, 6)}`,
      date: d,
      allDay: true,
      eventType: "order",
      color: COLORS.order,
      source: "order",
      meta: { orderId: o.id, status: o.status }
    });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime || "").localeCompare(String(b.startTime || "")));
}
