import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { clsx } from "clsx";

const TONE = {
  neutral: {
    icon: "bg-bg-1 text-text-secondary ring-1 ring-stroke-0"
  },
  good: {
    icon: "bg-success-bg text-success ring-1 ring-success/20"
  },
  bad: {
    icon: "bg-danger-bg text-danger ring-1 ring-danger/20"
  }
} as const;

export function KpiCard(props: {
  title: string;
  value: string;
  icon?: ReactNode;
  hint?: string;
  tone?: "neutral" | "good" | "bad";
  trend?: string;
  className?: string;
}) {
  const tone = TONE[props.tone ?? "neutral"];
  return (
    <Card className={clsx("min-h-[104px]", props.className)} padding="sm" hover={false}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">{props.title}</div>
          <div className="mt-1.5 truncate text-[22px] font-bold tracking-tight text-text-primary tabular-nums">{props.value}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {props.trend ? (
              <span className="rounded-md bg-success-bg px-1.5 py-0.5 text-[10px] font-semibold text-success">{props.trend}</span>
            ) : null}
            {props.hint ? <div className="text-[11px] text-text-muted">{props.hint}</div> : null}
          </div>
        </div>
        {props.icon ? (
          <div className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tone.icon)}>{props.icon}</div>
        ) : null}
      </div>
    </Card>
  );
}
