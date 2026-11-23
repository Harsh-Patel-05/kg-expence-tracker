import { inr } from "@/lib/utils";
import type { DietType, MenuItemDoc } from "../types";
import type { WithId } from "../hooks/useRestaurantCollection";
import { clsx } from "clsx";
import { Star } from "lucide-react";

function DietBadge({ diet }: { diet?: DietType }) {
  if (!diet) return null;
  const map = {
    veg: { label: "VEG", className: "bg-emerald-100 text-emerald-800" },
    jain: { label: "JAIN", className: "bg-lime-100 text-lime-800" },
    nonveg: { label: "N/V", className: "bg-rose-100 text-rose-800" },
    egg: { label: "EGG", className: "bg-amber-100 text-amber-800" }
  } as const;
  const m = map[diet];
  return <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-bold", m.className)}>{m.label}</span>;
}

export function ProductGrid(props: {
  items: Array<WithId<MenuItemDoc>>;
  favoriteIds: string[];
  onAdd: (item: WithId<MenuItemDoc>) => void;
  onToggleFavorite: (id: string) => void;
}) {
  if (!props.items.length) {
    return <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">No products match your search.</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {props.items.map((item) => {
        const unavailable = item.available === false;
        const low = item.trackStock && numSafe(item.stockQty) <= 0;
        return (
          <button
            key={item.id}
            type="button"
            disabled={unavailable}
            onClick={() => props.onAdd(item)}
            className={clsx(
              "group relative overflow-hidden rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
              unavailable ? "cursor-not-allowed opacity-50" : "border-slate-200"
            )}
          >
            <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded-xl bg-slate-50">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-black text-cyan-500/80">{item.name.slice(0, 1)}</span>
              )}
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{item.name}</div>
                {item.nameHi ? <div className="truncate text-xs text-slate-500">{item.nameHi}</div> : null}
              </div>
              <DietBadge diet={item.diet} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-sm font-bold text-slate-900">{inr(item.price)}</div>
              <div className="text-[11px] font-semibold text-slate-500">
                {unavailable ? "Unavailable" : low ? "Out of stock" : "In stock"}
              </div>
            </div>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                props.onToggleFavorite(item.id);
              }}
              className="absolute right-2 top-2 rounded-full bg-white/90 p-1 shadow"
            >
              <Star
                size={14}
                className={clsx(props.favoriteIds.includes(item.id) ? "fill-amber-400 text-amber-400" : "text-slate-400")}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function numSafe(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
