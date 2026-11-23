import { useState } from "react";
import { Link } from "react-router-dom";
import { inr, num, isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { InventoryItemDoc, PurchaseEntryDoc, PurchaseLine, VendorDoc } from "../types";
import { createPurchaseEntry, upsertVendor } from "../services/purchaseService";

export function InventoryPurchasesPage() {
  const { data: purchases, loading } = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases" });
  const { data: vendors } = useRestaurantCollection<VendorDoc>({ path: "suppliers" });
  const { data: items } = useRestaurantCollection<InventoryItemDoc>({ path: "inventory" });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [line, setLine] = useState({ item: "", inventoryId: "", qty: "1", unit: "kg", rate: "0", gstRate: "5", expiryDate: "", batchNumber: "" });
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "unpaid">("unpaid");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");

  function addLine() {
    if (!line.item || num(line.qty) <= 0) return;
    setLines((prev) => [
      ...prev,
      {
        inventoryId: line.inventoryId || undefined,
        item: line.item,
        qty: num(line.qty),
        unit: line.unit,
        rate: num(line.rate),
        gstRate: num(line.gstRate),
        expiryDate: line.expiryDate || undefined,
        batchNumber: line.batchNumber || undefined
      }
    ]);
    setLine({ item: "", inventoryId: "", qty: "1", unit: "kg", rate: "0", gstRate: "5", expiryDate: "", batchNumber: "" });
  }

  async function submit() {
    try {
      setBusy(true);
      let vid = vendorId || null;
      let vname = vendorName;
      if (!vid && vendorName.trim()) {
        vid = await upsertVendor({ name: vendorName.trim() });
      }
      if (vid && !vname) vname = vendors.find((v) => v.id === vid)?.name || "";
      await createPurchaseEntry({
        vendorId: vid,
        vendorName: vname,
        invoiceNumber,
        invoiceDate: isoDate(),
        lines,
        paymentStatus,
        paymentMethod
      });
      setLines([]);
      setInvoiceNumber("");
      setPaymentStatus("unpaid");
      setMsg(paymentStatus === "paid" ? "Purchase posted as Paid — stock increased" : "Purchase posted as Unpaid — stock increased");
    } catch (e: any) {
      setMsg(e?.message || "Purchase failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link to="/inventory" className="text-xs font-semibold text-cyan-700">
          ← Inventory
        </Link>
        <h1 className="text-xl font-black">Purchase entries</h1>
      </div>
      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-bold">New purchase</div>
          <select
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={vendorId}
            onChange={(e) => {
              setVendorId(e.target.value);
              setVendorName(vendors.find((v) => v.id === e.target.value)?.name || "");
            }}
          >
            <option value="">Select vendor / supplier</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Or type new vendor name" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
          <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Invoice number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />

          <div className="rounded-xl border border-dashed p-3 space-y-2">
            <div className="text-xs font-bold uppercase text-slate-500">Add line</div>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={line.inventoryId}
              onChange={(e) => {
                const it = items.find((x) => x.id === e.target.value);
                setLine({
                  ...line,
                  inventoryId: e.target.value,
                  item: it?.item || "",
                  unit: it?.unit || line.unit,
                  rate: String(it?.lastPurchaseCost || it?.avgCost || line.rate)
                });
              }}
            >
              <option value="">Pick inventory item…</option>
              {items.filter((i) => !i.isDeleted).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.item}
                </option>
              ))}
            </select>
            <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Item name" value={line.item} onChange={(e) => setLine({ ...line, item: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <input className="rounded-xl border px-2 py-2 text-sm" type="number" placeholder="Qty" value={line.qty} onChange={(e) => setLine({ ...line, qty: e.target.value })} />
              <input className="rounded-xl border px-2 py-2 text-sm" placeholder="Unit" value={line.unit} onChange={(e) => setLine({ ...line, unit: e.target.value })} />
              <input className="rounded-xl border px-2 py-2 text-sm" type="number" placeholder="Rate" value={line.rate} onChange={(e) => setLine({ ...line, rate: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded-xl border px-2 py-2 text-sm" type="date" value={line.expiryDate} onChange={(e) => setLine({ ...line, expiryDate: e.target.value })} />
              <input className="rounded-xl border px-2 py-2 text-sm" placeholder="Batch #" value={line.batchNumber} onChange={(e) => setLine({ ...line, batchNumber: e.target.value })} />
            </div>
            <button type="button" className="rounded-xl border px-3 py-2 text-sm font-semibold" onClick={addLine}>
              Add line
            </button>
          </div>

          <div className="space-y-1 text-sm">
            {lines.map((l, i) => (
              <div key={i} className="flex justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                <span>
                  {l.item} × {l.qty} @ {inr(l.rate)}
                </span>
                <button type="button" className="text-xs text-rose-600" onClick={() => setLines((p) => p.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className="rounded-xl border px-3 py-2 text-sm" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as "paid" | "unpaid")}>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
            {paymentStatus === "paid" ? (
              <select className="rounded-xl border px-3 py-2 text-sm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "cash" | "online")}>
                <option value="cash">Cash</option>
                <option value="online">Online</option>
              </select>
            ) : (
              <div className="rounded-xl border border-dashed px-3 py-2 text-xs text-slate-500">Due to supplier</div>
            )}
          </div>
          <button type="button" disabled={busy || !lines.length} className="w-full rounded-xl bg-cyan-500 py-2.5 text-sm font-bold text-white disabled:opacity-50" onClick={() => void submit()}>
            {busy ? "Posting…" : "Post purchase & increase stock"}
          </button>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">Recent purchases</div>
          {loading ? <div className="h-24 animate-pulse rounded-xl bg-slate-100" /> : null}
          <div className="max-h-[520px] space-y-2 overflow-auto">
            {[...purchases]
              .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
              .slice(0, 40)
              .map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                  <div className="flex justify-between font-semibold">
                    <span>{p.purchaseNumber || p.invoiceNumber || p.id.slice(0, 6)}</span>
                    <span>{inr(p.total || p.price)}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {p.date} · {p.vendorName || p.seller || "—"} · {p.paymentStatus || p.paidStatus || "—"}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
