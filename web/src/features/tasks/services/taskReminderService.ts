import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { num } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import { pushNotification } from "@/features/orders/services/orderEngine";
import type { ReminderCategory, ReminderDoc, TaskPriority, RecurrenceFreq } from "../types";

export async function upsertReminder(input: Partial<ReminderDoc> & { title: string; dueDate: string; id?: string }) {
  const title = input.title.trim();
  if (!title) throw new Error("Title required");
  if (!input.dueDate) throw new Error("Due date required");

  const id = input.id || doc(collection(db, "reminders")).id;
  const ref = doc(db, "reminders", id);
  const prev = await getDoc(ref);

  const payload: ReminderDoc = {
    title,
    dueDate: input.dueDate.slice(0, 10),
    dueTime: input.dueTime || "",
    notifyBeforeDays: num(input.notifyBeforeDays ?? 1),
    notifyBeforeMinutes: input.notifyBeforeMinutes || [60, 1440],
    category: (input.category || "custom") as ReminderCategory,
    priority: (input.priority || "medium") as TaskPriority,
    assignedTo: input.assignedTo ?? null,
    assignedName: input.assignedName ?? null,
    channels: input.channels || ["in_app"],
    recurrence: (input.recurrence || "once") as RecurrenceFreq,
    recurrenceInterval: num(input.recurrenceInterval) || 1,
    recurrenceEndDate: input.recurrenceEndDate ?? null,
    recurrenceCount: input.recurrenceCount ?? null,
    completed: input.completed ?? false,
    done: input.done ?? input.completed ?? false,
    enabled: input.enabled ?? true,
    snoozedUntil: input.snoozedUntil ?? null,
    notes: input.notes || "",
    tags: input.tags || [],
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
    syncStatus: "synced",
    isDeleted: false,
    ...(prev.exists() ? auditUpdate({ status: input.completed ? "done" : "open" }) : auditCreate({ status: "open" }))
  };

  await setDoc(ref, payload, { merge: true });

  if (input.recurrence && input.recurrence !== "once") {
    const rref = doc(collection(db, "recurringReminders"));
    await setDoc(rref, {
      reminderId: id,
      ...payload,
      ...auditCreate({ status: "active" })
    });
  }

  await logActivity({
    action: prev.exists() ? "reminder_updated" : "reminder_created",
    entityType: "reminders",
    entityId: id,
    message: title
  });

  await pushNotification({
    title: "Reminder saved",
    body: `${title} · due ${payload.dueDate}`,
    kind: "scheduled_reminder",
    roleTargets: ["manager", "owner", "cashier", "admin"],
    status: "unread",
    isDeleted: false,
    syncStatus: "synced"
  });

  return id;
}

export async function completeReminder(id: string) {
  await setDoc(doc(db, "reminders", id), { completed: true, done: true, status: "done", ...auditUpdate() }, { merge: true });
  await logActivity({ action: "reminder_completed", entityType: "reminders", entityId: id, message: id });
}

export async function snoozeReminder(id: string, untilISO: string) {
  await setDoc(doc(db, "reminders", id), { snoozedUntil: untilISO, ...auditUpdate() }, { merge: true });
}

export function nextDueDate(dueDate: string, freq: RecurrenceFreq, interval = 1): string {
  const d = new Date(dueDate + "T00:00:00");
  const n = Math.max(1, interval);
  switch (freq) {
    case "hourly":
      d.setHours(d.getHours() + n);
      break;
    case "daily":
      d.setDate(d.getDate() + n);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7 * n);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + n);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3 * n);
      break;
    case "half_yearly":
      d.setMonth(d.getMonth() + 6 * n);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + n);
      break;
    default:
      return dueDate;
  }
  return d.toISOString().slice(0, 10);
}

export async function spawnNextRecurrence(reminder: ReminderDoc & { id: string }) {
  if (!reminder.recurrence || reminder.recurrence === "once") return null;
  const next = nextDueDate(reminder.dueDate, reminder.recurrence, reminder.recurrenceInterval || 1);
  if (reminder.recurrenceEndDate && next > reminder.recurrenceEndDate) return null;
  return upsertReminder({
    title: reminder.title,
    dueDate: next,
    category: reminder.category,
    priority: reminder.priority,
    notifyBeforeDays: reminder.notifyBeforeDays,
    recurrence: reminder.recurrence,
    recurrenceInterval: reminder.recurrenceInterval,
    recurrenceEndDate: reminder.recurrenceEndDate,
    channels: reminder.channels,
    assignedTo: reminder.assignedTo,
    assignedName: reminder.assignedName,
    notes: reminder.notes,
    tags: reminder.tags
  });
}

export const REMINDER_PRESETS: Array<{ category: ReminderCategory; title: string }> = [
  { category: "vendor_payment", title: "Vendor payment due" },
  { category: "salary", title: "Salary disbursement" },
  { category: "rent", title: "Shop rent" },
  { category: "utility", title: "Electricity bill" },
  { category: "utility", title: "Gas cylinder" },
  { category: "utility", title: "Internet bill" },
  { category: "inventory", title: "Stock purchase" },
  { category: "inventory", title: "Physical inventory count" },
  { category: "compliance", title: "GST filing" },
  { category: "compliance", title: "FSSAI renewal" },
  { category: "compliance", title: "Fire NOC renewal" },
  { category: "compliance", title: "Trade license renewal" },
  { category: "maintenance", title: "Kitchen deep cleaning" },
  { category: "maintenance", title: "Pest control" },
  { category: "maintenance", title: "Equipment service" },
  { category: "customer", title: "Customer follow-up" },
  { category: "customer", title: "Catering booking follow-up" },
  { category: "birthday", title: "Staff birthday wish" },
  { category: "checklist", title: "Daily opening checklist" },
  { category: "checklist", title: "Weekly closing checklist" },
  { category: "custom", title: "Custom reminder" }
];

/** Backward-compatible task exports */
export {
  upsertTask,
  setTaskStatus,
  addTaskComment,
  softDeleteTask,
  archiveTask,
  duplicateTask,
  toggleChecklistItem,
  addChecklistItem,
  spawnNextTaskRecurrence
} from "./taskEngine";
