import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { num } from "@/lib/utils";
import type { MenuItemDoc } from "../types";
import { auditCreate, auditUpdate, logActivity } from "./posFirestore";

export function parseRecipe(text: string): Array<{ item: string; qty: number }> {
  return String(text || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [itemRaw, qtyRaw] = part.split(":").map((x) => x.trim());
      return { item: itemRaw || "", qty: num(qtyRaw) };
    })
    .filter((r) => r.item && r.qty > 0);
}

export function formatRecipe(recipe: Array<{ item: string; qty: number }> | undefined): string {
  if (!Array.isArray(recipe) || !recipe.length) return "";
  return recipe.map((r) => `${r.item}:${r.qty}`).join(", ");
}

export type MenuItemInput = {
  id?: string;
  name: string;
  nameHi?: string;
  price: number;
  category?: string;
  imageUrl?: string;
  available?: boolean;
  favorite?: boolean;
  diet?: MenuItemDoc["diet"];
  barcode?: string;
  recipeText?: string;
  recipe?: Array<{ item: string; qty: number }>;
};

export async function upsertMenuItem(input: MenuItemInput) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Enter name");
  const price = num(input.price);
  if (!(price >= 0)) throw new Error("Enter valid price");

  const recipe = input.recipe?.length ? input.recipe : parseRecipe(input.recipeText || "");
  const payload: MenuItemDoc = {
    ...(input.id ? auditUpdate({ status: "active" }) : auditCreate({ status: "active" })),
    name,
    nameHi: String(input.nameHi || "").trim() || undefined,
    price,
    category: String(input.category || "").trim() || "General",
    imageUrl: input.imageUrl || "",
    available: input.available !== false,
    favorite: Boolean(input.favorite),
    diet: input.diet,
    barcode: input.barcode || undefined,
    recipe,
    recipeText: formatRecipe(recipe)
  };

  const id = input.id || doc(collection(db, "menuItems")).id;
  const ref = doc(db, "menuItems", id);
  await setDoc(ref, payload, { merge: Boolean(input.id) });
  await logActivity({
    action: input.id ? "menu.update" : "menu.create",
    entityType: "menuItems",
    entityId: id,
    message: `${input.id ? "Updated" : "Created"} menu item ${name}`
  });
  return id;
}

export async function setMenuItemAvailable(id: string, available: boolean) {
  await updateDoc(doc(db, "menuItems", id), {
    available: Boolean(available),
    ...auditUpdate()
  });
}

export async function deleteMenuItem(id: string) {
  await deleteDoc(doc(db, "menuItems", id));
  await logActivity({
    action: "menu.delete",
    entityType: "menuItems",
    entityId: id,
    message: `Deleted menu item ${id}`
  });
}

export async function clearAllMenuItems() {
  const snap = await getDocs(collection(db, "menuItems"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  await logActivity({
    action: "menu.clear",
    entityType: "menuItems",
    message: `Cleared ${snap.size} menu items`
  });
  return snap.size;
}

export function readImageAsDataUrl(file: File, maxChars = 850_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      if (url.length > maxChars) {
        reject(new Error("Image too large for Firebase. Use a smaller photo."));
        return;
      }
      resolve(url);
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}
