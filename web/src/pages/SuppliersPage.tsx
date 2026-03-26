import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/firebase";
import { isoDate, num, inr } from "@/lib/utils";
import type { SupplierBillDoc, SupplierDoc } from "@/lib/firestoreTypes";
import { useRealtimeCollection } from "@/lib/useRealtimeCollection";

const OWNER_USER_ID = "owner";

export function SuppliersPage() {
  const suppliers = useRealtimeCollection<SupplierDoc>({ path: "suppliers", userId: OWNER_USER_ID });
  const bills = useRealtimeCollection<SupplierBillDoc>({ path: "supplierBills", userId: OWNER_USER_ID, orderByField: "dueDate" });

  const [supplierName, setSupplierName] = useState("");
  const [billSupplierId, setBillSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [billDate, setBillDate] = useState(isoDate());
  const [dueDate, setDueDate] = useState(isoDate());
  const [status, setStatus] = useState<"paid" | "unpaid">("unpaid");
  const [paidFrom, setPaidFrom] = useState<"cash" | "bank">("cash");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const unpaidTotal = useMemo(() => {
    return bills.data.filter((b) => b.status === "unpaid").reduce((acc, b) => acc + (b.amount ?? 0), 0);
  }, [bills.data]);

  async function addSupplier() {
    setSaving(true);
    setMsg(null);
    try {
      await addDoc(collection(db, "suppliers"), {
        userId: OWNER_USER_ID,
        name: supplierName.trim(),
        createdAt: serverTimestamp()
      });
      setSupplierName("");
      setMsg("Supplier added.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function addBill() {
    setSaving(true);
    setMsg(null);
    try {
      const base: SupplierBillDoc = {
        userId: OWNER_USER_ID,
        supplierId: billSupplierId,
        amount: num(amount),
        billDate,
        dueDate,
        status,
        ...(status === "paid" ? { paidFrom, paidAt: billDate } : {})
      };
      await addDoc(collection(db, "supplierBills"), { ...base, createdAt: serverTimestamp() });
      setAmount("");
      setMsg("Bill saved.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3">
            <div className="text-sm font-semibold">Add supplier</div>
            <div className="text-xs text-white/55">Save your supplier list.</div>
          </div>
          <div className="flex gap-2">
            <input className="min-w-0 flex-1 rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" placeholder="Supplier name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            <button disabled={saving || !supplierName.trim()} onClick={addSupplier} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
              Add
            </button>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Unpaid total</div>
              <div className="text-xs text-white/55">All suppliers</div>
            </div>
            <div className="text-xl font-semibold text-rose-200">{inr(unpaidTotal)}</div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-3">
          <div className="text-sm font-semibold">Add supplier bill</div>
          <div className="text-xs text-white/55">Paid/Unpaid tracking. Unpaid shows on Dashboard.</div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <select className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={billSupplierId} onChange={(e) => setBillSupplierId(e.target.value)}>
            <option value="">Select supplier</option>
            {suppliers.data.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" placeholder="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          <select className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
          <label className="grid gap-1 text-xs text-white/60">
            Bill date
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={billDate} onChange={(e) => setBillDate(e.target.value)} type="date" />
          </label>
          <label className="grid gap-1 text-xs text-white/60">
            Due date
            <input className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" />
          </label>
          {status === "paid" ? (
            <label className="grid gap-1 text-xs text-white/60">
              Paid from
              <select className="rounded-xl border border-stroke-0 bg-white/5 px-3 py-2 text-sm text-white" value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as any)}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
              </select>
            </label>
          ) : (
            <div />
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button disabled={saving || !billSupplierId} onClick={addBill} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
            Save bill
          </button>
          {msg ? <div className="text-sm text-white/70">{msg}</div> : null}
        </div>
      </Card>
    </div>
  );
}

