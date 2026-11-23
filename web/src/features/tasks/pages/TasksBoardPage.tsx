import { useMemo, useState } from "react";
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

const COLUMNS: TaskStatus[] = ["draft", "assigned", "in_progress", "waiting", "blocked", "done"];
const PRIORITIES: TaskPriority[] = ["critical", "high", "medium", "low"];

const priorityColor: Record<TaskPriority, string> = {
  critical: "bg-rose-100 text-rose-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-700"
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Work management</div>
          <h1 className="text-2xl font-black text-slate-900">Tasks</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/reminders" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Reminders
          </Link>
          <Link to="/expenses" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Expenses
          </Link>
        </div>
      </div>

      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}
      {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Open" value={stats.open} />
        <Stat label="Overdue" value={stats.overdue} />
        <Stat label="Done today" value={stats.doneToday} />
        <Stat label="Visible" value={stats.total} />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm">
        {(["kanban", "table", "list", "calendar", "agenda"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 capitalize ${view === v ? "bg-slate-900 text-white" : "text-slate-600"}`}>
            {v}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr_300px]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-bold">Create task</div>
            <input className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <textarea className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <select
              className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
            <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.taskType} onChange={(e) => setForm((f) => ({ ...f, taskType: e.target.value as TaskType }))}>
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Department" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
            <input type="date" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as RecurrenceFreq }))}>
              <option value="once">One time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
            {canOverride ? (
              <input className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Completion % override" value={form.completionPct} onChange={(e) => setForm((f) => ({ ...f, completionPct: e.target.value }))} />
            ) : null}
            <button disabled={!canManage} onClick={create} className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Create task
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-bold">Automation presets</div>
            <div className="max-h-48 space-y-1 overflow-auto">
              {TASK_AUTOMATION_PRESETS.map((p) => (
                <button
                  key={p.title}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                  onClick={() => setForm((f) => ({ ...f, title: p.title, taskType: p.taskType as TaskType, priority: p.priority }))}
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap gap-2">
            <input className="min-w-[160px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Search ID, title, employee…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="all">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={dept} onChange={(e) => setDept(e.target.value)}>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d === "all" ? "All departments" : d}
                </option>
              ))}
            </select>
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {COLUMNS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Archived
            </label>
            {view === "calendar" ? <input type="month" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={calMonth} onChange={(e) => setCalMonth(e.target.value)} /> : null}
          </div>

          {loading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

          {view === "kanban" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              {COLUMNS.map((col) => (
                <div key={col} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-600">{col.replace("_", " ")}</div>
                    <span className="rounded-full bg-white px-2 text-xs font-bold">{byCol[col]?.length || 0}</span>
                  </div>
                  <div className="max-h-[560px] space-y-2 overflow-auto">
                    {(byCol[col] || []).map((t) => (
                      <button key={t.id} type="button" onClick={() => setSelectedId(t.id)} className={`w-full rounded-xl border p-3 text-left shadow-sm ${selectedId === t.id ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-white"}`}>
                        <div className="text-sm font-semibold text-slate-900">{t.title}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${priorityColor[t.priority]}`}>{t.priority}</span>
                          {t.dueDate ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">{t.dueDate}</span> : null}
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">{t.completionPct || 0}%</span>
                        </div>
                        {t.assigneeName ? <div className="mt-1 text-xs text-slate-500">{t.assigneeName}</div> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {view === "table" || view === "list" || view === "agenda" ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
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
                    <tr key={t.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setSelectedId(t.id)}>
                      <td className="px-3 py-2">
                        <div className="font-semibold">{t.title}</div>
                        <div className="text-xs text-slate-500">
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
              {!filtered.length && !loading ? <div className="py-10 text-center text-sm text-slate-500">No tasks.</div> : null}
            </div>
          ) : null}

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
                  {c.items.slice(0, 2).map((t) => (
                    <button key={t.id} type="button" className="block w-full truncate rounded bg-white px-1 text-left text-[9px] font-semibold" onClick={() => setSelectedId(t.id)}>
                      {t.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!selected ? <div className="py-12 text-center text-sm text-slate-500">Select a task</div> : null}
          {selected ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-500">{selected.taskNumber}</div>
                <div className="text-lg font-black text-slate-900">{selected.title}</div>
                <div className="text-sm text-slate-600">{selected.description || "No description"}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {COLUMNS.filter((c) => c !== boardStatus(selected.status)).map((c) => (
                  <button key={c} disabled={!canManage} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold capitalize disabled:opacity-40" onClick={() => setTaskStatus(selected.id, c)}>
                    → {c.replace("_", " ")}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="text-xs font-semibold text-emerald-700" onClick={() => completeWithRecurrence(selected)}>
                  Complete
                </button>
                <button className="text-xs font-semibold text-cyan-700" onClick={async () => { await duplicateTask(selected.id); setMsg("Duplicated"); }}>
                  Duplicate
                </button>
                <button className="text-xs font-semibold text-amber-700" onClick={async () => { await archiveTask(selected.id, !selected.archived); setMsg(selected.archived ? "Restored" : "Archived"); }}>
                  {selected.archived ? "Restore" : "Archive"}
                </button>
                <button className="text-xs font-semibold text-rose-600" onClick={async () => { await softDeleteTask(selected.id); setSelectedId(null); setMsg("Deleted"); }}>
                  Delete
                </button>
              </div>

              <div>
                <div className="mb-1 text-xs font-bold uppercase text-slate-500">Checklist ({selected.completionPct || 0}%)</div>
                <div className="max-h-40 space-y-1 overflow-auto">
                  {(selected.checklist || []).map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!!c.done} onChange={(e) => toggleChecklistItem(selected.id, c.id, e.target.checked)} />
                      <span className={c.done ? "line-through text-slate-400" : ""}>{c.text}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="Add item" value={checkText} onChange={(e) => setCheckText(e.target.value)} />
                  <button
                    className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
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
                <div className="mb-1 text-xs font-bold uppercase text-slate-500">Comments</div>
                <div className="max-h-32 space-y-2 overflow-auto">
                  {(selected.comments || []).map((c) => (
                    <div key={c.id} className="rounded-lg bg-slate-50 px-2 py-1 text-xs">
                      <div className="font-semibold">{c.by || "User"}</div>
                      <div>{c.text}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="Comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <button
                    className="rounded-lg bg-cyan-500 px-2 py-1 text-xs font-semibold text-white"
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
