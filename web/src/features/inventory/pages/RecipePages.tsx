import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { MenuItemDoc } from "@/features/pos/types";
import type { InventoryItemDoc, RecipeDoc, RecipeIngredient } from "../types";
import { computeRecipeCost } from "../utils/costing";
import { emptyIngredient, saveRecipe, softDeleteRecipe } from "../services/recipeService";
import { COMMON_UNITS } from "../utils/units";

export function RecipesListPage() {
  const { data, loading } = useRestaurantCollection<RecipeDoc>({ path: "recipes" });
  const recipes = data.filter((r) => !r.isDeleted);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/inventory" className="text-xs font-semibold text-cyan-700">
            ← Inventory
          </Link>
          <h1 className="text-xl font-black">Recipes</h1>
        </div>
        <Link to="/inventory/recipes/new" className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-bold text-white">
          + New recipe
        </Link>
      </div>
      {loading ? <div className="h-24 animate-pulse rounded-2xl bg-slate-200/60" /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.map((r) => {
          const cost = computeRecipeCost(r);
          return (
            <Link key={r.id} to={`/inventory/recipes/${r.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-cyan-300">
              <div className="text-sm font-bold">{r.name}</div>
              <div className="text-xs text-slate-500">
                {r.category || "General"} · v{r.version || 1} · {r.ingredients?.length || 0} ingredients
              </div>
              <div className="mt-2 text-sm">
                Cost/portion <strong>{inr(cost.costPerPortion)}</strong>
                {r.sellingPrice ? ` · FC ${cost.foodCostPct.toFixed(1)}%` : ""}
              </div>
            </Link>
          );
        })}
      </div>
      {!recipes.length && !loading ? <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">No recipes yet.</div> : null}
    </div>
  );
}

export function RecipeBuilderPage() {
  const { recipeId } = useParams();
  const isNew = !recipeId || recipeId === "new";
  const nav = useNavigate();
  const { data: recipes } = useRestaurantCollection<RecipeDoc>({ path: "recipes" });
  const { data: inventory } = useRestaurantCollection<InventoryItemDoc>({ path: "inventory" });
  const { data: menuItems } = useRestaurantCollection<MenuItemDoc>({ path: "menuItems" });
  const existing = recipes.find((r) => r.id === recipeId);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("General");
  const [servingSize, setServingSize] = useState("1");
  const [sellingPrice, setSellingPrice] = useState("0");
  const [packagingCost, setPackagingCost] = useState("0");
  const [gasCost, setGasCost] = useState("0");
  const [labourCost, setLabourCost] = useState("0");
  const [overheadCost, setOverheadCost] = useState("0");
  const [rawWeight, setRawWeight] = useState("0");
  const [cookedWeight, setCookedWeight] = useState("0");
  const [instructions, setInstructions] = useState("");
  const [menuItemId, setMenuItemId] = useState("");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([emptyIngredient()]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setCategory(existing.category || "General");
    setServingSize(String(existing.servingSize || 1));
    setSellingPrice(String(existing.sellingPrice || 0));
    setPackagingCost(String(existing.packagingCost || 0));
    setGasCost(String(existing.gasCost || 0));
    setLabourCost(String(existing.labourCost || 0));
    setOverheadCost(String(existing.overheadCost || 0));
    setRawWeight(String(existing.rawWeight || 0));
    setCookedWeight(String(existing.cookedWeight || 0));
    setInstructions(existing.instructions || "");
    setMenuItemId(existing.menuItemId || "");
    setIngredients(existing.ingredients?.length ? existing.ingredients : [emptyIngredient()]);
  }, [existing]);

  const draft: RecipeDoc = useMemo(
    () => ({
      name,
      category,
      servingSize: num(servingSize) || 1,
      yieldQty: num(servingSize) || 1,
      sellingPrice: num(sellingPrice),
      packagingCost: num(packagingCost),
      gasCost: num(gasCost),
      labourCost: num(labourCost),
      overheadCost: num(overheadCost),
      rawWeight: num(rawWeight),
      cookedWeight: num(cookedWeight),
      instructions,
      ingredients,
      menuItemId: menuItemId || null
    }),
    [name, category, servingSize, sellingPrice, packagingCost, gasCost, labourCost, overheadCost, rawWeight, cookedWeight, instructions, ingredients, menuItemId]
  );

  const unitCosts = useMemo(() => {
    const map: Record<string, number> = {};
    inventory.forEach((i) => {
      const c = num(i.avgCost || i.lastPurchaseCost || i.costPrice);
      map[i.id.toLowerCase()] = c;
      map[String(i.item).toLowerCase()] = c;
    });
    return map;
  }, [inventory]);

  const cost = computeRecipeCost(draft, unitCosts);

  async function save() {
    try {
      setBusy(true);
      const res = await saveRecipe({
        id: isNew ? undefined : recipeId,
        ...draft,
        changeNote: isNew ? "Created" : "Updated from builder"
      });
      setMsg(`Saved · cost/portion ${inr(res.cost.costPerPortion)}`);
      if (isNew) nav(`/inventory/recipes/${res.id}`);
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
          <Link to="/inventory/recipes" className="text-xs font-semibold text-cyan-700">
            ← Recipes
          </Link>
          <h1 className="text-xl font-black">{isNew ? "New recipe" : "Edit recipe"}</h1>
        </div>
        <div className="flex gap-2">
          {!isNew ? (
            <button
              type="button"
              className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-600"
              onClick={() => void softDeleteRecipe(recipeId!).then(() => nav("/inventory/recipes"))}
            >
              Archive
            </button>
          ) : null}
          <button type="button" disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white" onClick={() => void save()}>
            {busy ? "Saving…" : "Save recipe"}
          </button>
        </div>
      </div>
      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_320px]">
        <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <input className="w-full rounded-xl border px-3 py-2 text-sm font-semibold" placeholder="Recipe name *" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <input className="rounded-xl border px-3 py-2 text-sm" type="number" placeholder="Servings" value={servingSize} onChange={(e) => setServingSize(e.target.value)} />
          </div>
          <select className="w-full rounded-xl border px-3 py-2 text-sm" value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)}>
            <option value="">Link menu item (optional — syncs POS recipe)</option>
            {menuItems.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <div className="text-xs font-bold uppercase text-slate-500">Ingredients</div>
          {ingredients.map((ing, idx) => (
            <div key={ing.id} className="grid grid-cols-[1.2fr_0.7fr_0.5fr_0.5fr_0.5fr_auto] gap-1">
              <select
                className="rounded-lg border px-2 py-1.5 text-xs"
                value={ing.inventoryId || ""}
                onChange={(e) => {
                  const inv = inventory.find((x) => x.id === e.target.value);
                  setIngredients((rows) =>
                    rows.map((r, i) =>
                      i === idx
                        ? {
                            ...r,
                            inventoryId: e.target.value || null,
                            item: inv?.item || r.item,
                            unit: (inv?.unit as any) || r.unit,
                            cost: num(inv?.avgCost || inv?.lastPurchaseCost) * num(r.qty) || r.cost
                          }
                        : r
                    )
                  );
                }}
              >
                <option value="">Inventory…</option>
                {inventory.filter((i) => !i.isDeleted).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.item}
                  </option>
                ))}
              </select>
              <input
                className="rounded-lg border px-2 py-1.5 text-xs"
                placeholder="Name"
                value={ing.item}
                onChange={(e) => setIngredients((rows) => rows.map((r, i) => (i === idx ? { ...r, item: e.target.value } : r)))}
              />
              <input
                className="rounded-lg border px-2 py-1.5 text-xs"
                type="number"
                placeholder="Qty"
                value={ing.qty}
                onChange={(e) => setIngredients((rows) => rows.map((r, i) => (i === idx ? { ...r, qty: num(e.target.value) } : r)))}
              />
              <select
                className="rounded-lg border px-2 py-1.5 text-xs"
                value={ing.unit}
                onChange={(e) => setIngredients((rows) => rows.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r)))}
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <input
                className="rounded-lg border px-2 py-1.5 text-xs"
                type="number"
                placeholder="Loss%"
                value={ing.prepLossPct || 0}
                onChange={(e) => setIngredients((rows) => rows.map((r, i) => (i === idx ? { ...r, prepLossPct: num(e.target.value) } : r)))}
              />
              <button type="button" className="text-xs text-rose-600" onClick={() => setIngredients((rows) => rows.filter((_, i) => i !== idx))}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="rounded-xl border px-3 py-2 text-xs font-semibold" onClick={() => setIngredients((r) => [...r, emptyIngredient()])}>
            + Ingredient
          </button>

          <textarea className="w-full rounded-xl border px-3 py-2 text-sm" rows={4} placeholder="Instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div>

        <aside className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm h-fit">
          <div className="text-sm font-bold">Costing</div>
          <Field label="Selling price / portion" value={sellingPrice} onChange={setSellingPrice} />
          <Field label="Packaging" value={packagingCost} onChange={setPackagingCost} />
          <Field label="Gas / utilities" value={gasCost} onChange={setGasCost} />
          <Field label="Labour" value={labourCost} onChange={setLabourCost} />
          <Field label="Overhead" value={overheadCost} onChange={setOverheadCost} />
          <Field label="Raw weight" value={rawWeight} onChange={setRawWeight} />
          <Field label="Cooked weight" value={cookedWeight} onChange={setCookedWeight} />
          <div className="space-y-1 border-t pt-3 text-sm">
            <Row label="Ingredient cost" value={inr(cost.ingredientCost)} />
            <Row label="Production cost" value={inr(cost.totalProductionCost)} />
            <Row label="Cost / portion" value={inr(cost.costPerPortion)} />
            <Row label="Food cost %" value={`${cost.foodCostPct.toFixed(1)}%`} />
            <Row label="Gross margin %" value={`${cost.grossMarginPct.toFixed(1)}%`} />
            <Row label="Yield %" value={`${cost.yieldPct.toFixed(1)}%`} />
            <Row label="Profit / portion" value={inr(cost.profit)} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      <span className="text-slate-500">{label}</span>
      <input className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
