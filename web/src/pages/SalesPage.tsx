import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";

const OWNER_USER_ID = "owner";

export function SalesPage() {
  const [date, setDate] = useState(isoDate());
  const [cash, setCash] = useState("");
  const [online, setOnline] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await addDoc(collection(db, "sales"), {
        userId: OWNER_USER_ID,
        date,
        cashAmount: num(cash),
        onlineAmount: num(online),
        createdAt: serverTimestamp()
      });
      setCash("");
      setOnline("");
      setMsg("Saved!");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <div className="mb-3">
          <div className="text-sm font-semibold">Add Sales (end of day)</div>
          <div className="text-xs text-white/55">Enter Cash + Online for the day. Balances update automatically on Dashboard.</div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-xs text-white/60">
            Date
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={date} onChange={(e) => setDate(e.target.value)} type="date" />
          </label>
          <label className="grid gap-1 text-xs text-white/60">
            Cash (₹)
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={cash} onChange={(e) => setCash(e.target.value)} inputMode="decimal" placeholder="e.g. 12000" />
          </label>
          <label className="grid gap-1 text-xs text-white/60">
            Online / UPI (₹)
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={online} onChange={(e) => setOnline(e.target.value)} inputMode="decimal" placeholder="e.g. 6800" />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button disabled={saving} onClick={save} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
            {saving ? "Saving…" : "Save Sales"}
          </button>
          {msg ? <div className="text-sm text-white/70">{msg}</div> : null}
        </div>
      </Card>
    </div>
  );
}

