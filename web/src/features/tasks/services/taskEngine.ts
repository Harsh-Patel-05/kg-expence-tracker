import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import { pushNotification } from "@/features/orders/services/orderEngine";
import type { RecurrenceFreq, TaskDoc, TaskPriority, TaskStatus, TaskType } from "@/features/hr/types";
import { checklistProgress } from "@/features/expenses/utils/gst";

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function taskNumber() {
  return `TK-${Date.now().toString(36).toUpperCase()}`;
}

export function normalizeTaskStatus(status: string): TaskStatus {
  if (status === "completed") return "done";
  if (status === "todo") return "assigned";
  return status as TaskStatus;
}

export function isTaskDone(status: string) {
  return status === "done" || status === "completed";
}

export async function upsertTask(input: Partial<TaskDoc> & { title: string; id?: string }) {
  const title = input.title.trim();
  if (!title) throw new Error("Task title required");
  if (input.parentTaskId && input.dependencyIds?.includes(input.parentTaskId)) {
    throw new Error("Invalid task dependency: parent cannot be a dependency");
  }

  const id = input.id || doc(collection(db, "tasks")).id;
  const ref = doc(db, "tasks", id);
  const prev = await getDoc(ref);
  const checklist = input.checklist ?? (prev.data()?.checklist as TaskDoc["checklist"]) ?? [];
  const autoPct = checklistProgress(checklist);
  const completionPct =
    input.completionPct != null ? Math.min(100, Math.max(0, num(input.completionPct))) : autoPct || num(prev.data()?.completionPct);

  let status = (input.status || prev.data()?.status || "assigned") as TaskStatus;
  if (status === "todo") status = "assigned";
  if (status === "completed") status = "done";

  const payload: TaskDoc = {
    title,
    description: input.description ?? prev.data()?.description ?? "",
    taskNumber: input.taskNumber || prev.data()?.taskNumber || taskNumber(),
    taskType: (input.taskType || prev.data()?.taskType || "custom") as TaskType,
    assigneeId: input.assigneeId ?? prev.data()?.assigneeId ?? null,
    assigneeName: input.assigneeName ?? prev.data()?.assigneeName ?? null,
    assigneeIds: input.assigneeIds ?? prev.data()?.assigneeIds ?? [],
    assigneeNames: input.assigneeNames ?? prev.data()?.assigneeNames ?? [],
    assignedBy: input.assignedBy ?? prev.data()?.assignedBy ?? null,
    assignedByName: input.assignedByName ?? prev.data()?.assignedByName ?? null,
    team: input.team ?? prev.data()?.team ?? "",
    department: input.department ?? prev.data()?.department ?? "",
    branch: input.branch ?? prev.data()?.branch ?? "Main",
    category: input.category ?? prev.data()?.category ?? "",
    priority: (input.priority || prev.data()?.priority || "medium") as TaskPriority,
    status,
    labels: input.labels ?? prev.data()?.labels ?? [],
    tags: input.tags ?? prev.data()?.tags ?? [],
    startDate: input.startDate ?? prev.data()?.startDate ?? null,
    dueDate: input.dueDate ?? prev.data()?.dueDate ?? null,
    endDate: input.endDate ?? prev.data()?.endDate ?? null,
    estimatedHours: num(input.estimatedHours ?? prev.data()?.estimatedHours),
    actualHours: num(input.actualHours ?? prev.data()?.actualHours),
    completionPct: status === "done" ? 100 : completionPct,
    checklist,
    subtaskIds: input.subtaskIds ?? prev.data()?.subtaskIds ?? [],
    parentTaskId: input.parentTaskId ?? prev.data()?.parentTaskId ?? null,
    dependencyIds: input.dependencyIds ?? prev.data()?.dependencyIds ?? [],
    blockedByIds: input.blockedByIds ?? prev.data()?.blockedByIds ?? [],
    waitingForIds: input.waitingForIds ?? prev.data()?.waitingForIds ?? [],
    attachments: input.attachments ?? prev.data()?.attachments ?? [],
    comments: input.comments ?? prev.data()?.comments ?? [],
    notes: input.notes ?? prev.data()?.notes ?? "",
    internalNotes: input.internalNotes ?? prev.data()?.internalNotes ?? "",
    recurrence: (input.recurrence || prev.data()?.recurrence || "once") as RecurrenceFreq,
    recurrenceInterval: num(input.recurrenceInterval ?? prev.data()?.recurrenceInterval) || 1,
    archived: input.archived ?? prev.data()?.archived ?? false,
    completedAt: status === "done" ? isoDate() : input.completedAt ?? null,
    syncStatus: "synced",
    isDeleted: false,
    ...(prev.exists() ? auditUpdate({ status }) : auditCreate({ status }))
  };

  await setDoc(ref, payload, { merge: true });

  await logActivity({
    action: prev.exists() ? "task_updated" : "task_created",
    entityType: "tasks",
    entityId: id,
    message: title
  });

  // denormalized activity collection
  await setDoc(doc(collection(db, "taskActivity")), {
    taskId: id,
    action: prev.exists() ? "updated" : "created",
    message: title,
    ...auditCreate({ status: "recorded" })
  });

  if (!prev.exists() && (payload.assigneeName || payload.assigneeNames?.length)) {
    await pushNotification({
      title: "Task assigned",
      body: title,
      kind: "info",
      roleTargets: ["manager", "owner", "admin", "cashier"],
      status: "unread",
      isDeleted: false,
      syncStatus: "synced"
    });
  }

  return id;
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  const normalized = status === "completed" ? "done" : status === "todo" ? "assigned" : status;
  await setDoc(
    doc(db, "tasks", id),
    {
      status: normalized,
      completionPct: normalized === "done" ? 100 : undefined,
      completedAt: normalized === "done" ? isoDate() : null,
      ...auditUpdate({ status: normalized })
    },
    { merge: true }
  );
  await logActivity({
    action: normalized === "done" ? "task_completed" : "task_status_changed",
    entityType: "tasks",
    entityId: id,
    message: normalized
  });
  await setDoc(doc(collection(db, "taskActivity")), {
    taskId: id,
    action: "status_changed",
    message: normalized,
    ...auditCreate({ status: "recorded" })
  });
  if (normalized === "done") {
    await pushNotification({
      title: "Task completed",
      body: id,
      kind: "info",
      roleTargets: ["manager", "owner", "admin"],
      status: "unread",
      isDeleted: false,
      syncStatus: "synced"
    });
  }
}

export async function softDeleteTask(id: string) {
  await setDoc(doc(db, "tasks", id), { isDeleted: true, ...auditUpdate({ status: "deleted" }) }, { merge: true });
  await logActivity({ action: "task_deleted", entityType: "tasks", entityId: id, message: id });
}

export async function archiveTask(id: string, archived = true) {
  await setDoc(doc(db, "tasks", id), { archived, ...auditUpdate() }, { merge: true });
}

export async function duplicateTask(id: string) {
  const snap = await getDoc(doc(db, "tasks", id));
  if (!snap.exists()) throw new Error("Task not found");
  const data = snap.data() as TaskDoc;
  return upsertTask({
    ...data,
    title: `${data.title} (copy)`,
    status: "draft",
    completedAt: null,
    completionPct: 0,
    checklist: (data.checklist || []).map((c) => ({ ...c, id: uid(), done: false })),
    comments: [],
    taskNumber: undefined
  });
}

export async function addTaskComment(id: string, text: string, by?: string, parentId?: string | null) {
  const ref = doc(db, "tasks", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Task not found");
  const comments = [
    ...(snap.data().comments || []),
    { id: uid(), text, by, at: new Date().toISOString(), parentId: parentId || null }
  ];
  await setDoc(ref, { comments, ...auditUpdate() }, { merge: true });
  await setDoc(doc(collection(db, "taskComments")), {
    taskId: id,
    text,
    by: by || null,
    parentId: parentId || null,
    ...auditCreate({ status: "active" })
  });
  await pushNotification({
    title: "Task comment",
    body: text.slice(0, 80),
    kind: "info",
    roleTargets: ["manager", "owner", "admin"],
    status: "unread",
    isDeleted: false,
    syncStatus: "synced"
  });
}

export async function toggleChecklistItem(taskId: string, itemId: string, done: boolean) {
  const ref = doc(db, "tasks", taskId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Task not found");
  const checklist = (snap.data().checklist || []).map((c: any) => (c.id === itemId ? { ...c, done } : c));
  const completionPct = checklistProgress(checklist);
  await setDoc(ref, { checklist, completionPct, ...auditUpdate() }, { merge: true });
}

export async function addChecklistItem(taskId: string, text: string, parentId?: string | null) {
  const ref = doc(db, "tasks", taskId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Task not found");
  const checklist = [...(snap.data().checklist || []), { id: uid(), text, done: false, parentId: parentId || null }];
  await setDoc(ref, { checklist, completionPct: checklistProgress(checklist), ...auditUpdate() }, { merge: true });
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

export async function spawnNextTaskRecurrence(task: TaskDoc & { id: string }) {
  if (!task.recurrence || task.recurrence === "once" || !task.dueDate) return null;
  const next = nextDueDate(task.dueDate, task.recurrence, task.recurrenceInterval || 1);
  return upsertTask({
    title: task.title,
    description: task.description,
    taskType: task.taskType,
    priority: task.priority,
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeName,
    assigneeIds: task.assigneeIds,
    assigneeNames: task.assigneeNames,
    department: task.department,
    branch: task.branch,
    dueDate: next,
    startDate: next,
    recurrence: task.recurrence,
    recurrenceInterval: task.recurrenceInterval,
    checklist: (task.checklist || []).map((c) => ({ ...c, id: uid(), done: false })),
    status: "assigned",
    tags: task.tags,
    labels: task.labels
  });
}
