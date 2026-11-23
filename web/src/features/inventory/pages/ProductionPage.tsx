import { useState } from "react";
import { Link } from "react-router-dom";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { InventoryItemDoc } from "../types";
import type { ProductionBatchDoc, RecipeDoc } from "../types";
import { runProductionBatch } from "../services/recipeService";
import { computeRecipeCost } from "../utils/costing";

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
    <div className="space-y-4">
      <div>
        <Link to="/inventory" className="text-xs font-semibold text-cyan-700">
          ← Inventory
        </Link>
        <h1 className="text-xl font-black">Production batches</h1>
      </div>
      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-bold">Run production</div>
          <select className="w-full rounded-xl border px-3 py-2 text-sm" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
            <option value="">Select recipe</option>
            {recipes.filter((r) => !r.isDeleted).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input className="w-full rounded-xl border px-3 py-2 text-sm" type="number" min={1} value={servings} onChange={(e) => setServings(e.target.value)} placeholder="Servings / batches" />
          <select className="w-full rounded-xl border px-3 py-2 text-sm" value={outputId} onChange={(e) => setOutputId(e.target.value)}>
            <option value="">Output inventory (optional)</option>
            {inventory.filter((i) => !i.isDeleted).map((i) => (
              <option key={i.id} value={i.id}>
                {i.item}
              </option>
            ))}
          </select>
          {recipe ? (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              Est. cost {inr(computeRecipeCost(recipe).totalProductionCost * (num(servings) / Math.max(1, recipe.servingSize || 1)))}
            </div>
          ) : null}
          <button
            type="button"
            disabled={busy || !recipe}
            className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white disabled:opacity-50"
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
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">Recent batches</div>
          {loading ? <div className="h-20 animate-pulse rounded-xl bg-slate-100" /> : null}
          <div className="max-h-[480px] space-y-2 overflow-auto">
            {[...batches]
              .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
              .slice(0, 30)
              .map((b) => (
                <div key={b.id} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                  <div className="font-semibold">
                    {b.batchNumber} · {b.recipeName}
                  </div>
                  <div className="text-xs text-slate-500">
                    {b.date} · out {b.outputQty} · cost {inr(b.totalCost || 0)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
