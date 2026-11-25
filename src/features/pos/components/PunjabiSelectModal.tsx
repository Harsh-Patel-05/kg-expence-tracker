import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { inr, num } from "@/lib/utils";
import type { MenuGroup, MenuVariant } from "../domain/menuGrouping";

export type PunjabiPrep = "regular" | "swaminarayan";

export type PunjabiSelection = {
  variant: MenuVariant;
  prep: PunjabiPrep;
  qty: number;
};

const PREPS: Array<{ id: PunjabiPrep; label: string }> = [
  { id: "regular", label: "Regular" },
  { id: "swaminarayan", label: "Swaminarayan" }
];

type Props = {
  group: MenuGroup;
  onClose: () => void;
  onAdd: (selection: PunjabiSelection) => void;
};

export function PunjabiSelectModal({ group, onClose, onAdd }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const defaultVariant = group.variants[0];
  const [variantId, setVariantId] = useState(String(defaultVariant?.id || ""));
  const [prep, setPrep] = useState<PunjabiPrep>("regular");
  const [qty, setQty] = useState(1);

  const variant = useMemo(
    () => group.variants.find((v) => String(v.id) === variantId) || group.variants[0],
    [group.variants, variantId]
  );

  const unit = num(variant?.price);
  const total = unit * qty;

  function confirmAdd() {
    if (!variant) return;
    onAdd({ variant, prep, qty });
  }

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        Boolean(target?.isContentEditable);

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey && !typing) {
        e.preventDefault();
        e.stopPropagation();
        confirmAdd();
        return;
      }

      if (typing) return;

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setQty((q) => Math.min(99, q + 1));
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setQty((q) => Math.max(1, q - 1));
        return;
      }

      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const idx = Math.max(
          0,
          group.variants.findIndex((v) => String(v.id) === String(variant?.id))
        );
        const next =
          e.key === "ArrowRight"
            ? (idx + 1) % group.variants.length
            : (idx - 1 + group.variants.length) % group.variants.length;
        setVariantId(String(group.variants[next]?.id || ""));
        return;
      }

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const idx = PREPS.findIndex((p) => p.id === prep);
        const next =
          e.key === "ArrowDown"
            ? (idx + 1) % PREPS.length
            : (idx - 1 + PREPS.length) % PREPS.length;
        setPrep(PREPS[next].id);
        return;
      }

      const digit = e.key.match(/^[1-9]$/);
      if (digit) {
        const i = Number(digit[0]) - 1;
        if (group.variants[i]) {
          e.preventDefault();
          setVariantId(String(group.variants[i].id));
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
        <div className="relative h-24 shrink-0 bg-gradient-to-br from-[#C97B2E] to-[#7A3E12]">
          {group.imageUrl ? (
            <img src={group.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
          <div className="absolute bottom-3 left-4 right-12">
            <div className="text-[18px] font-bold text-white drop-shadow">{group.baseName}</div>
            {group.nameHi ? <div className="text-[12px] font-medium text-white/85">{group.nameHi}</div> : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Quantity / size</div>
              <div className="text-[10px] text-text-muted">← → or 1–{Math.min(9, group.variants.length)}</div>
            </div>
            <div className={clsx("grid gap-2", group.variants.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
              {group.variants.map((v, i) => {
                const active = String(v.id) === String(variant?.id);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(String(v.id))}
                    className={clsx(
                      "rounded-xl border px-2 py-2 text-left transition",
                      active ? "border-primary bg-primary-light ring-2 ring-primary/30" : "border-stroke-0 bg-bg-1 hover:border-stroke-1"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="text-[12px] font-semibold text-text-primary">{v.sizeLabel}</div>
                      {i < 9 ? <span className="text-[10px] font-bold text-text-muted">{i + 1}</span> : null}
                    </div>
                    <div className="text-[11px] font-bold tabular-nums text-primary">{inr(v.price)}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Preparation</div>
              <div className="text-[10px] text-text-muted">↑ ↓</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {PREPS.map((opt) => {
                const active = prep === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPrep(opt.id)}
                    className={clsx(
                      "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                      active ? "border-primary bg-primary text-white" : "border-stroke-0 bg-bg-1 text-text-secondary hover:border-stroke-1"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-stroke-0 p-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-stroke-0 bg-bg-1 p-1">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg text-[16px] font-bold text-text-primary hover:bg-card-0"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span className="min-w-8 text-center text-[14px] font-bold tabular-nums">{qty}</span>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg text-[16px] font-bold text-text-primary hover:bg-card-0"
                onClick={() => setQty((q) => Math.min(99, q + 1))}
              >
                +
              </button>
            </div>
            <button
              type="button"
              disabled={!variant}
              onClick={confirmAdd}
              className="flex-1 rounded-xl bg-primary px-4 py-3 text-[14px] font-bold text-white shadow-[var(--shadow-neonCyan)] hover:bg-primary-hover disabled:opacity-50"
            >
              Add · {inr(total)}
            </button>
          </div>
          <div className="text-center text-[10px] text-text-muted">Enter add · Esc close · +/− qty</div>
        </div>
      </div>
    </div>
  );
}
