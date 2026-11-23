import { useState } from "react";
import { clsx } from "clsx";
import { Minus, Plus, ShoppingCart, StickyNote, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";
import type { CartLine } from "../types";
import { EmptyState } from "@/components/ui/PageHeader";

export function CartLines(props: {
  lines: CartLine[];
  onBump: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
  onEditNote: (lineId: string, note: string) => void;
  className?: string;
}) {
  const [openNote, setOpenNote] = useState<string | null>(null);

  if (!props.lines.length) {
    return (
      <EmptyState
        className={clsx("py-8", props.className)}
        icon={<ShoppingCart size={18} />}
        title="Cart is empty"
        description="Tap a product to start billing."
      />
    );
  }

  return (
    <div className={clsx("space-y-1.5", props.className)}>
      {props.lines.map((line) => {
        const noteOpen = openNote === line.lineId || Boolean(line.note);
        return (
          <div key={line.lineId} className="rounded-lg border border-stroke-0 bg-bg-1/60 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold leading-tight text-text-primary">
                  {line.name}
                  {line.complimentary ? (
                    <span className="ml-1 rounded bg-primary-light px-1 py-0.5 text-[9px] font-bold text-primary">COMP</span>
                  ) : null}
                </div>
                <div className="text-[10px] text-text-muted">{inr(line.price)} × {line.qty}</div>
              </div>

              <div className="inline-flex shrink-0 items-center rounded-md border border-stroke-0 bg-card-0">
                <button
                  type="button"
                  className="grid h-7 w-7 place-items-center hover:bg-bg-1"
                  aria-label="Decrease"
                  onClick={() => props.onBump(line.lineId, -1)}
                >
                  <Minus size={12} />
                </button>
                <span className="min-w-6 text-center text-[12px] font-bold tabular-nums">{line.qty}</span>
                <button
                  type="button"
                  className="grid h-7 w-7 place-items-center hover:bg-bg-1"
                  aria-label="Increase"
                  onClick={() => props.onBump(line.lineId, 1)}
                >
                  <Plus size={12} />
                </button>
              </div>

              <div className="w-16 shrink-0 text-right text-[12px] font-bold tabular-nums">
                {line.complimentary ? inr(0) : inr(line.price * line.qty)}
              </div>

              <button
                type="button"
                className={clsx(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-bg-1",
                  line.note ? "text-primary" : "text-text-muted"
                )}
                title="Note"
                aria-label="Item note"
                onClick={() => setOpenNote((id) => (id === line.lineId ? null : line.lineId))}
              >
                <StickyNote size={13} />
              </button>

              <button
                type="button"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-danger hover:bg-danger-bg"
                aria-label={`Remove ${line.name}`}
                onClick={() => props.onRemove(line.lineId)}
              >
                <Trash2 size={13} />
              </button>
            </div>

            {noteOpen ? (
              <input
                className="kg-input mt-1.5 !py-1 text-[11px]"
                placeholder="Kitchen / item note"
                value={line.note || ""}
                autoFocus={openNote === line.lineId && !line.note}
                onChange={(e) => props.onEditNote(line.lineId, e.target.value)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
