import { inr } from "@/lib/utils";
import type { DietType, MenuItemDoc } from "../types";
import type { WithId } from "../hooks/useRestaurantCollection";
import type { CatalogProduct } from "../domain/productPricing";
import type { MenuGroup } from "../domain/menuGrouping";
import { fromPrice } from "../domain/productsCatalog";
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

export type PosGridItem =
  | { kind: "catalog"; product: CatalogProduct }
  | { kind: "menu"; item: WithId<MenuItemDoc> }
  | { kind: "group"; group: MenuGroup };

export function ProductGrid(props: {
  items: PosGridItem[];
  favoriteIds: string[];
  loading?: boolean;
  totalMenuCount?: number;
  search?: string;
  category?: string;
  onAddCatalog: (product: CatalogProduct) => void;
  onAddMenu: (item: WithId<MenuItemDoc>) => void;
  onAddGroup: (group: MenuGroup) => void;
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

    if (noMenu && !hasSearch) {
      return (
        <EmptyState
          icon={<PackageSearch size={20} />}
          title="No menu items yet"
          description="Grouped Kilogram products still appear here. Add Firestore menuItems for the rest of the menu."
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

    if (cat === "Favorites" || cat === "Recent" || cat === "Hotshots") {
      return (
        <EmptyState
          icon={<PackageSearch size={20} />}
          title={cat === "Favorites" ? "No favourites yet" : cat === "Hotshots" ? "No hotshots yet" : "No recent items"}
          description={
            cat === "Favorites"
              ? "Tap the star on a product to pin it here."
              : "Sold items appear here for quick reorder."
          }
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
      {props.items.map((entry) => {
        if (entry.kind === "catalog") {
          const product = entry.product;
          const favId = `product:${product.id}`;
          const fav = props.favoriteIds.includes(favId) || Boolean(product.favourite);
          return (
            <div
              key={favId}
              className="group relative rounded-[var(--radius-lg)] border border-stroke-0 bg-card-0 p-2 text-left shadow-panel transition hover:border-primary/40 hover:shadow-float"
            >
              <button type="button" onClick={() => props.onAddCatalog(product)} className="w-full text-left">
                <div
                  className="mb-1.5 flex h-12 items-center justify-center overflow-hidden rounded-md"
                  style={{
                    background: `linear-gradient(135deg, ${product.gradient?.[0] || "#e56b2c"}33, ${product.gradient?.[1] || "#9a3f24"}55)`
                  }}
                >
                  <span className="text-base font-bold text-primary">{product.name.slice(0, 1)}</span>
                </div>
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-text-primary">{product.name}</div>
                    <div className="truncate text-[10px] text-text-muted">{product.categories.join(" · ")}</div>
                  </div>
                  <DietBadge diet="veg" />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <div className="text-[12px] font-bold tabular-nums text-text-primary">from {inr(fromPrice(product))}</div>
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">Pick</div>
                </div>
              </button>
              <button
                type="button"
                aria-label={fav ? "Remove favourite" : "Add favourite"}
                onClick={() => props.onToggleFavorite(favId)}
                className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border border-stroke-0 bg-card-0/95 shadow-sm"
              >
                <Star size={12} className={clsx(fav ? "fill-warning text-warning" : "text-text-muted")} aria-hidden />
              </button>
            </div>
          );
        }

        if (entry.kind === "group") {
          const group = entry.group;
          const favId = `group:${group.key}`;
          const fav =
            props.favoriteIds.includes(favId) ||
            Boolean(group.favorite) ||
            group.variants.some((v) => props.favoriteIds.includes(v.id));
          return (
            <div
              key={favId}
              className="group relative rounded-[var(--radius-lg)] border border-stroke-0 bg-card-0 p-2 text-left shadow-panel transition hover:border-primary/40 hover:shadow-float"
            >
              <button type="button" onClick={() => props.onAddGroup(group)} className="w-full text-left">
                <div className="mb-1.5 flex h-12 items-center justify-center overflow-hidden rounded-md bg-primary-light/60">
                  {group.imageUrl ? (
                    <img src={group.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-base font-bold text-primary">{group.baseName.slice(0, 1)}</span>
                  )}
                </div>
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-text-primary">{group.baseName}</div>
                    {group.nameHi ? <div className="truncate text-[10px] text-text-muted">{group.nameHi}</div> : null}
                  </div>
                  <DietBadge diet={group.diet || "veg"} />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <div className="text-[12px] font-bold tabular-nums text-text-primary">
                    {group.variants.length > 1 ? `from ${inr(group.minPrice)}` : inr(group.minPrice)}
                  </div>
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">Pick</div>
                </div>
              </button>
              <button
                type="button"
                aria-label={fav ? "Remove favourite" : "Add favourite"}
                onClick={() => props.onToggleFavorite(favId)}
                className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border border-stroke-0 bg-card-0/95 shadow-sm"
              >
                <Star size={12} className={clsx(fav ? "fill-warning text-warning" : "text-text-muted")} aria-hidden />
              </button>
            </div>
          );
        }

        const item = entry.item;
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
              onClick={() => props.onAddMenu(item)}
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
