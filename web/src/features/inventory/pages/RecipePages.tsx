import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Link, useNavigate, useParams } from "react-router-dom";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { MenuItemDoc } from "@/features/pos/types";
import type { InventoryItemDoc, RecipeDoc, RecipeIngredient } from "../types";
import { computeRecipeCost } from "../utils/costing";
import { emptyIngredient, saveRecipe, softDeleteRecipe } from "../services/recipeService";
import { COMMON_UNITS } from "../utils/units";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";

import { ContentLoading } from "@/components/ui/Loading";

export function RecipesListPage() {
  const { data, loading } = useRestaurantCollection<RecipeDoc>({ path: "recipes" });
  const recipes = data.filter((r) => !r.isDeleted);

  return (
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/inventory" className="text-xs font-semibold text-primary"> ← Inventory </Link>}
        title="Recipes"
        actions={
          <>
          <Link to="/inventory/recipes/new" className="kg-btn kg-btn-primary">
            + New recipe
          </Link>
          </>
        }
      />
      {loading ? <ContentLoading variant="block" label="Loading" /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.map((r) => {
          const cost = computeRecipeCost(r);
          return (
            <Link key={r.id} to={`/inventory/recipes/${r.id}`} className="rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 p-4 shadow-panel hover:border-primary/50">
              <div className="text-[14px] font-bold text-text-primary">{r.name}</div>
              <div className="text-xs text-text-muted">
                {r.category || "General"} · v{r.version || 1} · {r.ingredients?.length || 0} ingredients
              </div>
              <div className="mt-2 text-[13px]">
                Cost/portion <strong>{inr(cost.costPerPortion)}</strong>
                {r.sellingPrice ? ` · FC ${cost.foodCostPct.toFixed(1)}%` : ""}
              </div>
            </Link>
          );
        })}
      </div>
      {!recipes.length && !loading ? <EmptyState title="No recipes yet." /> : null}
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
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/inventory/recipes" className="text-xs font-semibold text-primary">← Recipes</Link>}
        title={isNew ? "New recipe" : "Edit recipe"}
        actions={
          <>
            {!isNew ? (
              <button
                type="button"
                className="kg-btn border border-danger/30 bg-danger-bg text-danger hover:brightness-95"
                onClick={() => void softDeleteRecipe(recipeId!).then(() => nav("/inventory/recipes"))}
              >
                Archive
              </button>
            ) : null}
            <button type="button" disabled={busy} className="kg-btn kg-btn-primary" onClick={() => void save()}>
              {busy ? "Saving…" : "Save recipe"}
            </button>
          </>
        }
      />
      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_320px]">
        <Card hover={false} padding="sm"><div className="space-y-3">
          <input className="kg-input w-full font-semibold" placeholder="Recipe name *" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="kg-input !w-auto" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <input className="kg-input !w-auto" type="number" placeholder="Servings" value={servingSize} onChange={(e) => setServingSize(e.target.value)} />
          </div>
          <select className="kg-input w-full" value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)}>
            <option value="">Link menu item (optional — syncs POS recipe)</option>
            {menuItems.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <div className="text-xs font-bold uppercase text-text-muted">Ingredients</div>
          {ingredients.map((ing, idx) => (
            <div key={ing.id} className="grid grid-cols-[1.2fr_0.7fr_0.5fr_0.5fr_0.5fr_auto] gap-1">
              <select
                className="kg-input !w-auto"
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
                className="kg-input !w-auto"
                placeholder="Name"
                value={ing.item}
                onChange={(e) => setIngredients((rows) => rows.map((r, i) => (i === idx ? { ...r, item: e.target.value } : r)))}
              />
              <input
                className="kg-input !w-auto"
                type="number"
                placeholder="Qty"
                value={ing.qty}
                onChange={(e) => setIngredients((rows) => rows.map((r, i) => (i === idx ? { ...r, qty: num(e.target.value) } : r)))}
              />
              <select
                className="kg-input !w-auto"
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
                className="kg-input !w-auto"
                type="number"
                placeholder="Loss%"
                value={ing.prepLossPct || 0}
                onChange={(e) => setIngredients((rows) => rows.map((r, i) => (i === idx ? { ...r, prepLossPct: num(e.target.value) } : r)))}
              />
              <button type="button" className="text-xs text-danger" onClick={() => setIngredients((rows) => rows.filter((_, i) => i !== idx))}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="kg-btn kg-btn-secondary" onClick={() => setIngredients((r) => [...r, emptyIngredient()])}>
            + Ingredient
          </button>

          <textarea className="kg-input w-full" rows={4} placeholder="Instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div></Card>

        <Card hover={false} padding="sm" className="h-fit"><aside className="space-y-3">
          <div className="text-[14px] font-bold text-text-primary">Costing</div>
          <Field label="Selling price / portion" value={sellingPrice} onChange={setSellingPrice} />
          <Field label="Packaging" value={packagingCost} onChange={setPackagingCost} />
          <Field label="Gas / utilities" value={gasCost} onChange={setGasCost} />
          <Field label="Labour" value={labourCost} onChange={setLabourCost} />
          <Field label="Overhead" value={overheadCost} onChange={setOverheadCost} />
          <Field label="Raw weight" value={rawWeight} onChange={setRawWeight} />
          <Field label="Cooked weight" value={cookedWeight} onChange={setCookedWeight} />
          <div className="space-y-1 border-t pt-3 text-[13px]">
            <Row label="Ingredient cost" value={inr(cost.ingredientCost)} />
            <Row label="Production cost" value={inr(cost.totalProductionCost)} />
            <Row label="Cost / portion" value={inr(cost.costPerPortion)} />
            <Row label="Food cost %" value={`${cost.foodCostPct.toFixed(1)}%`} />
            <Row label="Gross margin %" value={`${cost.grossMarginPct.toFixed(1)}%`} />
            <Row label="Yield %" value={`${cost.yieldPct.toFixed(1)}%`} />
            <Row label="Profit / portion" value={inr(cost.profit)} />
          </div>
        </aside></Card>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      <span className="text-text-muted">{label}</span>
      <input className="kg-input mt-1 w-full" type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
