import { collection, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import { adjustStock } from "./stockService";
import { computeRecipeCost, ingredientEffectiveQty } from "../utils/costing";
import type { ProductionBatchDoc, RecipeDoc, RecipeIngredient, RecipeVersionDoc } from "../types";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyIngredient(): RecipeIngredient {
  return {
    id: uid(),
    inventoryId: null,
    item: "",
    qty: 0,
    unit: "g",
    cost: 0,
    prepLossPct: 0,
    cookLossPct: 0,
    optional: false,
    mandatory: true
  };
}

export async function saveRecipe(input: Partial<RecipeDoc> & { name: string; id?: string; changeNote?: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("Recipe name required");
  const ingredients = (input.ingredients || []).filter((i) => i.item && num(i.qty) > 0);
  if (!ingredients.length) throw new Error("Add at least one ingredient");

  const id = input.id || doc(collection(db, "recipes")).id;
  const ref = doc(db, "recipes", id);
  const existing = await getDoc(ref);
  const prev = existing.exists() ? (existing.data() as RecipeDoc) : null;
  const version = (prev?.version || 0) + (existing.exists() ? 1 : 1);

  const recipe: RecipeDoc = {
    name,
    category: input.category || prev?.category || "General",
    imageUrl: input.imageUrl || prev?.imageUrl || "",
    prepTimeMin: num(input.prepTimeMin ?? prev?.prepTimeMin),
    cookTimeMin: num(input.cookTimeMin ?? prev?.cookTimeMin),
    servingSize: num(input.servingSize ?? prev?.servingSize) || 1,
    yieldQty: num(input.yieldQty ?? prev?.yieldQty) || 1,
    yieldUnit: input.yieldUnit || prev?.yieldUnit || "portion",
    difficulty: input.difficulty || prev?.difficulty || "medium",
    instructions: input.instructions ?? prev?.instructions ?? "",
    notes: input.notes ?? prev?.notes ?? "",
    attachments: input.attachments || prev?.attachments || [],
    ingredients,
    packagingCost: num(input.packagingCost ?? prev?.packagingCost),
    gasCost: num(input.gasCost ?? prev?.gasCost),
    labourCost: num(input.labourCost ?? prev?.labourCost),
    overheadCost: num(input.overheadCost ?? prev?.overheadCost),
    sellingPrice: num(input.sellingPrice ?? prev?.sellingPrice),
    portionSize: num(input.portionSize ?? prev?.portionSize) || 1,
    rawWeight: num(input.rawWeight ?? prev?.rawWeight),
    cookedWeight: num(input.cookedWeight ?? prev?.cookedWeight),
    menuItemId: input.menuItemId ?? prev?.menuItemId ?? null,
    version,
    syncStatus: "synced",
    isDeleted: false,
    ...(existing.exists() ? auditUpdate({ status: "active" }) : auditCreate({ status: "active" }))
  };

  await setDoc(ref, recipe, { merge: true });

  // Version snapshot
  const vref = doc(collection(db, "recipeVersions"));
  const versionDoc: RecipeVersionDoc = {
    recipeId: id,
    version,
    snapshot: recipe,
    changeNote: input.changeNote || (existing.exists() ? "Updated" : "Created"),
    syncStatus: "synced",
    ...auditCreate({ status: "saved" })
  };
  await setDoc(vref, versionDoc);

  // Sync simplified recipe onto linked menu item (vanilla POS compat)
  if (recipe.menuItemId) {
    const simple = ingredients.map((i) => ({ item: i.item, qty: ingredientEffectiveQty(i) / Math.max(1, recipe.servingSize) }));
    const recipeText = simple.map((r) => `${r.item}:${r.qty}`).join(", ");
    await setDoc(
      doc(db, "menuItems", recipe.menuItemId),
      { recipe: simple, recipeText, ...auditUpdate() },
      { merge: true }
    );
  }

  await logActivity({
    action: existing.exists() ? "recipe_updated" : "recipe_created",
    entityType: "recipes",
    entityId: id,
    message: `${name} v${version}`
  });

  return { id, cost: computeRecipeCost(recipe) };
}

export async function restoreRecipeVersion(recipeId: string, versionId: string) {
  const vsnap = await getDoc(doc(db, "recipeVersions", versionId));
  if (!vsnap.exists()) throw new Error("Version not found");
  const v = vsnap.data() as RecipeVersionDoc;
  await saveRecipe({ ...v.snapshot, id: recipeId, changeNote: `Restored v${v.version}` });
}

export async function softDeleteRecipe(id: string) {
  await updateDoc(doc(db, "recipes", id), { isDeleted: true, status: "archived", ...auditUpdate() });
}

export async function runProductionBatch(args: {
  recipe: RecipeDoc & { id: string };
  servings: number;
  outputInventoryId?: string | null;
  outputItem?: string;
  outputUnit?: string;
  notes?: string;
  allowNegative?: boolean;
}) {
  const servings = Math.max(1, Math.floor(num(args.servings)));
  const scale = servings / Math.max(1, num(args.recipe.servingSize) || 1);

  for (const ing of args.recipe.ingredients) {
    if (ing.optional && !ing.inventoryId) continue;
    if (!ing.inventoryId) throw new Error(`Link inventory for ingredient: ${ing.item}`);
    const need = ingredientEffectiveQty(ing) * scale;
    await adjustStock({
      inventoryId: ing.inventoryId,
      delta: -need,
      type: "production",
      reason: `Production ${args.recipe.name} ×${servings}`,
      date: isoDate(),
      allowNegative: args.allowNegative
    });
  }

  const outputQty = num(args.recipe.yieldQty || servings) * (servings / Math.max(1, args.recipe.servingSize || 1));
  const outputItem = args.outputItem || args.recipe.name;
  let outputId = args.outputInventoryId;
  if (outputId) {
    await adjustStock({
      inventoryId: outputId,
      delta: outputQty,
      type: "production_out",
      reason: `Produced ${args.recipe.name}`,
      date: isoDate(),
      createLot: true,
      batchNumber: `PR-${Date.now().toString(36).toUpperCase()}`
    });
  }

  const cost = computeRecipeCost(args.recipe);
  const totalCost = cost.totalProductionCost * scale;
  const pref = doc(collection(db, "productionBatches"));
  const batchDoc: ProductionBatchDoc = {
    batchNumber: `PB-${Date.now().toString(36).toUpperCase()}`,
    recipeId: args.recipe.id,
    recipeName: args.recipe.name,
    outputKind: args.recipe.category?.toLowerCase().includes("semi") ? "semi_finished" : "finished",
    outputInventoryId: outputId || null,
    outputItem,
    outputQty,
    outputUnit: args.outputUnit || args.recipe.yieldUnit || "pcs",
    servings,
    ingredientCost: cost.ingredientCost * scale,
    totalCost,
    date: isoDate(),
    notes: args.notes || "",
    syncStatus: "synced",
    ...auditCreate({ status: "completed" })
  };
  await setDoc(pref, batchDoc);
  await logActivity({
    action: "production_complete",
    entityType: "productionBatches",
    entityId: pref.id,
    message: `${args.recipe.name} ×${servings}`
  });
  return pref.id;
}
