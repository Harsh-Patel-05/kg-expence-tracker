import { clsx } from "clsx";
import { Minus, Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";
import type { CartLine } from "../types";

export function CartLines(props: {
  lines: CartLine[];
  onBump: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
  onEditNote: (lineId: string, note: string) => void;
}) {
  if (!props.lines.length) {
    return <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Cart is empty — search or tap a product.</div>;
  }
  return (
    <div className="space-y-2">
      {props.lines.map((line) => (
        <div key={line.lineId} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">
                {line.name}
                {line.complimentary ? <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">COMP</span> : null}
              </div>
              <div className="text-xs text-slate-500">{inr(line.price)} each</div>
            </div>
            <button type="button" className="rounded-lg p-1 text-rose-500 hover:bg-rose-50" onClick={() => props.onRemove(line.lineId)}>
              <Trash2 size={16} />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 p-0.5">
              <button type="button" className="rounded-full p-1 hover:bg-slate-100" onClick={() => props.onBump(line.lineId, -1)}>
                <Minus size={14} />
              </button>
              <span className={clsx("min-w-8 text-center text-sm font-bold")}>{line.qty}</span>
              <button type="button" className="rounded-full p-1 hover:bg-slate-100" onClick={() => props.onBump(line.lineId, 1)}>
                <Plus size={14} />
              </button>
            </div>
            <div className="text-sm font-bold">{line.complimentary ? inr(0) : inr(line.price * line.qty)}</div>
          </div>
          <input
            className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-cyan-400"
            placeholder="Item / kitchen note"
            value={line.note || ""}
            onChange={(e) => props.onEditNote(line.lineId, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
