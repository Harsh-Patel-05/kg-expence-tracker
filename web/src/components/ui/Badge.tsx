import { clsx } from "clsx";
import type { PropsWithChildren } from "react";

const tones = {
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  gold: "bg-amber-50 text-amber-800 ring-amber-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  coral: "bg-orange-50 text-orange-800 ring-orange-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200"
} as const;

export function Badge({
  children,
  tone = "teal",
  className
}: PropsWithChildren<{ tone?: keyof typeof tones; className?: string }>) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ring-1 shadow-sm",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
