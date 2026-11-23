import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldLabel, Input } from "@/components/ui/Input";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { auth, db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";

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
        userId: auth.currentUser?.uid ?? "owner",
        date,
        cashAmount: num(cash),
        onlineAmount: num(online),
        createdAt: serverTimestamp()
      });
      setCash("");
      setOnline("");
      setMsg("Saved!");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Operations"
        title="Sales"
        description="Enter end-of-day cash and online totals. Dashboard balances update from these entries."
      />
      <Card hover={false}>
        <SectionTitle title="Add sales (end of day)" description="Cash + Online for the selected date." />
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <FieldLabel htmlFor="sales-date">Date</FieldLabel>
            <Input id="sales-date" value={date} onChange={(e) => setDate(e.target.value)} type="date" />
          </div>
          <div>
            <FieldLabel htmlFor="sales-cash">Cash (₹)</FieldLabel>
            <Input
              id="sales-cash"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 12000"
            />
          </div>
          <div>
            <FieldLabel htmlFor="sales-online">Online / UPI (₹)</FieldLabel>
            <Input
              id="sales-online"
              value={online}
              onChange={(e) => setOnline(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 6800"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save Sales"}
          </Button>
          {msg ? (
            <div className={`text-sm ${msg === "Saved!" ? "text-success" : "text-danger"}`} role="status">
              {msg}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
