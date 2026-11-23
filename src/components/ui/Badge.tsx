import { clsx } from "clsx";
import type { PropsWithChildren } from "react";

const tones = {
  teal: "bg-primary-light text-primary ring-stroke-0",
  cyan: "bg-primary-light text-primary ring-stroke-0",
  green: "bg-success-bg text-success ring-stroke-0",
  gold: "bg-warning-bg text-warning ring-stroke-0",
  orange: "bg-warning-bg text-primary ring-stroke-0",
  coral: "bg-danger-bg text-danger ring-stroke-0",
  purple: "bg-primary-light text-accent ring-stroke-0",
  rose: "bg-danger-bg text-danger ring-stroke-0",
  danger: "bg-danger-bg text-danger ring-stroke-0",
  slate: "bg-bg-1 text-text-secondary ring-stroke-0"
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
