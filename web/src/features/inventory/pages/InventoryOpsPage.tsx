import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { InventoryItemDoc, WastageDoc } from "../types";
import { recordWastage, createStockTransfer, savePhysicalCount, LOCATIONS } from "../services/opsService";

export function InventoryOpsPage() {
  const { data: items } = useRestaurantCollection<InventoryItemDoc>({ path: "inventory" });
  const { data: wastage } = useRestaurantCollection<WastageDoc>({ path: "wastage" });
  const [tab, setTab] = useState<"waste" | "transfer" | "count">("waste");
  const [msg, setMsg] = useState<string | null>(null);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<WastageDoc["reason"]>("kitchen");
  const [notes, setNotes] = useState("");
  const [fromLoc, setFromLoc] = useState<string>("Store Room");
  const [toLoc, setToLoc] = useState<string>("Kitchen");
  const [counts, setCounts] = useState<Record<string, string>>({});

  const selected = items.find((i) => i.id === itemId);

  const countLines = useMemo(
    () =>
      items
        .filter((i) => !i.isDeleted && !i.archived)
        .slice(0, 40)
        .map((i) => {
          const actual = counts[i.id] !== undefined ? num(counts[i.id]) : num(i.qty);
          return {
            inventoryId: i.id,
            item: i.item,
            systemQty: num(i.qty),
            actualQty: actual,
            variance: actual - num(i.qty),
            unit: i.unit
          };
        }),
    [items, counts]
  );

  return (
    <div className="space-y-4">
      <div>
        <Link to="/inventory" className="text-xs font-semibold text-cyan-700">
          ← Inventory
        </Link>
        <h1 className="text-xl font-black">Stock operations</h1>
      </div>
      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}

      <div className="flex gap-2">
        {(["waste", "transfer", "count"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${tab === t ? "bg-slate-900 text-white" : "bg-white border"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "waste" ? (
        <div className="max-w-lg space-y-2 rounded-2xl border bg-white p-4 shadow-sm">
          <select className="w-full rounded-xl border px-3 py-2 text-sm" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Select item</option>
            {items.filter((i) => !i.isDeleted).map((i) => (
              <option key={i.id} value={i.id}>
                {i.item} ({i.qty} {i.unit})
              </option>
            ))}
          </select>
          <input className="w-full rounded-xl border px-3 py-2 text-sm" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          <select className="w-full rounded-xl border px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value as WastageDoc["reason"])}>
            {["expired", "burnt", "spoiled", "kitchen", "return", "prep", "other"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button
            type="button"
            className="w-full rounded-xl bg-rose-500 py-2.5 text-sm font-bold text-white"
            onClick={async () => {
              if (!selected) return;
              try {
                const cost = num(qty) * num(selected.avgCost || selected.lastPurchaseCost);
                await recordWastage({
                  inventoryId: selected.id,
                  item: selected.item,
                  qty: num(qty),
                  unit: selected.unit,
                  reason,
                  notes,
                  costImpact: cost
                });
                setMsg("Wastage recorded");
              } catch (e: any) {
                setMsg(e?.message || "Failed");
              }
            }}
          >
            Record wastage
          </button>
          <div className="pt-2 text-xs text-slate-500">{wastage.length} wastage records</div>
        </div>
      ) : null}

      {tab === "transfer" ? (
        <div className="max-w-lg space-y-2 rounded-2xl border bg-white p-4 shadow-sm">
          <select className="w-full rounded-xl border px-3 py-2 text-sm" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Select item</option>
            {items.filter((i) => !i.isDeleted).map((i) => (
              <option key={i.id} value={i.id}>
                {i.item} @ {i.storageLocation || "—"}
              </option>
            ))}
          </select>
          <input className="w-full rounded-xl border px-3 py-2 text-sm" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className="rounded-xl border px-3 py-2 text-sm" value={fromLoc} onChange={(e) => setFromLoc(e.target.value)}>
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  From: {l}
                </option>
              ))}
            </select>
            <select className="rounded-xl border px-3 py-2 text-sm" value={toLoc} onChange={(e) => setToLoc(e.target.value)}>
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  To: {l}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white"
            onClick={async () => {
              if (!selected) return;
              try {
                await createStockTransfer({
                  inventoryId: selected.id,
                  item: selected.item,
                  qty: num(qty),
                  unit: selected.unit,
                  fromLocation: fromLoc,
                  toLocation: toLoc
                });
                setMsg("Transfer recorded");
              } catch (e: any) {
                setMsg(e?.message || "Failed");
              }
            }}
          >
            Transfer stock location
          </button>
        </div>
      ) : null}

      {tab === "count" ? (
        <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-bold">Physical stock count</div>
          <div className="max-h-[420px] space-y-2 overflow-auto">
            {countLines.map((l) => (
              <div key={l.inventoryId} className="grid grid-cols-[1fr_80px_100px_80px] items-center gap-2 text-sm">
                <div className="font-semibold">{l.item}</div>
                <div className="text-slate-500">{l.systemQty}</div>
                <input
                  className="rounded-lg border px-2 py-1"
                  type="number"
                  value={counts[l.inventoryId] ?? String(l.systemQty)}
                  onChange={(e) => setCounts((c) => ({ ...c, [l.inventoryId]: e.target.value }))}
                />
                <div className={l.variance ? "font-bold text-amber-600" : "text-slate-400"}>{l.variance}</div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-white"
            onClick={async () => {
              try {
                await savePhysicalCount({ lines: countLines, applyAdjustments: true });
                setMsg("Count saved & variances adjusted");
              } catch (e: any) {
                setMsg(e?.message || "Failed");
              }
            }}
          >
            Save count & apply adjustments
          </button>
        </div>
      ) : null}
    </div>
  );
}
