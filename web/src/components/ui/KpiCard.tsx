import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { clsx } from "clsx";

export function KpiCard(props: {
  title: string;
  value: string;
  icon?: ReactNode;
  hint?: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const tone = props.tone ?? "neutral";
  return (
    <Card className="relative overflow-hidden">
      <div
        className={clsx(
          "pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full blur-2xl",
          tone === "good" && "bg-emerald-400/20",
          tone === "bad" && "bg-rose-400/20",
          tone === "neutral" && "bg-accent-cyan/15"
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-white/60">{props.title}</div>
          <div className="mt-1 truncate text-xl font-semibold">{props.value}</div>
          {props.hint ? <div className="mt-1 text-xs text-white/55">{props.hint}</div> : null}
        </div>
        {props.icon ? (
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-stroke-1 bg-white/5 shadow-neonCyan">
            {props.icon}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

