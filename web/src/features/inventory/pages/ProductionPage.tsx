import { useState } from "react";
import { Link } from "react-router-dom";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { InventoryItemDoc } from "../types";
import type { ProductionBatchDoc, RecipeDoc } from "../types";
import { runProductionBatch } from "../services/recipeService";
import { computeRecipeCost } from "../utils/costing";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

import { ContentLoading } from "@/components/ui/Loading";

export function ProductionPage() {
  const { data: recipes } = useRestaurantCollection<RecipeDoc>({ path: "recipes" });
  const { data: inventory } = useRestaurantCollection<InventoryItemDoc>({ path: "inventory" });
  const { data: batches, loading } = useRestaurantCollection<ProductionBatchDoc>({ path: "productionBatches" });
  const [recipeId, setRecipeId] = useState("");
  const [servings, setServings] = useState("1");
  const [outputId, setOutputId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const recipe = recipes.find((r) => r.id === recipeId && !r.isDeleted);

  return (
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/inventory" className="text-xs font-semibold text-primary"> ← Inventory </Link>}
        title="Production batches"
      />
      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card hover={false} padding="sm"><div className="space-y-2">
          <div className="text-[14px] font-bold text-text-primary">Run production</div>
          <select className="kg-input w-full" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
            <option value="">Select recipe</option>
            {recipes.filter((r) => !r.isDeleted).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input className="kg-input w-full" type="number" min={1} value={servings} onChange={(e) => setServings(e.target.value)} placeholder="Servings / batches" />
          <select className="kg-input w-full" value={outputId} onChange={(e) => setOutputId(e.target.value)}>
            <option value="">Output inventory (optional)</option>
            {inventory.filter((i) => !i.isDeleted).map((i) => (
              <option key={i.id} value={i.id}>
                {i.item}
              </option>
            ))}
          </select>
          {recipe ? (
            <div className="rounded-lg border border-stroke-0 bg-bg-1/60 p-3 text-[13px]">
              Est. cost {inr(computeRecipeCost(recipe).totalProductionCost * (num(servings) / Math.max(1, recipe.servingSize || 1)))}
            </div>
          ) : null}
          <button
            type="button"
            disabled={busy || !recipe}
            className="kg-btn kg-btn-primary w-full disabled:opacity-50"
            onClick={async () => {
              if (!recipe) return;
              try {
                setBusy(true);
                await runProductionBatch({
                  recipe: { ...recipe, id: recipe.id },
                  servings: num(servings) || 1,
                  outputInventoryId: outputId || null
                });
                setMsg("Production complete — ingredients consumed");
              } catch (e: any) {
                setMsg(e?.message || "Production failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Running…" : "Produce & consume ingredients"}
          </button>
        </div></Card>

        <Card padding="sm" hover={false}>
          <SectionTitle title="Recent batches" />
          {loading ? <ContentLoading variant="block" label="Loading" /> : null}
          <div className="max-h-[480px] space-y-2 overflow-auto">
            {[...batches]
              .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
              .slice(0, 30)
              .map((b) => (
                <div key={b.id} className="rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px] text-text-primary">
                  <div className="font-semibold">
                    {b.batchNumber} · {b.recipeName}
                  </div>
                  <div className="text-xs text-text-muted">
                    {b.date} · out {b.outputQty} · cost {inr(b.totalCost || 0)}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
