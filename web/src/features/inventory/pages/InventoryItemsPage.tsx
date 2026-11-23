import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { InventoryItemDoc, InventoryKind } from "../types";
import { availableQty } from "../utils/alerts";
import { upsertInventoryItem, softDeleteInventory, restoreInventory, adjustStock } from "../services/stockService";
import { COMMON_UNITS } from "../utils/units";

const KINDS: InventoryKind[] = ["raw", "semi_finished", "finished", "packaging", "consumable", "cleaning", "kitchen_supply"];

export function InventoryItemsPage() {
  const { data, loading, error } = useRestaurantCollection<InventoryItemDoc>({ path: "inventory" });
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [stock, setStock] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    id: "",
    item: "",
    unit: "kg",
    qty: "0",
    threshold: "5",
    kind: "raw" as InventoryKind,
    sku: "",
    barcode: "",
    storageLocation: "Store Room",
    avgCost: "0",
    notes: ""
  });

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return data.filter((i) => {
      if (kind !== "all" && (i.kind || "raw") !== kind) return false;
      const avail = availableQty(i);
      if (stock === "out" && avail > 0) return false;
      if (stock === "low" && !(num(i.threshold || i.minStock) > 0 && avail <= num(i.threshold || i.minStock))) return false;
      if (stock === "ok" && num(i.threshold || i.minStock) > 0 && avail <= num(i.threshold || i.minStock)) return false;
      if (!query) return true;
      const blob = `${i.item} ${i.sku || ""} ${i.barcode || ""} ${i.storageLocation || ""}`.toLowerCase();
      return blob.includes(query);
    });
  }, [data, q, kind, stock]);

  async function save() {
    try {
      setBusy(true);
      await upsertInventoryItem({
        id: form.id || undefined,
        item: form.item,
        unit: form.unit,
        qty: num(form.qty),
        threshold: num(form.threshold),
        minStock: num(form.threshold),
        reorderLevel: num(form.threshold),
        kind: form.kind,
        sku: form.sku,
        barcode: form.barcode,
        storageLocation: form.storageLocation,
        avgCost: num(form.avgCost),
        lastPurchaseCost: num(form.avgCost),
        notes: form.notes
      });
      setMsg("Item saved");
      setForm({ id: "", item: "", unit: "kg", qty: "0", threshold: "5", kind: "raw", sku: "", barcode: "", storageLocation: "Store Room", avgCost: "0", notes: "" });
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/inventory" className="text-xs font-semibold text-cyan-700">
            ← Inventory
          </Link>
          <h1 className="text-xl font-black">Inventory items</h1>
        </div>
      </div>
      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}
      {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form
          className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="text-sm font-bold">{form.id ? "Edit item" : "New item"}</div>
          <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Name *" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} required />
          <div className="grid grid-cols-2 gap-2">
            <select className="rounded-xl border px-3 py-2 text-sm" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <select className="rounded-xl border px-3 py-2 text-sm" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as InventoryKind })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="rounded-xl border px-3 py-2 text-sm" type="number" step="any" placeholder="Qty" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            <input className="rounded-xl border px-3 py-2 text-sm" type="number" step="any" placeholder="Reorder / min" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
          </div>
          <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Storage location" value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} />
          <input className="w-full rounded-xl border px-3 py-2 text-sm" type="number" step="any" placeholder="Avg cost" value={form.avgCost} onChange={(e) => setForm({ ...form, avgCost: e.target.value })} />
          <textarea className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          <button disabled={busy} className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {busy ? "Saving…" : "Save item"}
          </button>
        </form>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="w-full rounded-xl border bg-white py-2 pl-8 pr-3 text-sm" placeholder="Search name / SKU / barcode" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="rounded-xl border bg-white px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All kinds</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select className="rounded-xl border bg-white px-3 py-2 text-sm" value={stock} onChange={(e) => setStock(e.target.value)}>
              <option value="all">All stock</option>
              <option value="ok">Healthy</option>
              <option value="low">Low</option>
              <option value="out">Out</option>
            </select>
          </div>

          {loading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200/60" /> : null}
          <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Stock</th>
                  <th className="px-3 py-2">Cost</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{i.item}</div>
                      <div className="text-[11px] text-slate-500">
                        {i.kind || "raw"} · {i.sku || "no sku"}
                        {i.archived || i.isDeleted ? " · archived" : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {availableQty(i)} {i.unit}
                      <div className="text-[11px] text-slate-500">min {i.threshold || i.minStock || 0}</div>
                    </td>
                    <td className="px-3 py-2">{inr(i.avgCost || i.lastPurchaseCost || 0)}</td>
                    <td className="px-3 py-2 text-xs">{i.storageLocation || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded-lg border px-2 py-1 text-xs font-semibold"
                          onClick={() =>
                            setForm({
                              id: i.id,
                              item: i.item,
                              unit: i.unit || "pcs",
                              qty: String(i.qty || 0),
                              threshold: String(i.threshold || i.minStock || 0),
                              kind: (i.kind as InventoryKind) || "raw",
                              sku: i.sku || "",
                              barcode: i.barcode || "",
                              storageLocation: i.storageLocation || "Store Room",
                              avgCost: String(i.avgCost || 0),
                              notes: i.notes || ""
                            })
                          }
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border px-2 py-1 text-xs font-semibold"
                          onClick={async () => {
                            const d = Number(prompt("Adjust delta (+ in / − out)", "1"));
                            if (!Number.isFinite(d) || !d) return;
                            const reason = prompt("Reason") || "manual";
                            try {
                              await adjustStock({ inventoryId: i.id, delta: d, type: d > 0 ? "in" : "out", reason, createLot: d > 0 });
                              setMsg("Stock adjusted");
                            } catch (e: any) {
                              setMsg(e?.message || "Adjust failed");
                            }
                          }}
                        >
                          ±
                        </button>
                        {i.archived || i.isDeleted ? (
                          <button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => void restoreInventory(i.id).then(() => setMsg("Restored"))}>
                            Restore
                          </button>
                        ) : (
                          <button type="button" className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600" onClick={() => void softDeleteInventory(i.id).then(() => setMsg("Archived"))}>
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? <div className="p-8 text-center text-sm text-slate-500">No items match.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
