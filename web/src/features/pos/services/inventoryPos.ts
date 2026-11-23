import { getDocs, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { num } from "@/lib/utils";
import type { CartLine, InventoryDoc, MenuItemDoc } from "../types";
import type { WithId } from "../hooks/useRestaurantCollection";

function parseRecipe(str: string | undefined) {
  const raw = String(str || "").trim();
  if (!raw) return [] as Array<{ item: string; qty: number }>;
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [item, qtyRaw] = part.split(":").map((s) => String(s || "").trim());
      const qty = num(qtyRaw);
      return item && qty > 0 ? { item, qty } : null;
    })
    .filter(Boolean) as Array<{ item: string; qty: number }>;
}

function findInv(inventory: Array<WithId<InventoryDoc>>, name: string) {
  const key = String(name || "").trim().toLowerCase();
  return inventory.find((x) => String(x.item || "").trim().toLowerCase() === key) || null;
}

/** Port of vanilla KgPhase2.deductRecipeForCart — returns planned adjustments (applied in bill transaction). */
export function planRecipeDeductions(args: {
  cart: CartLine[];
  menuItems: Array<WithId<MenuItemDoc>>;
  inventory: Array<WithId<InventoryDoc>>;
  allowNegative?: boolean;
}) {
  const missing: string[] = [];
  const insufficient: string[] = [];
  const needs = new Map<string, { qty: number; item: string; unit?: string }>();

  for (const line of args.cart) {
    if (line.complimentary) continue;
    const menu =
      args.menuItems.find((m) => m.id === line.menuItemId) ||
      args.menuItems.find((m) => String(m.name).toLowerCase() === String(line.name).toLowerCase());
    const recipe = Array.isArray(menu?.recipe) && menu!.recipe!.length ? menu!.recipe! : parseRecipe(menu?.recipeText);
    if (!recipe.length) continue;
    const serveQty = Math.max(1, Math.floor(num(line.qty)));
    for (const ing of recipe) {
      const inv = findInv(args.inventory, ing.item);
      if (!inv) {
        missing.push(ing.item);
        continue;
      }
      const add = num(ing.qty) * serveQty;
      const prev = needs.get(inv.id) || { qty: 0, item: inv.item, unit: inv.unit };
      prev.qty += add;
      needs.set(inv.id, prev);
    }
  }

  const adjustments: Array<{ id: string; delta: number; item: string; unit?: string }> = [];
  for (const [id, info] of needs.entries()) {
    const inv = args.inventory.find((x) => x.id === id);
    if (!inv) continue;
    if (!args.allowNegative && num(inv.qty) < info.qty) {
      insufficient.push(`${info.item} (need ${info.qty}, have ${num(inv.qty)})`);
    }
    adjustments.push({ id, delta: -info.qty, item: info.item, unit: info.unit });
  }

  return { adjustments, missing: [...new Set(missing)], insufficient: [...new Set(insufficient)] };
}

export async function loadInventory(): Promise<Array<WithId<InventoryDoc>>> {
  const snap = await getDocs(collection(db, "inventory"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as InventoryDoc) }));
}
