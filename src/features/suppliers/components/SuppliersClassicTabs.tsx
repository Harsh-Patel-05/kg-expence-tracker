import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { PurchaseEntryDoc } from "@/features/inventory/types";
import type { SupplierDoc, SupplierPaymentDoc } from "../types";
import { buildSupplierLedger, isPurchasePaid, supplierRemaining } from "../utils/ledger";
import { withinSupplierHistoryRange, type SupplierHistoryRange } from "../utils/historyRange";
import {
  addSupplierWithItems,
  createClassicSupplierBill,
  recordSupplierPayment,
  syncSupplierOutstanding
} from "../services/supplierService";
import { canEditSuppliers, canPaySuppliers } from "../utils/permissions";
import { Card } from "@/components/ui/Card";
import { EmptyState, SectionTitle } from "@/components/ui/PageHeader";

type TabId = "manage" | "bills" | "pay" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "manage", label: "Add supplier" },
  { id: "bills", label: "Add bills" },
  { id: "pay", label: "Pay bills" },
  { id: "history", label: "History" }
];

type TempItem = { item: string; qty: number; rate: number; price: number; expiryDate?: string };

function TabBar({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Suppliers tabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onTab(t.id)}
          className={`rounded-md border px-3 py-2 text-[12px] font-semibold ${
            tab === t.id ? "border-primary bg-primary-light text-primary" : "border-stroke-0 bg-bg-1 text-text-muted"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ManageTab({ suppliers }: { suppliers: Array<SupplierDoc & { id: string }> }) {
  const { role } = usePosAuth();
  const canEdit = canEditSuppliers(role);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemRate, setItemRate] = useState("");
  const [tempItems, setTempItems] = useState<Array<{ name: string; rate: number }>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = suppliers.filter((s) => !s.archived && !s.isDeleted);

  return (
    <Card padding="sm" hover={false}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle title="Supplier Management" />
        <button type="button" className="kg-btn kg-btn-secondary" onClick={() => setShowAdd((v) => !v)}>
          + Add Supplier
        </button>
      </div>
      {msg ? <div className="mb-2 rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      {showAdd ? (
        <div className="mb-4 grid gap-2 rounded-lg border border-stroke-0 bg-bg-1/50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="kg-input !w-auto" placeholder="Supplier name" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
            <button
              type="button"
              disabled={!canEdit || busy || !name.trim()}
              className="kg-btn kg-btn-primary disabled:opacity-50"
              onClick={async () => {
                try {
                  setBusy(true);
                  await addSupplierWithItems({ name, items: tempItems });
                  setMsg("Supplier saved");
                  setName("");
                  setTempItems([]);
                  setShowAdd(false);
                } catch (e: any) {
                  setMsg(e?.message || "Save failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add Supplier
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <input className="kg-input !w-auto" placeholder="Supplier item (e.g., Milk)" value={itemName} disabled={!canEdit} onChange={(e) => setItemName(e.target.value)} />
            <input className="kg-input !w-auto" type="number" placeholder="Rate (optional)" value={itemRate} disabled={!canEdit} onChange={(e) => setItemRate(e.target.value)} />
            <button
              type="button"
              className="kg-btn kg-btn-secondary"
              disabled={!canEdit || !itemName.trim()}
              onClick={() => {
                if (!itemName.trim()) return;
                const rate = num(itemRate);
                if (rate < 0) {
                  setMsg("Rate cannot be negative");
                  return;
                }
                setTempItems((p) => [...p, { name: itemName.trim(), rate: rate || 0 }]);
                setItemName("");
                setItemRate("");
              }}
            >
              Add Item
            </button>
          </div>
          <div className="space-y-1 text-[13px]">
            {tempItems.map((it, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2">
                <span>
                  <strong>{it.name}</strong>
                  {it.rate > 0 ? ` · ${inr(it.rate)}` : " · No rate"}
                </span>
                <button type="button" className="text-xs font-semibold text-danger" onClick={() => setTempItems((p) => p.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
            {!tempItems.length ? <div className="text-[12px] text-text-muted">No items added yet.</div> : null}
          </div>
        </div>
      ) : null}

      <div className="max-h-[420px] space-y-1.5 overflow-auto">
        {active.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]">
            <div>
              <div className="font-semibold">{s.name}</div>
              <div className="text-[11px] text-text-muted">
                {(s.items || []).length ? `${(s.items || []).length} item(s)` : "No catalog items"}
              </div>
            </div>
            <Link to="/suppliers/list" className="text-xs font-semibold text-primary">
              Edit
            </Link>
          </div>
        ))}
        {!active.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No suppliers yet." /> : null}
      </div>
    </Card>
  );
}

function BillsTab({
  suppliers,
  purchases
}: {
  suppliers: Array<SupplierDoc & { id: string }>;
  purchases: Array<PurchaseEntryDoc & { id: string }>;
}) {
  const { role } = usePosAuth();
  const canEdit = canEditSuppliers(role);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(isoDate());
  const [supplierId, setSupplierId] = useState("");
  const [item, setItem] = useState("");
  const [rate, setRate] = useState("");
  const [qty, setQty] = useState("");
  const [expiry, setExpiry] = useState("");
  const [paidStatus, setPaidStatus] = useState<"paid" | "unpaid">("unpaid");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [tempLines, setTempLines] = useState<TempItem[]>([]);

  const seller = suppliers.find((s) => s.id === supplierId);
  const catalog = seller?.items || [];

  const amountPreview = useMemo(() => {
    const r = num(rate);
    const q = num(qty);
    return r > 0 && q > 0 ? r * q : num(rate) > 0 ? num(rate) : 0;
  }, [rate, qty]);

  const billTotal = tempLines.reduce((s, l) => s + l.price, 0);

  function addTempLine() {
    const i = item.trim() || catalog[0]?.name || "";
    const q = num(qty);
    const r = num(rate);
    const price = r > 0 && q > 0 ? r * q : amountPreview;
    if (!i || !(price > 0)) {
      setMsg("Enter item, qty and price");
      return;
    }
    setTempLines((p) => [...p, { item: i, qty: q || 1, rate: r, price, expiryDate: expiry || undefined }]);
    setItem("");
    setQty("");
    setRate("");
    setExpiry("");
  }

  async function saveBill() {
    if (!supplierId || !seller) {
      setMsg("Select supplier");
      return;
    }
    const pending = item.trim() && amountPreview > 0 ? [{ item: item.trim(), qty: num(qty) || 1, rate: num(rate), price: amountPreview, expiryDate: expiry || undefined }] : [];
    const lines = [...tempLines, ...pending];
    if (!lines.length) {
      setMsg("Add at least 1 item");
      return;
    }
    try {
      setBusy(true);
      for (const line of lines) {
        await createClassicSupplierBill({
          date,
          seller: seller.name,
          supplierId,
          item: line.item,
          qty: line.qty,
          rate: line.rate,
          price: line.price,
          expiryDate: line.expiryDate,
          paidStatus,
          paymentMethod
        });
      }
      setMsg(paidStatus === "paid" ? "Bill saved as Paid" : "Bill saved as Unpaid");
      setTempLines([]);
      setPaidStatus("unpaid");
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const recent = useMemo(
    () => [...purchases].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 15),
    [purchases]
  );

  return (
    <Card padding="sm" hover={false}>
      <SectionTitle title="Supplier Bills" />
      {msg ? <div className="mb-2 rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Date
          <input type="date" className="kg-input !w-auto" value={date} disabled={!canEdit} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Supplier name
          <select className="kg-input !w-auto" value={supplierId} disabled={!canEdit} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Select…</option>
            {suppliers.filter((s) => !s.archived).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Supplier item
          <select
            className="kg-input !w-auto"
            value={item}
            disabled={!canEdit}
            onChange={(e) => {
              const v = e.target.value;
              setItem(v);
              const hit = catalog.find((c) => c.name === v);
              if (hit?.rate) setRate(String(hit.rate));
            }}
          >
            <option value="">Select or type below</option>
            {catalog.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Item (custom)
          <input className="kg-input !w-auto" value={item} disabled={!canEdit} onChange={(e) => setItem(e.target.value)} placeholder="Item name" />
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Price / rate
          <input type="number" className="kg-input !w-auto" value={rate} disabled={!canEdit} onChange={(e) => setRate(e.target.value)} />
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Quantity
          <input type="number" className="kg-input !w-auto" value={qty} disabled={!canEdit} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Amount
          <input type="number" className="kg-input !w-auto" readOnly value={amountPreview || ""} placeholder="Auto = price × qty" />
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Expiry (milk/paneer)
          <input type="date" className="kg-input !w-auto" value={expiry} disabled={!canEdit} onChange={(e) => setExpiry(e.target.value)} />
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Status
          <select className="kg-input !w-auto" value={paidStatus} disabled={!canEdit} onChange={(e) => setPaidStatus(e.target.value as "paid" | "unpaid")}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        {paidStatus === "paid" ? (
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Payment
            <select className="kg-input !w-auto" value={paymentMethod} disabled={!canEdit} onChange={(e) => setPaymentMethod(e.target.value as "cash" | "online")}>
              <option value="cash">Cash</option>
              <option value="online">Online</option>
            </select>
          </label>
        ) : null}
        <div className="grid gap-1 text-[12px] font-semibold text-text-muted">
          <span aria-hidden>&nbsp;</span>
          <button type="button" className="kg-btn kg-btn-secondary" disabled={!canEdit} onClick={addTempLine}>
            + Add item
          </button>
        </div>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Bill total
          <input type="number" className="kg-input !w-auto" readOnly value={tempLines.length ? billTotal : amountPreview} />
        </label>
        <div className="grid gap-1 text-[12px] font-semibold text-text-muted">
          <span aria-hidden>&nbsp;</span>
          <button type="button" className="kg-btn kg-btn-primary disabled:opacity-50" disabled={!canEdit || busy} onClick={() => void saveBill()}>
            Save Bill
          </button>
        </div>
      </div>

      {tempLines.length ? (
        <Card padding="sm" hover={false} className="mt-3">
          <SectionTitle title="Selected items" />
          <div className="space-y-1">
            {tempLines.map((l, i) => (
              <div key={i} className="flex justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2 text-[13px]">
                <span>
                  {l.item} × {l.qty} @ {inr(l.rate)}
                </span>
                <span className="font-bold">{inr(l.price)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mt-4 max-h-[280px] space-y-1.5 overflow-auto">
        {recent.map((p) => (
          <div key={p.id} className="flex justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2 text-[13px]">
            <span>
              {p.date} · {p.seller || p.vendorName} · {p.item || "—"}
            </span>
            <span className="font-bold">{inr(p.price ?? p.total)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PayTab({
  suppliers,
  purchases,
  payments
}: {
  suppliers: Array<SupplierDoc & { id: string }>;
  purchases: Array<PurchaseEntryDoc & { id: string }>;
  payments: Array<SupplierPaymentDoc & { id: string }>;
}) {
  const { role } = usePosAuth();
  const canPay = canPaySuppliers(role);
  const [modalOpen, setModalOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ supplierId: "", amount: "", date: isoDate(), method: "cash" as "cash" | "online", note: "" });

  const ledger = useMemo(() => buildSupplierLedger({ suppliers, purchases, payments, today: isoDate() }), [suppliers, purchases, payments]);

  const remainingRows = useMemo(() => {
    const names = new Set<string>();
    suppliers.forEach((s) => names.add(s.name));
    purchases.forEach((p) => {
      const n = String(p.seller || p.vendorName || "").trim();
      if (n) names.add(n);
    });
    return [...names]
      .map((name) => ({
        name,
        remaining: supplierRemaining(name, purchases, payments),
        supplierId: suppliers.find((s) => s.name === name)?.id
      }))
      .sort((a, b) => b.remaining - a.remaining);
  }, [suppliers, purchases, payments]);

  return (
  <>
    <Card padding="sm" hover={false}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle title="Supplier Remaining" />
        <button type="button" className="kg-btn kg-btn-secondary" disabled={!canPay} onClick={() => setModalOpen(true)}>
          Record Payment
        </button>
      </div>
      {msg ? <div className="mb-2 rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      <div className="space-y-1.5">
        {remainingRows.map((r) => {
          const due = r.remaining > 0.009;
          const credit = r.remaining < -0.009;
          return (
            <div key={r.name} className="flex items-center justify-between rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]">
              <div className="font-semibold">
                {r.name}
                {!due && credit ? <span className="ml-2 text-[10px] font-bold uppercase text-success">credit</span> : null}
                {!due && !credit ? <span className="ml-2 text-[10px] font-bold uppercase text-text-muted">settled</span> : null}
              </div>
              <div className={`font-bold tabular-nums ${due ? "text-danger" : "text-success"}`}>{inr(r.remaining)}</div>
            </div>
          );
        })}
        {!remainingRows.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No suppliers yet." /> : null}
      </div>
    </Card>

    {modalOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Record payment">
        <Card padding="sm" hover={false} className="w-full max-w-lg">
          <div className="mb-3 text-[16px] font-bold text-text-primary">Record payment</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <input type="date" className="kg-input !w-auto" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            <select className="kg-input !w-auto" value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}>
              <option value="">Supplier</option>
              {suppliers.filter((s) => !s.archived).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input type="number" className="kg-input !w-auto" placeholder="Amount paid" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select className="kg-input !w-auto" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as "cash" | "online" }))}>
              <option value="cash">Cash</option>
              <option value="online">Online</option>
            </select>
            <input className="kg-input !w-auto" placeholder="Note (optional)" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="kg-btn kg-btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="kg-btn kg-btn-primary disabled:opacity-50"
              disabled={!canPay || !form.supplierId || !(num(form.amount) > 0)}
              onClick={async () => {
                const s = suppliers.find((x) => x.id === form.supplierId);
                if (!s) return;
                const method = form.method === "online" ? "online" : "cash";
                await recordSupplierPayment({
                  seller: s.name,
                  supplierId: s.id,
                  amount: num(form.amount),
                  date: form.date,
                  method,
                  note: form.note
                });
                const row = ledger.find((l) => l.supplierId === s.id);
                if (row) await syncSupplierOutstanding(s.id, Math.max(0, row.outstanding - num(form.amount)));
                setMsg("Payment recorded");
                setForm({ supplierId: "", amount: "", date: isoDate(), method: "cash", note: "" });
                setModalOpen(false);
              }}
            >
              Save payment
            </button>
          </div>
        </Card>
      </div>
    ) : null}
  </>
  );
}

function HistoryTab({
  suppliers,
  purchases,
  payments,
  refreshKey
}: {
  suppliers: Array<SupplierDoc & { id: string }>;
  purchases: Array<PurchaseEntryDoc & { id: string }>;
  payments: Array<SupplierPaymentDoc & { id: string }>;
  refreshKey: number;
}) {
  const [range, setRange] = useState<SupplierHistoryRange>("month");
  const [onlySupplier, setOnlySupplier] = useState("");
  const [refreshTick, setRefreshTick] = useState(refreshKey);

  useEffect(() => {
    setRefreshTick(refreshKey);
  }, [refreshKey]);

  const cards = useMemo(() => {
    const billRows = purchases
      .filter((p) => p.date && withinSupplierHistoryRange(String(p.date), range))
      .filter((p) => !onlySupplier || String(p.seller || p.vendorName || "") === onlySupplier)
      .map((p) => ({
        kind: "bill" as const,
        date: String(p.date).slice(0, 10),
        seller: String(p.seller || p.vendorName || "Unknown"),
        item: p.item,
        qty: p.qty,
        amount: num(p.price ?? p.total),
        raw: p
      }));

    const payRows = payments
      .filter((p) => p.date && withinSupplierHistoryRange(String(p.date), range))
      .filter((p) => !onlySupplier || String(p.seller || "") === onlySupplier)
      .map((p) => ({
        kind: "pay" as const,
        date: String(p.date).slice(0, 10),
        seller: String(p.seller || "Unknown"),
        note: p.note,
        amount: num(p.amount),
        raw: p
      }));

    const rows = [...billRows, ...payRows].sort((a, b) => b.date.localeCompare(a.date));
    const bySeller = new Map<string, typeof rows>();
    rows.forEach((r) => {
      const list = bySeller.get(r.seller) || [];
      list.push(r);
      bySeller.set(r.seller, list);
    });

    return [...bySeller.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([seller, list]) => {
        const totalBills = list.filter((x) => x.kind === "bill").reduce((s, x) => s + x.amount, 0);
        const paidBills = list.filter((x) => x.kind === "bill" && isPurchasePaid(x.raw as PurchaseEntryDoc)).reduce((s, x) => s + x.amount, 0);
        const unpaidBills = totalBills - paidBills;
        const payTotal = list.filter((x) => x.kind === "pay").reduce((s, x) => s + x.amount, 0);
        const totalPaid = payTotal + paidBills;
        const remaining = unpaidBills - payTotal;
        return { seller, list: list.slice(0, 7), totalBills, totalPaid, remaining, range };
      });
  }, [purchases, payments, range, onlySupplier, refreshTick, refreshKey]);

  const supplierNames = useMemo(() => {
    const set = new Set<string>();
    suppliers.forEach((s) => set.add(s.name));
    purchases.forEach((p) => {
      const n = String(p.seller || p.vendorName || "").trim();
      if (n) set.add(n);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [suppliers, purchases]);

  return (
    <Card padding="sm" hover={false}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle title="Supplier History" />
        <div className="flex flex-wrap gap-2">
          <select className="kg-input !w-auto" value={range} onChange={(e) => setRange(e.target.value as SupplierHistoryRange)}>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="all">All time</option>
          </select>
          <select className="kg-input !w-auto" value={onlySupplier} onChange={(e) => setOnlySupplier(e.target.value)}>
            <option value="">All suppliers</option>
            {supplierNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="kg-btn kg-btn-secondary"
            onClick={() => setRefreshTick((k) => k + 1)}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {cards.map((c) => (
          <Card key={c.seller} padding="sm" hover={false} className="border border-stroke-0">
            <div className="mb-2 font-bold text-text-primary">{c.seller}</div>
            <div className="mb-2 flex flex-wrap gap-1">
              <span className="rounded-md bg-bg-1 px-2 py-0.5 text-[10px] font-bold">bills {inr(c.totalBills)}</span>
              <span className="rounded-md bg-bg-1 px-2 py-0.5 text-[10px] font-bold">paid {inr(c.totalPaid)}</span>
              <span className="rounded-md bg-bg-1 px-2 py-0.5 text-[10px] font-bold">remaining {inr(c.remaining)}</span>
              <span className="rounded-md bg-bg-1 px-2 py-0.5 text-[10px] font-bold">{c.range}</span>
            </div>
            <div className="mt-2 space-y-1 text-[13px]">
              {c.list.map((r, i) =>
                r.kind === "pay" ? (
                  <div key={i} className="flex justify-between border-t border-stroke-0 pt-2">
                    <span>
                      {r.date} — <strong>Payment</strong>
                      {r.note ? <span className="text-text-muted"> ({String(r.note).slice(0, 30)})</span> : null}
                    </span>
                    <span className="font-bold text-success">-{inr(r.amount)}</span>
                  </div>
                ) : (
                  <div key={i} className="flex justify-between border-t border-stroke-0 pt-2">
                    <span>
                      {r.date} — <strong>{r.item || "Item"}</strong>
                      {num(r.qty) > 0 ? ` · qty ${num(r.qty)}` : ""}{" "}
                      <span className="text-[10px] font-bold uppercase">{isPurchasePaid(r.raw as PurchaseEntryDoc) ? "paid" : "unpaid"}</span>
                    </span>
                    <span>{inr(r.amount)}</span>
                  </div>
                )
              )}
            </div>
          </Card>
        ))}
        {!cards.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No supplier bills in this range." /> : null}
      </div>
    </Card>
  );
}

export function SuppliersClassicTabs() {
  const [tab, setTab] = useState<TabId>("manage");
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const { data: suppliers } = useRestaurantCollection<SupplierDoc>({ path: "suppliers" });
  const { data: purchases } = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases", max: 500 });
  const { data: payments } = useRestaurantCollection<SupplierPaymentDoc>({ path: "supplierPayments", max: 500 });

  return (
    <div>
      <TabBar
        tab={tab}
        onTab={(t) => {
          setTab(t);
          if (t === "history") setHistoryRefresh((k) => k + 1);
        }}
      />
      <div className="mt-3" role="tabpanel">
        {tab === "manage" ? <ManageTab suppliers={suppliers} /> : null}
        {tab === "bills" ? <BillsTab suppliers={suppliers} purchases={purchases} /> : null}
        {tab === "pay" ? <PayTab suppliers={suppliers} purchases={purchases} payments={payments} /> : null}
        {tab === "history" ? (
          <HistoryTab suppliers={suppliers} purchases={purchases} payments={payments} refreshKey={historyRefresh} />
        ) : null}
      </div>
    </div>
  );
}