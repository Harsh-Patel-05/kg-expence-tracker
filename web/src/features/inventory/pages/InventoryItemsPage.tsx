import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Link } from "react-router-dom";
import { Search, Inbox } from "lucide-react";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { InventoryItemDoc, InventoryKind } from "../types";
import { availableQty } from "../utils/alerts";
import { upsertInventoryItem, softDeleteInventory, restoreInventory, adjustStock } from "../services/stockService";
import { COMMON_UNITS } from "../utils/units";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";

import { ContentLoading } from "@/components/ui/Loading";

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
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/inventory" className="text-xs font-semibold text-primary"> ← Inventory </Link>}
        title="Inventory items"
      />
      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card hover={false} padding="sm"><form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}>
          <div className="text-[14px] font-bold text-text-primary">{form.id ? "Edit item" : "New item"}</div>
          <input className="kg-input w-full" placeholder="Name *" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} required />
          <div className="grid grid-cols-2 gap-2">
            <select className="kg-input !w-auto" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <select className="kg-input !w-auto" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as InventoryKind })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="kg-input !w-auto" type="number" step="any" placeholder="Qty" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            <input className="kg-input !w-auto" type="number" step="any" placeholder="Reorder / min" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
          </div>
          <input className="kg-input w-full" placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <input className="kg-input w-full" placeholder="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          <input className="kg-input w-full" placeholder="Storage location" value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} />
          <input className="kg-input w-full" type="number" step="any" placeholder="Avg cost" value={form.avgCost} onChange={(e) => setForm({ ...form, avgCost: e.target.value })} />
          <textarea className="kg-input w-full" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          <button disabled={busy} className="kg-btn kg-btn-primary w-full disabled:opacity-60">
            {busy ? "Saving…" : "Save item"}
          </button>
        </form></Card>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
              <input className="kg-input w-full !pl-9 pr-3" placeholder="Search name / SKU / barcode" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" />
            </div>
            <select className="kg-input !w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All kinds</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select className="kg-input !w-auto" value={stock} onChange={(e) => setStock(e.target.value)}>
              <option value="all">All stock</option>
              <option value="ok">Healthy</option>
              <option value="low">Low</option>
              <option value="out">Out</option>
            </select>
          </div>

          {loading ? <ContentLoading variant="table" label="Loading" /> : null}
          <div className="overflow-auto rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 shadow-panel">
            <table className="min-w-full text-left text-[13px]">
              <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
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
                  <tr key={i.id} className="border-t border-stroke-0">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{i.item}</div>
                      <div className="text-[11px] text-text-muted">
                        {i.kind || "raw"} · {i.sku || "no sku"}
                        {i.archived || i.isDeleted ? " · archived" : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {availableQty(i)} {i.unit}
                      <div className="text-[11px] text-text-muted">min {i.threshold || i.minStock || 0}</div>
                    </td>
                    <td className="px-3 py-2">{inr(i.avgCost || i.lastPurchaseCost || 0)}</td>
                    <td className="px-3 py-2 text-xs">{i.storageLocation || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="kg-btn kg-btn-secondary !px-2 !py-1 !text-[12px]"
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
                          className="kg-btn kg-btn-secondary !px-2 !py-1 !text-[12px]"
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
                          <button type="button" className="kg-btn kg-btn-secondary !px-2 !py-1 !text-[12px]" onClick={() => void restoreInventory(i.id).then(() => setMsg("Restored"))}>
                            Restore
                          </button>
                        ) : (
                          <button type="button" className="kg-btn border-danger/30 bg-danger-bg text-danger !px-2 !py-1 !text-[12px]" onClick={() => void softDeleteInventory(i.id).then(() => setMsg("Archived"))}>
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No items match." /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
