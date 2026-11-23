import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { EmployeeDoc } from "@/features/hr/types";
import type { RecurrenceFreq, TaskDoc, TaskPriority, TaskStatus, TaskType } from "../types";
import { TASK_AUTOMATION_PRESETS, TASK_TYPES } from "../types";
import {
  addChecklistItem,
  addTaskComment,
  archiveTask,
  duplicateTask,
  isTaskDone,
  setTaskStatus,
  softDeleteTask,
  spawnNextTaskRecurrence,
  toggleChecklistItem,
  upsertTask
} from "../services/taskEngine";
import { canManageTasks, canOverrideTaskProgress } from "@/features/expenses/utils/permissions";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";

import { ContentLoading } from "@/components/ui/Loading";

const COLUMNS: TaskStatus[] = ["draft", "assigned", "in_progress", "waiting", "blocked", "done"];
const PRIORITIES: TaskPriority[] = ["critical", "high", "medium", "low"];

const priorityColor: Record<TaskPriority, string> = {
  critical: "bg-danger-bg text-danger",
  high: "bg-primary-light text-primary",
  medium: "bg-warning-bg text-warning",
  low: "bg-bg-1 text-text-secondary"
};

function boardStatus(s: string): TaskStatus {
  if (s === "todo" || s === "accepted") return "assigned";
  if (s === "completed") return "done";
  if (s === "overdue") return "blocked";
  return s as TaskStatus;
}

export function TasksBoardPage() {
  const { role, user } = usePosAuth();
  const canManage = canManageTasks(role);
  const canOverride = canOverrideTaskProgress(role);
  const { data: tasks, loading, error } = useRestaurantCollection<TaskDoc>({ path: "tasks" });
  const { data: staff } = useRestaurantCollection<EmployeeDoc>({ path: "staff" });

  const [view, setView] = useState<"kanban" | "table" | "list" | "calendar" | "agenda">("kanban");
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState("all");
  const [dept, setDept] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(isoDate().slice(0, 7));
  const [comment, setComment] = useState("");
  const [checkText, setCheckText] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    assigneeId: "",
    assigneeName: "",
    priority: "medium" as TaskPriority,
    taskType: "custom" as TaskType,
    department: "",
    dueDate: isoDate(),
    recurrence: "once" as RecurrenceFreq,
    completionPct: ""
  });

  const today = isoDate();

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (!showArchived && t.archived) return false;
      if (t.status === "cancelled" && statusFilter !== "cancelled") return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (dept !== "all" && (t.department || "") !== dept) return false;
      if (statusFilter !== "all" && boardStatus(t.status) !== statusFilter && t.status !== statusFilter) return false;
      if (!query) return true;
      return `${t.taskNumber || ""} ${t.title} ${t.assigneeName || ""} ${t.department || ""} ${(t.tags || []).join(" ")} ${(t.labels || []).join(" ")}`
        .toLowerCase()
        .includes(query);
    });
  }, [tasks, q, priority, dept, statusFilter, showArchived]);

  const departments = useMemo(() => {
    const set = new Set(tasks.map((t) => t.department).filter(Boolean) as string[]);
    return ["all", ...Array.from(set).sort()];
  }, [tasks]);

  const byCol = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    COLUMNS.forEach((c) => {
      map[c] = filtered.filter((t) => boardStatus(t.status) === c);
    });
    return map;
  }, [filtered]);

  const selected = filtered.find((t) => t.id === selectedId) || tasks.find((t) => t.id === selectedId) || null;

  const stats = useMemo(() => {
    const open = filtered.filter((t) => !isTaskDone(t.status)).length;
    const overdue = filtered.filter((t) => !isTaskDone(t.status) && t.dueDate && t.dueDate < today).length;
    const doneToday = filtered.filter((t) => isTaskDone(t.status) && String(t.completedAt || "").slice(0, 10) === today).length;
    return { open, overdue, doneToday, total: filtered.length };
  }, [filtered, today]);

  const calendarDays = useMemo(() => {
    const [y, m] = calMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: Array<{ date: string | null; items: typeof filtered }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ date: null, items: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${calMonth}-${String(d).padStart(2, "0")}`;
      cells.push({ date, items: filtered.filter((t) => String(t.dueDate || "").slice(0, 10) === date) });
    }
    return cells;
  }, [calMonth, filtered]);

  async function create() {
    if (!canManage || !form.title.trim()) return;
    try {
      const id = await upsertTask({
        title: form.title,
        description: form.description,
        assigneeId: form.assigneeId || null,
        assigneeName: form.assigneeName || null,
        assigneeIds: form.assigneeId ? [form.assigneeId] : [],
        assigneeNames: form.assigneeName ? [form.assigneeName] : [],
        priority: form.priority,
        taskType: form.taskType,
        department: form.department,
        dueDate: form.dueDate,
        startDate: form.dueDate,
        recurrence: form.recurrence,
        status: "assigned",
        assignedBy: user?.uid || null,
        completionPct: form.completionPct ? Number(form.completionPct) : undefined
      });
      setMsg("Task created");
      setForm({ title: "", description: "", assigneeId: "", assigneeName: "", priority: "medium", taskType: "custom", department: "", dueDate: isoDate(), recurrence: "once", completionPct: "" });
      setSelectedId(id);
    } catch (e: any) {
      setMsg(e?.message || "Failed");
    }
  }

  async function completeWithRecurrence(t: TaskDoc & { id: string }) {
    await setTaskStatus(t.id, "done");
    if (t.recurrence && t.recurrence !== "once") await spawnNextTaskRecurrence(t);
    setMsg("Task completed");
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Work management"
        title="Tasks"
        actions={
          <>
          <Link to="/reminders" className="kg-btn kg-btn-secondary">
            Reminders
          </Link>
          <Link to="/expenses" className="kg-btn kg-btn-secondary">
            Expenses
          </Link>
          </>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open" value={stats.open} />
        <Stat label="Overdue" value={stats.overdue} />
        <Stat label="Done today" value={stats.doneToday} />
        <Stat label="Visible" value={stats.total} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["kanban", "table", "list", "calendar", "agenda"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`kg-btn capitalize ${view === v ? "kg-btn-primary" : "kg-btn-secondary"}`}>
            {v}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr_300px]">
        <div className="space-y-3">
          <Card padding="sm" hover={false}>
            <div className="mb-2 text-[14px] font-bold text-text-primary">Create task</div>
            <input className="kg-input mb-2 w-full" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <textarea className="kg-input mb-2 w-full" rows={2} placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <select
              className="kg-input mb-2 w-full"
              value={form.assigneeId}
              onChange={(e) => {
                const s = staff.find((x) => x.id === e.target.value);
                setForm((f) => ({ ...f, assigneeId: e.target.value, assigneeName: s?.name || "" }));
              }}
            >
              <option value="">Assignee</option>
              {staff.filter((s) => s.active !== false).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select className="kg-input mb-2 w-full" value={form.taskType} onChange={(e) => setForm((f) => ({ ...f, taskType: e.target.value as TaskType }))}>
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select className="kg-input mb-2 w-full" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input className="kg-input mb-2 w-full" placeholder="Department" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
            <input type="date" className="kg-input mb-2 w-full" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            <select className="kg-input mb-2 w-full" value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as RecurrenceFreq }))}>
              <option value="once">One time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
            {canOverride ? (
              <input className="kg-input mb-2 w-full" placeholder="Completion % override" value={form.completionPct} onChange={(e) => setForm((f) => ({ ...f, completionPct: e.target.value }))} />
            ) : null}
            <button disabled={!canManage} onClick={create} className="w-full kg-btn kg-btn-primary disabled:opacity-50">
              Create task
            </button>
          </Card>

          <Card padding="sm" hover={false}>
            <div className="mb-2 text-[14px] font-bold text-text-primary">Automation presets</div>
            <div className="max-h-48 space-y-1 overflow-auto">
              {TASK_AUTOMATION_PRESETS.map((p) => (
                <button
                  key={p.title}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-bg-1"
                  onClick={() => setForm((f) => ({ ...f, title: p.title, taskType: p.taskType as TaskType, priority: p.priority }))}
                >
                  {p.title}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap gap-2">
            <input className="kg-input min-w-[160px] flex-1 !w-auto" placeholder="Search ID, title, employee…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="kg-input !w-auto" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="all">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select className="kg-input !w-auto" value={dept} onChange={(e) => setDept(e.target.value)}>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d === "all" ? "All departments" : d}
                </option>
              ))}
            </select>
            <select className="kg-input !w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {COLUMNS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-lg border border-stroke-0 bg-card-0 px-3 py-2 text-xs">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Archived
            </label>
            {view === "calendar" ? <input type="month" className="kg-input !w-auto" value={calMonth} onChange={(e) => setCalMonth(e.target.value)} /> : null}
          </div>

          {loading ? <ContentLoading variant="table" label="Loading" /> : null}

          {view === "kanban" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {COLUMNS.map((col) => (
                <div key={col} className="rounded-[var(--radius-xl)] border border-stroke-0 bg-bg-1 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wide text-text-secondary">{col.replace("_", " ")}</div>
                    <span className="rounded-md bg-card-0 px-2 text-xs font-bold">{byCol[col]?.length || 0}</span>
                  </div>
                  <div className="max-h-[560px] space-y-2 overflow-auto">
                    {(byCol[col] || []).map((t) => (
                      <button key={t.id} type="button" onClick={() => setSelectedId(t.id)} className={`w-full rounded-lg border p-3 text-left shadow-panel ${selectedId === t.id ? "border-primary bg-primary-light" : "border-stroke-0 bg-card-0"}`}>
                        <div className="text-[14px] font-bold text-text-primary">{t.title}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${priorityColor[t.priority]}`}>{t.priority}</span>
                          {t.dueDate ? <span className="rounded-md bg-bg-1 px-2 py-0.5 text-[10px]">{t.dueDate}</span> : null}
                          <span className="rounded-md bg-bg-1 px-2 py-0.5 text-[10px]">{t.completionPct || 0}%</span>
                        </div>
                        {t.assigneeName ? <div className="mt-1 text-xs text-text-muted">{t.assigneeName}</div> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {view === "table" || view === "list" || view === "agenda" ? (
            <Card hover={false} className="!p-0">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                  <tr>
                    <th className="px-3 py-2">Task</th>
                    <th className="px-3 py-2">Assignee</th>
                    <th className="px-3 py-2">Priority</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2">%</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="cursor-pointer border-t border-stroke-0 hover:bg-bg-1" onClick={() => setSelectedId(t.id)}>
                      <td className="px-3 py-2">
                        <div className="font-semibold">{t.title}</div>
                        <div className="text-xs text-text-muted">
                          {t.taskNumber} · {t.taskType || "custom"}
                        </div>
                      </td>
                      <td className="px-3 py-2">{t.assigneeName || "—"}</td>
                      <td className="px-3 py-2 capitalize">{t.priority}</td>
                      <td className="px-3 py-2 capitalize">{t.status}</td>
                      <td className="px-3 py-2">{t.dueDate || "—"}</td>
                      <td className="px-3 py-2">{t.completionPct || 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {!filtered.length && !loading ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No tasks." /> : null}
            </Card>
          ) : null}

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
                  {c.items.slice(0, 2).map((t) => (
                    <button key={t.id} type="button" className="block w-full truncate rounded bg-card-0 px-1 text-left text-[9px] font-semibold" onClick={() => setSelectedId(t.id)}>
                      {t.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <Card padding="sm" hover={false}>
          {!selected ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="Select a task" /> : null}
          {selected ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-text-muted">{selected.taskNumber}</div>
                <div className="text-[16px] font-bold text-text-primary">{selected.title}</div>
                <div className="text-[13px] text-text-secondary">{selected.description || "No description"}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {COLUMNS.filter((c) => c !== boardStatus(selected.status)).map((c) => (
                  <button key={c} disabled={!canManage} className="kg-btn kg-btn-secondary !px-2 !py-1 !text-[11px] capitalize disabled:opacity-40" onClick={() => setTaskStatus(selected.id, c)}>
                    → {c.replace("_", " ")}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="text-xs font-semibold text-success" onClick={() => completeWithRecurrence(selected)}>
                  Complete
                </button>
                <button className="text-xs font-semibold text-primary" onClick={async () => { await duplicateTask(selected.id); setMsg("Duplicated"); }}>
                  Duplicate
                </button>
                <button className="text-xs font-semibold text-warning" onClick={async () => { await archiveTask(selected.id, !selected.archived); setMsg(selected.archived ? "Restored" : "Archived"); }}>
                  {selected.archived ? "Restore" : "Archive"}
                </button>
                <button className="text-xs font-semibold text-danger" onClick={async () => { await softDeleteTask(selected.id); setSelectedId(null); setMsg("Deleted"); }}>
                  Delete
                </button>
              </div>

              <div>
                <div className="mb-1 text-xs font-bold uppercase text-text-muted">Checklist ({selected.completionPct || 0}%)</div>
                <div className="max-h-40 space-y-1 overflow-auto">
                  {(selected.checklist || []).map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={!!c.done} onChange={(e) => toggleChecklistItem(selected.id, c.id, e.target.checked)} />
                      <span className={c.done ? "line-through text-text-muted" : ""}>{c.text}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input className="kg-input flex-1 !w-auto" placeholder="Add item" value={checkText} onChange={(e) => setCheckText(e.target.value)} />
                  <button
                    className="kg-btn kg-btn-primary"
                    onClick={async () => {
                      if (!checkText.trim()) return;
                      await addChecklistItem(selected.id, checkText.trim());
                      setCheckText("");
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-bold uppercase text-text-muted">Comments</div>
                <div className="max-h-32 space-y-2 overflow-auto">
                  {(selected.comments || []).map((c) => (
                    <div key={c.id} className="rounded-lg border border-stroke-0 bg-bg-1/60 px-2 py-1 text-xs">
                      <div className="font-semibold">{c.by || "User"}</div>
                      <div>{c.text}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input className="kg-input flex-1 !w-auto" placeholder="Comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <button
                    className="kg-btn kg-btn-primary"
                    onClick={async () => {
                      if (!comment.trim()) return;
                      await addTaskComment(selected.id, comment.trim(), user?.email || "user");
                      setComment("");
                    }}
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <KpiCard title={label} value={String(value)} />;
}
