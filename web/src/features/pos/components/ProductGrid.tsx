import { inr } from "@/lib/utils";
import type { DietType, MenuItemDoc } from "../types";
import type { WithId } from "../hooks/useRestaurantCollection";
import { clsx } from "clsx";
import { PackageSearch, Star } from "lucide-react";
import { EmptyState } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Loading";

function DietBadge({ diet }: { diet?: DietType }) {
  if (!diet) return null;
  const map = {
    veg: { label: "VEG", className: "bg-success-bg text-success" },
    jain: { label: "JAIN", className: "bg-success-bg text-success" },
    nonveg: { label: "N/V", className: "bg-danger-bg text-danger" },
    egg: { label: "EGG", className: "bg-warning-bg text-warning" }
  } as const;
  const m = map[diet];
  return <span className={clsx("rounded px-1 py-0.5 text-[9px] font-bold", m.className)}>{m.label}</span>;
}

export function ProductGrid(props: {
  items: Array<WithId<MenuItemDoc>>;
  favoriteIds: string[];
  loading?: boolean;
  totalMenuCount?: number;
  search?: string;
  category?: string;
  onAdd: (item: WithId<MenuItemDoc>) => void;
  onToggleFavorite: (id: string) => void;
  onClearSearch?: () => void;
  onResetCategory?: () => void;
}) {
  if (props.loading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" aria-busy="true" aria-label="Loading menu">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] border border-stroke-0" />
        ))}
      </div>
    );
  }

  if (!props.items.length) {
    const hasSearch = Boolean(props.search?.trim());
    const cat = props.category && props.category !== "All" ? props.category : null;
    const noMenu = !props.totalMenuCount;

    if (noMenu) {
      return (
        <EmptyState
          icon={<PackageSearch size={20} />}
          title="No menu items yet"
          description="Add products to the Firestore menuItems collection to start billing."
        />
      );
    }

    if (hasSearch) {
      return (
        <EmptyState
          icon={<PackageSearch size={20} />}
          title="No products match your search"
          description={`Nothing found for “${props.search?.trim()}”.`}
          action={
            props.onClearSearch ? (
              <Button variant="secondary" onClick={props.onClearSearch}>
                Clear search
              </Button>
            ) : undefined
          }
        />
      );
    }

    if (cat === "Favorites" || cat === "Recent") {
      return (
        <EmptyState
          icon={<PackageSearch size={20} />}
          title={cat === "Favorites" ? "No favourites yet" : "No recent items"}
          description={cat === "Favorites" ? "Tap the star on a product to pin it here." : "Sold items appear here for quick reorder."}
          action={
            props.onResetCategory ? (
              <Button variant="secondary" onClick={props.onResetCategory}>
                Show all products
              </Button>
            ) : undefined
          }
        />
      );
    }

    if (cat) {
      return (
        <EmptyState
          icon={<PackageSearch size={20} />}
          title={`No items in ${cat}`}
          description="Pick another category or show the full menu."
          action={
            props.onResetCategory ? (
              <Button variant="secondary" onClick={props.onResetCategory}>
                Show all products
              </Button>
            ) : undefined
          }
        />
      );
    }

    return <EmptyState icon={<PackageSearch size={20} />} title="No products to show" description="Try refreshing the page." />;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {props.items.map((item) => {
        const unavailable = item.available === false;
        const low = item.trackStock && numSafe(item.stockQty) <= 0;
        const fav = props.favoriteIds.includes(item.id) || item.favorite;
        return (
          <div
            key={item.id}
            className={clsx(
              "group relative rounded-[var(--radius-lg)] border border-stroke-0 bg-card-0 p-2 text-left shadow-panel transition hover:border-primary/40 hover:shadow-float",
              unavailable && "opacity-50"
            )}
          >
            <button
              type="button"
              disabled={unavailable}
              onClick={() => props.onAdd(item)}
              className={clsx("w-full text-left", unavailable && "cursor-not-allowed")}
            >
              <div className="mb-1.5 flex h-12 items-center justify-center overflow-hidden rounded-md bg-primary-light/60">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="text-base font-bold text-primary">{String(item.name || "?").slice(0, 1)}</span>
                )}
              </div>
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-text-primary">{item.name}</div>
                  {item.nameHi ? <div className="truncate text-[10px] text-text-muted">{item.nameHi}</div> : null}
                </div>
                <DietBadge diet={item.diet} />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <div className="text-[12px] font-bold tabular-nums text-text-primary">{inr(item.price)}</div>
                <div className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">
                  {unavailable ? "N/A" : low ? "Out" : "Add"}
                </div>
              </div>
            </button>
            <button
              type="button"
              aria-label={fav ? "Remove favourite" : "Add favourite"}
              onClick={() => props.onToggleFavorite(item.id)}
              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border border-stroke-0 bg-card-0/95 shadow-sm"
            >
              <Star size={12} className={clsx(fav ? "fill-warning text-warning" : "text-text-muted")} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function numSafe(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
