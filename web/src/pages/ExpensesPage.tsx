import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";

const OWNER_USER_ID = "owner";

export function ExpensesPage() {
  const [date, setDate] = useState(isoDate());
  const [category, setCategory] = useState<"rent" | "utilities" | "misc" | "other">("misc");
  const [paidFrom, setPaidFrom] = useState<"cash" | "bank">("cash");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await addDoc(collection(db, "expenses"), {
        userId: OWNER_USER_ID,
        date,
        category,
        paidFrom,
        amount: num(amount),
        note: note.trim() || undefined,
        createdAt: serverTimestamp()
      });
      setAmount("");
      setNote("");
      setMsg("Expense saved.");
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
          <div className="text-sm font-semibold">Add expense</div>
          <div className="text-xs text-white/55">Rent, utilities, misc. Choose Cash/Bank to affect balances correctly.</div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-xs text-white/60">
            Date
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={date} onChange={(e) => setDate(e.target.value)} type="date" />
          </label>
          <label className="grid gap-1 text-xs text-white/60">
            Category
            <select className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={category} onChange={(e) => setCategory(e.target.value as any)}>
              <option value="rent">Rent</option>
              <option value="utilities">Utilities</option>
              <option value="misc">Misc</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-white/60">
            Paid from
            <select className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as any)}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-white/60">
            Amount (₹)
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="e.g. 2500" />
          </label>
        </div>
        <div className="mt-3 grid gap-2">
          <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          <div className="flex items-center gap-3">
            <button disabled={saving} onClick={save} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
              {saving ? "Saving…" : "Save expense"}
            </button>
            {msg ? <div className="text-sm text-white/70">{msg}</div> : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

