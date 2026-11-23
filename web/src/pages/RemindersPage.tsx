import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <PageHeader eyebrow="Operations" title="Reminders" description="Due-date alerts that surface on the Dashboard." />
      <Card hover={false}>
        <div className="mb-3">
          <div className="text-[14px] font-bold text-text-primary">Reminder system</div>
          <div className="text-[12px] text-text-muted">Shows on Dashboard when due date is within N days.</div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Title
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Due date
            <Input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Notify days before
            <Input value={daysBefore} onChange={(e) => setDaysBefore(e.target.value)} inputMode="numeric" />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save reminder"}
          </Button>
          {msg ? <div className="text-[13px] text-text-secondary">{msg}</div> : null}
        </div>
      </Card>
    </div>
  );
}

