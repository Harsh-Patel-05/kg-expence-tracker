import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/firebase";
import { isoDate, num, inr } from "@/lib/utils";
import type { SupplierBillDoc, SupplierDoc } from "@/lib/firestoreTypes";
import { useRealtimeCollection } from "@/lib/useRealtimeCollection";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <PageHeader eyebrow="Procurement" title="Suppliers" description="Supplier list and paid / unpaid bills." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card hover={false}>
          <div className="mb-3">
            <div className="text-[14px] font-bold text-text-primary">Add supplier</div>
            <div className="text-[12px] text-text-muted">Save your supplier list.</div>
          </div>
          <div className="flex gap-2">
            <Input className="min-w-0 flex-1" placeholder="Supplier name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            <Button disabled={saving || !supplierName.trim()} onClick={addSupplier}>
              Add
            </Button>
          </div>
        </Card>

        <Card hover={false}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[14px] font-bold text-text-primary">Unpaid total</div>
              <div className="text-[12px] text-text-muted">All suppliers</div>
            </div>
            <div className="text-[22px] font-bold tracking-tight text-danger tabular-nums">{inr(unpaidTotal)}</div>
          </div>
        </Card>
      </div>

      <Card hover={false}>
        <div className="mb-3">
          <div className="text-[14px] font-bold text-text-primary">Add supplier bill</div>
          <div className="text-[12px] text-text-muted">Paid/Unpaid tracking. Unpaid shows on Dashboard.</div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Select value={billSupplierId} onChange={(e) => setBillSupplierId(e.target.value)}>
            <option value="">Select supplier</option>
            {suppliers.data.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input placeholder="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </Select>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Bill date
            <Input value={billDate} onChange={(e) => setBillDate(e.target.value)} type="date" />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Due date
            <Input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" />
          </label>
          {status === "paid" ? (
            <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
              Paid from
              <Select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as any)}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
              </Select>
            </label>
          ) : (
            <div />
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button disabled={saving || !billSupplierId} onClick={addBill}>
            Save bill
          </Button>
          {msg ? <div className="text-[13px] text-text-secondary">{msg}</div> : null}
        </div>
      </Card>
    </div>
  );
}

