import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { inr } from "@/lib/utils";
import type { CatalogProduct, ProductSelection } from "../domain/productPricing";
import { unitPrice } from "../domain/productPricing";
import { defaultSelection } from "../domain/productsCatalog";
import { suggestConfigs } from "../domain/orderSuggestions";

type Props = {
  product: CatalogProduct;
  cartProductIds: string[];
  cartConfigKeys: string[];
  onClose: () => void;
  onAdd: (selection: ProductSelection) => void;
  onAddSuggestion: (selection: ProductSelection) => void;
};

export function QuickPickModal({
  product,
  cartProductIds,
  cartConfigKeys,
  onClose,
  onAdd,
  onAddSuggestion
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const initial = defaultSelection(product) || {
    productId: product.id,
    size: product.defaultSize,
    options: {},
    addons: [],
    qty: 1
  };
  const [sel, setSel] = useState<ProductSelection>(initial);
  const price = unitPrice(product, sel);
  const suggestions = useMemo(
    () => suggestConfigs([product.id, ...cartProductIds], cartConfigKeys, 4),
    [product.id, cartProductIds, cartConfigKeys]
  );
  const sizes = product.sizes || [];
  const optionGroups = product.groups || [];

  function toggleAddon(id: string) {
    setSel((s) => {
      const has = s.addons.includes(id);
      return { ...s, addons: has ? s.addons.filter((x) => x !== id) : [...s.addons, id] };
    });
  }

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inTextarea = target?.tagName === "TEXTAREA";
      const typing =
        target?.tagName === "INPUT" ||
        inTextarea ||
        target?.tagName === "SELECT" ||
        Boolean(target?.isContentEditable);

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      // Enter adds; in kitchen note use Ctrl/Cmd+Enter
      if (e.key === "Enter") {
        if (inTextarea && !(e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        e.stopPropagation();
        onAdd(sel);
        return;
      }

      if (typing) return;

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setSel((s) => ({ ...s, qty: Math.min(99, s.qty + 1) }));
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setSel((s) => ({ ...s, qty: Math.max(1, s.qty - 1) }));
        return;
      }

      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && sizes.length) {
        e.preventDefault();
        const idx = Math.max(0, sizes.findIndex((s) => s.id === sel.size));
        const next =
          e.key === "ArrowRight"
            ? (idx + 1) % sizes.length
            : (idx - 1 + sizes.length) % sizes.length;
        setSel((s) => ({ ...s, size: sizes[next].id }));
        return;
      }

      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && optionGroups.length) {
        e.preventDefault();
        const group = optionGroups[0];
        const opts = group.options || [];
        if (!opts.length) return;
        const cur = sel.options[group.id] || opts[0].id;
        const idx = Math.max(0, opts.findIndex((o) => o.id === cur));
        const next =
          e.key === "ArrowDown"
            ? (idx + 1) % opts.length
            : (idx - 1 + opts.length) % opts.length;
        setSel((s) => ({ ...s, options: { ...s.options, [group.id]: opts[next].id } }));
        return;
      }

      const digit = e.key.match(/^[1-9]$/);
      if (digit && sizes.length) {
        const i = Number(digit[0]) - 1;
        if (sizes[i]) {
          e.preventDefault();
          setSel((s) => ({ ...s, size: sizes[i].id }));
        }
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[color:var(--rp-overlay)] p-3 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stroke-0 bg-card-0 shadow-float outline-none"
      >
        <div
          className="relative h-24 shrink-0"
          style={{
            background: `linear-gradient(135deg, ${product.gradient?.[0] || "#e56b2c"}, ${product.gradient?.[1] || "#9a3f24"})`
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white"
            aria-label="Close quick pick"
          >
            <X size={16} />
          </button>
          <div className="absolute bottom-3 left-4 right-12">
            <div className="text-[18px] font-bold text-white drop-shadow">{product.name}</div>
            <div className="text-[12px] font-medium text-white/85">{product.categories?.join(" · ")}</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {sizes.length > 1 ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Size</div>
                <div className="text-[10px] text-text-muted">← → or 1–{Math.min(9, sizes.length)}</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {sizes.map((size, i) => {
                  const active = sel.size === size.id;
                  const trial = { ...sel, size: size.id };
                  const p = unitPrice(product, trial);
                  return (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => setSel((s) => ({ ...s, size: size.id }))}
                      className={clsx(
                        "rounded-xl border px-2 py-2 text-left transition",
                        active ? "border-primary bg-primary-light ring-2 ring-primary/30" : "border-stroke-0 bg-bg-1 hover:border-stroke-1"
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="text-[12px] font-semibold text-text-primary">{size.label}</div>
                        {i < 9 ? <span className="text-[10px] font-bold text-text-muted">{i + 1}</span> : null}
                      </div>
                      <div className="text-[11px] font-bold tabular-nums text-primary">{inr(p)}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {optionGroups.map((group, gi) => (
            <section key={group.id}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{group.label}</div>
                {gi === 0 ? <div className="text-[10px] text-text-muted">↑ ↓</div> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.options.map((opt) => {
                  const active = sel.options[group.id] === opt.id;
                  const trial = { ...sel, options: { ...sel.options, [group.id]: opt.id } };
                  const trialPrice = unitPrice(product, trial);
                  const showPrice = group.id === "variety" || group.id === "type";
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSel((s) => ({ ...s, options: { ...s.options, [group.id]: opt.id } }))}
                      className={clsx(
                        "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                        active ? "border-primary bg-primary text-white" : "border-stroke-0 bg-bg-1 text-text-secondary hover:border-stroke-1"
                      )}
                    >
                      {opt.label}
                      {showPrice ? (
                        <span className={clsx("ml-1 tabular-nums", active ? "text-white/85" : "text-text-muted")}>
                          · {inr(trialPrice)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          {(product.addons || []).length ? (
            <section>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Add-ons</div>
              <div className="flex flex-wrap gap-2">
                {product.addons!.map((addon) => {
                  const active = sel.addons.includes(addon.id);
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => toggleAddon(addon.id)}
                      className={clsx(
                        "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                        active ? "border-primary bg-primary-light text-primary" : "border-stroke-0 bg-bg-1 text-text-secondary"
                      )}
                    >
                      {addon.label}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Kitchen note</div>
              <div className="text-[10px] text-text-muted">⌘/Ctrl + Enter to add</div>
            </div>
            <textarea
              value={sel.note || ""}
              onChange={(e) => setSel((s) => ({ ...s, note: e.target.value }))}
              rows={2}
              placeholder="e.g. less spicy, no onion"
              className="w-full rounded-xl border border-stroke-0 bg-bg-1 px-3 py-2 text-[13px] text-text-primary outline-none focus:border-primary"
            />
          </section>

          {suggestions.length ? (
            <section>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Often ordered with this</div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => onAddSuggestion(s.selection)}
                    className="rounded-full border border-stroke-0 bg-bg-1 px-3 py-1.5 text-[12px] font-semibold text-text-secondary hover:border-primary hover:text-primary"
                  >
                    + {s.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-stroke-0 p-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-stroke-0 bg-bg-1 p-1">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg text-[16px] font-bold text-text-primary hover:bg-card-0"
                onClick={() => setSel((s) => ({ ...s, qty: Math.max(1, s.qty - 1) }))}
              >
                −
              </button>
              <span className="min-w-8 text-center text-[14px] font-bold tabular-nums">{sel.qty}</span>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg text-[16px] font-bold text-text-primary hover:bg-card-0"
                onClick={() => setSel((s) => ({ ...s, qty: s.qty + 1 }))}
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => onAdd(sel)}
              className="flex-1 rounded-xl bg-primary px-4 py-3 text-[14px] font-bold text-white shadow-[var(--shadow-neonCyan)] hover:bg-primary-hover"
            >
              Add · {inr(price * sel.qty)}
            </button>
          </div>
          <div className="text-center text-[10px] text-text-muted">Enter add · Esc close · +/− qty</div>
        </div>
      </div>
    </div>
  );
}
