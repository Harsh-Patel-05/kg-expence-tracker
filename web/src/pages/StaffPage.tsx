import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/firebase";
import { calcSalaryAccruedForMonth } from "@/lib/calculations";
import type { AdvanceDoc, AttendanceDoc, StaffDoc } from "@/lib/firestoreTypes";
import { isoDate, num, inr } from "@/lib/utils";
import { useRealtimeCollection } from "@/lib/useRealtimeCollection";

const OWNER_USER_ID = "owner";

function monthISO(): string {
  return new Date().toISOString().slice(0, 7);
}

export function StaffPage() {
  const staff = useRealtimeCollection<StaffDoc>({ path: "staff", userId: OWNER_USER_ID });
  const attendance = useRealtimeCollection<AttendanceDoc>({ path: "attendance", userId: OWNER_USER_ID, orderByField: "date" });
  const advances = useRealtimeCollection<AdvanceDoc>({ path: "advances", userId: OWNER_USER_ID, orderByField: "date" });

  const [name, setName] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [attStaffId, setAttStaffId] = useState("");
  const [attDate, setAttDate] = useState(isoDate());
  const [present, setPresent] = useState(true);

  const [advStaffId, setAdvStaffId] = useState("");
  const [advDate, setAdvDate] = useState(isoDate());
  const [advAmount, setAdvAmount] = useState("");
  const [advPaidFrom, setAdvPaidFrom] = useState<"cash" | "bank">("cash");

  const salarySummary = useMemo(() => {
    return calcSalaryAccruedForMonth({
      staff: staff.data,
      attendance: attendance.data,
      advances: advances.data,
      monthISO: monthISO()
    });
  }, [staff.data, attendance.data, advances.data]);

  async function addStaff() {
    setSaving(true);
    setMsg(null);
    try {
      await addDoc(collection(db, "staff"), {
        userId: OWNER_USER_ID,
        name: name.trim(),
        monthlySalary: num(monthlySalary),
        active: true,
        createdAt: serverTimestamp()
      });
      setName("");
      setMonthlySalary("");
      setMsg("Staff added.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function markAttendance() {
    setSaving(true);
    setMsg(null);
    try {
      await addDoc(collection(db, "attendance"), {
        userId: OWNER_USER_ID,
        staffId: attStaffId,
        date: attDate,
        present,
        createdAt: serverTimestamp()
      });
      setMsg("Attendance saved.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function addAdvance() {
    setSaving(true);
    setMsg(null);
    try {
      await addDoc(collection(db, "advances"), {
        userId: OWNER_USER_ID,
        staffId: advStaffId,
        date: advDate,
        amount: num(advAmount),
        paidFrom: advPaidFrom,
        createdAt: serverTimestamp()
      });
      setAdvAmount("");
      setMsg("Advance saved.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <div className="mb-3">
            <div className="text-sm font-semibold">Add staff</div>
            <div className="text-xs text-white/55">Monthly salary is fixed; daily salary = monthly / 30.</div>
          </div>
          <div className="grid gap-3">
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" placeholder="Staff name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" placeholder="Monthly salary (₹)" value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} inputMode="decimal" />
            <button disabled={saving || !name.trim()} onClick={addStaff} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
              Add staff
            </button>
          </div>
        </Card>

        <Card>
          <div className="mb-3">
            <div className="text-sm font-semibold">Daily attendance</div>
            <div className="text-xs text-white/55">Present/Absent for salary calculation.</div>
          </div>
          <div className="grid gap-3">
            <select className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={attStaffId} onChange={(e) => setAttStaffId(e.target.value)}>
              <option value="">Select staff</option>
              {staff.data.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={attDate} onChange={(e) => setAttDate(e.target.value)} type="date" />
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" checked={present} onChange={(e) => setPresent(e.target.checked)} />
              Present
            </label>
            <button disabled={saving || !attStaffId} onClick={markAttendance} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
              Save attendance
            </button>
          </div>
        </Card>

        <Card>
          <div className="mb-3">
            <div className="text-sm font-semibold">Advance (deduct from salary)</div>
            <div className="text-xs text-white/55">Tracks history and reduces payable salary.</div>
          </div>
          <div className="grid gap-3">
            <select className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={advStaffId} onChange={(e) => setAdvStaffId(e.target.value)}>
              <option value="">Select staff</option>
              {staff.data.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={advDate} onChange={(e) => setAdvDate(e.target.value)} type="date" />
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" placeholder="Amount (₹)" value={advAmount} onChange={(e) => setAdvAmount(e.target.value)} inputMode="decimal" />
            <select className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={advPaidFrom} onChange={(e) => setAdvPaidFrom(e.target.value as any)}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
            <button disabled={saving || !advStaffId} onClick={addAdvance} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
              Save advance
            </button>
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Salary (this month)</div>
            <div className="text-xs text-white/55">Fixed 30-day logic: daily = monthly / 30; salary = daily * present days.</div>
          </div>
          <div className="text-sm text-white/80">
            Gross: <span className="font-semibold">{inr(salarySummary.grossSalary)}</span> • Advances:{" "}
            <span className="font-semibold">{inr(salarySummary.totalAdvances)}</span> • Payable: <span className="font-semibold">{inr(salarySummary.payable)}</span>
          </div>
        </div>
        {msg ? <div className="text-sm text-white/70">{msg}</div> : null}
      </Card>
    </div>
  );
}

