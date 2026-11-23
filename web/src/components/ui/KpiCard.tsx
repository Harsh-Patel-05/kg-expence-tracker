import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { clsx } from "clsx";

const TONE = {
  neutral: {
    icon: "bg-[#F3F0FF] text-[#6D5EF7]",
    ring: "stroke-[#6D5EF7]"
  },
  good: {
    icon: "bg-[#ECFDF5] text-[#16A34A]",
    ring: "stroke-[#22C55E]"
  },
  bad: {
    icon: "bg-[#FEF2F2] text-[#EF4444]",
    ring: "stroke-[#EF4444]"
  }
} as const;

export function KpiCard(props: {
  title: string;
  value: string;
  icon?: ReactNode;
  hint?: string;
  tone?: "neutral" | "good" | "bad";
  trend?: string;
}) {
  const tone = TONE[props.tone ?? "neutral"];
  return (
    <Card className="min-h-[120px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">{props.title}</div>
          <div className="mt-2 truncate text-[28px] font-bold tracking-tight text-[#111827]">{props.value}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {props.trend ? (
              <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#15803D]">{props.trend}</span>
            ) : null}
            {props.hint ? <div className="text-[13px] text-[#6B7280]">{props.hint}</div> : null}
          </div>
        </div>
        {props.icon ? <div className={clsx("grid h-10 w-10 place-items-center rounded-xl", tone.icon)}>{props.icon}</div> : null}
      </div>
    </Card>
  );
}
