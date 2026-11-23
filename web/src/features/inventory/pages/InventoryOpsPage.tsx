import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Link } from "react-router-dom";
import { num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { InventoryItemDoc, WastageDoc } from "../types";
import { recordWastage, createStockTransfer, savePhysicalCount, LOCATIONS } from "../services/opsService";
import { PageHeader } from "@/components/ui/PageHeader";

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
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/inventory" className="text-xs font-semibold text-primary"> ← Inventory </Link>}
        title="Stock operations"
      />
      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <div className="flex gap-2">
        {(["waste", "transfer", "count"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`kg-btn capitalize ${tab === t ? "kg-btn-primary" : "kg-btn-secondary"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "waste" ? (
        <Card hover={false} padding="sm" className="max-w-lg"><div className="space-y-2">
          <select className="kg-input w-full" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Select item</option>
            {items.filter((i) => !i.isDeleted).map((i) => (
              <option key={i.id} value={i.id}>
                {i.item} ({i.qty} {i.unit})
              </option>
            ))}
          </select>
          <input className="kg-input w-full" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          <select className="kg-input w-full" value={reason} onChange={(e) => setReason(e.target.value as WastageDoc["reason"])}>
            {["expired", "burnt", "spoiled", "kitchen", "return", "prep", "other"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input className="kg-input w-full" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button
            type="button"
            className="kg-btn w-full bg-danger text-white hover:brightness-95"
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
          <div className="pt-2 text-xs text-text-muted">{wastage.length} wastage records</div>
        </div></Card>
      ) : null}

      {tab === "transfer" ? (
        <Card hover={false} padding="sm" className="max-w-lg"><div className="space-y-2">
          <select className="kg-input w-full" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Select item</option>
            {items.filter((i) => !i.isDeleted).map((i) => (
              <option key={i.id} value={i.id}>
                {i.item} @ {i.storageLocation || "—"}
              </option>
            ))}
          </select>
          <input className="kg-input w-full" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className="kg-input !w-auto" value={fromLoc} onChange={(e) => setFromLoc(e.target.value)}>
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  From: {l}
                </option>
              ))}
            </select>
            <select className="kg-input !w-auto" value={toLoc} onChange={(e) => setToLoc(e.target.value)}>
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  To: {l}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="kg-btn kg-btn-primary w-full"
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
        </div></Card>
      ) : null}

      {tab === "count" ? (
        <Card hover={false} padding="sm"><div className="space-y-3">
          <div className="text-[14px] font-bold text-text-primary">Physical stock count</div>
          <div className="max-h-[420px] space-y-2 overflow-auto">
            {countLines.map((l) => (
              <div key={l.inventoryId} className="grid grid-cols-[1fr_80px_100px_80px] items-center gap-2 text-[13px]">
                <div className="font-semibold">{l.item}</div>
                <div className="text-text-muted">{l.systemQty}</div>
                <input
                  className="kg-input !w-auto"
                  type="number"
                  value={counts[l.inventoryId] ?? String(l.systemQty)}
                  onChange={(e) => setCounts((c) => ({ ...c, [l.inventoryId]: e.target.value }))}
                />
                <div className={l.variance ? "font-bold text-warning" : "text-text-muted"}>{l.variance}</div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="kg-btn kg-btn-primary"
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
        </div></Card>
      ) : null}
    </div>
  );
}
