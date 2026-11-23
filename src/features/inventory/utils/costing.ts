import { num } from "@/lib/utils";
import type { RecipeCostBreakdown, RecipeDoc, RecipeIngredient } from "../types";
import { applyLoss } from "./units";

export function ingredientEffectiveQty(ing: RecipeIngredient): number {
  return applyLoss(num(ing.qty), num(ing.prepLossPct), num(ing.cookLossPct));
}

export function ingredientLineCost(ing: RecipeIngredient, unitCost = 0): number {
  const cost = num(ing.cost) > 0 ? num(ing.cost) : unitCost * ingredientEffectiveQty(ing);
  return Math.max(0, cost);
}

export function computeRecipeCost(recipe: RecipeDoc, unitCosts: Record<string, number> = {}): RecipeCostBreakdown {
  const ingredients = recipe.ingredients || [];
  const ingredientCost = ingredients.reduce((s, ing) => {
    const key = String(ing.inventoryId || ing.item || "").toLowerCase();
    const uc = unitCosts[key] ?? unitCosts[String(ing.item || "").toLowerCase()] ?? 0;
    // If cost stored as total for the line qty, use it; else unitCost * effective qty
    if (num(ing.cost) > 0) return s + num(ing.cost);
    return s + uc * ingredientEffectiveQty(ing);
  }, 0);

  const packagingCost = num(recipe.packagingCost);
  const gasCost = num(recipe.gasCost);
  const labourCost = num(recipe.labourCost);
  const overheadCost = num(recipe.overheadCost);
  const totalProductionCost = ingredientCost + packagingCost + gasCost + labourCost + overheadCost;
  const portions = Math.max(1, num(recipe.servingSize) || num(recipe.yieldQty) || 1);
  const costPerPortion = totalProductionCost / portions;
  const sellingPrice = num(recipe.sellingPrice);
  const profit = sellingPrice - costPerPortion;
  const foodCostPct = sellingPrice > 0 ? (costPerPortion / sellingPrice) * 100 : 0;
  const grossMarginPct = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
  const raw = num(recipe.rawWeight);
  const cooked = num(recipe.cookedWeight);
  const yieldPct = raw > 0 ? (cooked / raw) * 100 : cooked > 0 ? 100 : 0;

  return {
    ingredientCost,
    packagingCost,
    gasCost,
    labourCost,
    overheadCost,
    totalProductionCost,
    costPerPortion,
    sellingPrice,
    profit,
    foodCostPct,
    grossMarginPct,
    yieldPct
  };
}

export function marginFromPrices(cost: number, sell: number) {
  const c = num(cost);
  const s = num(sell);
  return {
    profit: s - c,
    foodCostPct: s > 0 ? (c / s) * 100 : 0,
    grossMarginPct: s > 0 ? ((s - c) / s) * 100 : 0
  };
}
