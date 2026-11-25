import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Search, Trash2, UtensilsCrossed } from "lucide-react";
import { clsx } from "clsx";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { ContentLoading } from "@/components/ui/Loading";
import { Button } from "@/components/ui/Button";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "../hooks/useRestaurantCollection";
import type { DietType, MenuItemDoc } from "../types";
import {
  clearAllMenuItems,
  deleteMenuItem,
  formatRecipe,
  readImageAsDataUrl,
  setMenuItemAvailable,
  upsertMenuItem
} from "../services/menuService";

const DIETS: Array<DietType | ""> = ["", "veg", "nonveg", "jain", "egg"];

const emptyForm = {
  id: "",
  name: "",
  nameHi: "",
  price: "",
  category: "",
  available: "true",
  favorite: false,
  diet: "" as DietType | "",
  barcode: "",
  recipeText: "",
  imageUrl: ""
};

export function MenuManagementPage() {
  const { data, loading, error } = useRestaurantCollection<MenuItemDoc>({ path: "menuItems" });
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const categories = useMemo(() => {
    const set = new Set<string>();
    data.forEach((m) => set.add(String(m.category || "General")));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return [...data]
      .filter((m) => {
        if (category !== "all" && String(m.category || "General") !== category) return false;
        if (!query) return true;
        const blob = `${m.name} ${m.nameHi || ""} ${m.category || ""} ${m.barcode || ""}`.toLowerCase();
        return blob.includes(query);
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [data, q, category]);

  function resetForm() {
    setForm(emptyForm);
  }

  function editRow(m: MenuItemDoc & { id: string }) {
    setForm({
      id: m.id,
      name: m.name || "",
      nameHi: m.nameHi || "",
      price: String(m.price ?? ""),
      category: m.category || "",
      available: m.available === false ? "false" : "true",
      favorite: Boolean(m.favorite),
      diet: m.diet || "",
      barcode: m.barcode || "",
      recipeText: m.recipeText || formatRecipe(m.recipe),
      imageUrl: m.imageUrl || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    try {
      setBusy(true);
      setMsg(null);
      await upsertMenuItem({
        id: form.id || undefined,
        name: form.name,
        nameHi: form.nameHi,
        price: num(form.price),
        category: form.category,
        available: form.available === "true",
        favorite: form.favorite,
        diet: form.diet || undefined,
        barcode: form.barcode,
        recipeText: form.recipeText,
        imageUrl: form.imageUrl
      });
      setMsg(form.id ? "Menu item updated" : "Menu item saved");
      resetForm();
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onImage(file: File | null) {
    if (!file) return;
    try {
      setBusy(true);
      const url = await readImageAsDataUrl(file);
      setForm((f) => ({ ...f, imageUrl: url }));
      setMsg("Image ready — save to apply");
    } catch (e: any) {
      setMsg(e?.message || "Image failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Operations"
        title="Menu Management"
        description="Add, edit, and control what appears on POS."
        actions={
          <Link to="/pos" className="kg-btn kg-btn-secondary">
            Open POS
          </Link>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card hover={false} padding="sm">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="text-[14px] font-bold text-text-primary">{form.id ? "Edit item" : "New item"}</div>
            <input
              className="kg-input w-full"
              placeholder="Name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              className="kg-input w-full"
              placeholder="Hindi name"
              value={form.nameHi}
              onChange={(e) => setForm({ ...form, nameHi: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="kg-input w-full"
                type="number"
                min="0"
                step="1"
                placeholder="Price *"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                required
              />
              <input
                className="kg-input w-full"
                placeholder="Category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                list="menu-category-options"
              />
              <datalist id="menu-category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="kg-input !w-auto"
                value={form.available}
                onChange={(e) => setForm({ ...form, available: e.target.value })}
              >
                <option value="true">Available</option>
                <option value="false">Unavailable</option>
              </select>
              <select
                className="kg-input !w-auto"
                value={form.diet}
                onChange={(e) => setForm({ ...form, diet: e.target.value as DietType | "" })}
              >
                <option value="">Diet (optional)</option>
                {DIETS.filter(Boolean).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <input
              className="kg-input w-full"
              placeholder="Barcode (optional)"
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            />
            <input
              className="kg-input w-full"
              placeholder="Recipe stock deduct e.g. Paneer:0.15, Oil:0.01"
              value={form.recipeText}
              onChange={(e) => setForm({ ...form, recipeText: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                className="kg-input w-full !py-1.5 text-[12px]"
                onChange={(e) => void onImage(e.target.files?.[0] || null)}
              />
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="" className="h-12 w-16 rounded-lg border border-stroke-0 object-cover" />
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
              <input
                type="checkbox"
                checked={form.favorite}
                onChange={(e) => setForm({ ...form, favorite: e.target.checked })}
              />
              Mark as favourite
            </label>
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={busy} className="flex-1">
                {busy ? "Saving…" : form.id ? "Update item" : "Save item"}
              </Button>
              <Button type="button" variant="secondary" onClick={resetForm}>
                Clear
              </Button>
            </div>
          </form>
        </Card>

        <Card hover={false} padding="sm">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                className="kg-input !bg-bg-1 !py-2 !pl-9"
                placeholder="Search menu…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select className="kg-input !w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !data.length}
              onClick={() => {
                if (!confirm("Delete ALL menu items? This cannot be undone.")) return;
                void (async () => {
                  try {
                    setBusy(true);
                    const n = await clearAllMenuItems();
                    setMsg(`Cleared ${n} items`);
                    resetForm();
                  } catch (e: any) {
                    setMsg(e?.message || "Clear failed");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Clear entire menu
            </Button>
          </div>

          {loading ? <ContentLoading label="Loading menu…" /> : null}

          {!loading && !rows.length ? (
            <EmptyState
              icon={<UtensilsCrossed size={18} />}
              title="No menu items"
              description="Add your first item on the left. It will show on POS immediately."
            />
          ) : null}

          <div className="space-y-1.5">
            {rows.map((m) => (
              <div
                key={m.id}
                className={clsx(
                  "flex flex-wrap items-center gap-2 rounded-xl border border-stroke-0 bg-bg-1/50 px-2.5 py-2",
                  m.available === false && "opacity-60"
                )}
              >
                <div className="h-11 w-14 shrink-0 overflow-hidden rounded-lg border border-stroke-0 bg-card-0">
                  {m.imageUrl ? (
                    <img src={m.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-[12px] font-bold text-primary">
                      {String(m.name || "?").slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-text-primary">
                    {m.name}
                    {m.favorite ? <span className="ml-1 text-[10px] font-bold text-warning">★</span> : null}
                  </div>
                  <div className="truncate text-[11px] text-text-muted">
                    {m.nameHi ? `${m.nameHi} · ` : ""}
                    {m.category || "General"} · {inr(m.price)}
                    {m.available === false ? " · Off" : ""}
                  </div>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
                  <input
                    type="checkbox"
                    checked={m.available !== false}
                    onChange={(e) => {
                      void setMenuItemAvailable(m.id, e.target.checked).catch((err: any) =>
                        setMsg(err?.message || "Update failed")
                      );
                    }}
                  />
                  On
                </label>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-stroke-0 bg-card-0 text-text-secondary hover:text-primary"
                  title="Edit"
                  onClick={() => editRow(m)}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-stroke-0 bg-card-0 text-text-secondary hover:text-danger"
                  title="Delete"
                  onClick={() => {
                    if (!confirm(`Delete “${m.name}”?`)) return;
                    void deleteMenuItem(m.id)
                      .then(() => setMsg("Deleted"))
                      .catch((err: any) => setMsg(err?.message || "Delete failed"));
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
