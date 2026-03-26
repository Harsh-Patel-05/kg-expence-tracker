import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";

const OWNER_USER_ID = "owner";

export function RemindersPage() {
  const [title, setTitle] = useState("House rent");
  const [dueDate, setDueDate] = useState(isoDate());
  const [daysBefore, setDaysBefore] = useState("5");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await addDoc(collection(db, "reminders"), {
        userId: OWNER_USER_ID,
        title: title.trim(),
        dueDate,
        daysBefore: num(daysBefore),
        enabled: true,
        createdAt: serverTimestamp()
      });
      setMsg("Reminder saved.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <div className="mb-3">
          <div className="text-sm font-semibold">Reminder system</div>
          <div className="text-xs text-white/55">Shows on Dashboard when due date is within N days.</div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-xs text-white/60">
            Title
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-white/60">
            Due date
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" />
          </label>
          <label className="grid gap-1 text-xs text-white/60">
            Notify days before
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={daysBefore} onChange={(e) => setDaysBefore(e.target.value)} inputMode="numeric" />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button disabled={saving} onClick={save} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
            {saving ? "Saving…" : "Save reminder"}
          </button>
          {msg ? <div className="text-sm text-white/70">{msg}</div> : null}
        </div>
      </Card>
    </div>
  );
}

