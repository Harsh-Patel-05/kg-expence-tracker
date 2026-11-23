import type { ReactNode } from "react";
import { clsx } from "clsx";
import { Card } from "@/components/ui/Card";

/**
 * Standard page top — matches Dashboard overview card exactly.
 * Every feature page should use this so UI stays identical.
 */
export function PageHeader(props: {
  /** Optional breadcrumb / back link rendered above the eyebrow. */
  back?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** When false, render without the Card shell (rare). Default true. */
  card?: boolean;
}) {
  const body = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        {props.back ? <div className="mb-1 text-[12px] font-semibold text-primary">{props.back}</div> : null}
        {props.eyebrow ? (
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">{props.eyebrow}</div>
        ) : null}
        <h2 className="mt-0.5 truncate text-[20px] font-bold tracking-tight text-text-primary md:text-[22px]">{props.title}</h2>
        {props.description ? <div className="mt-1 max-w-2xl text-[13px] text-text-muted">{props.description}</div> : null}
      </div>
      {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
    </div>
  );

  if (props.card === false) {
    return <div className={clsx("mb-4", props.className)}>{body}</div>;
  }

  return (
    <Card hover={false} className={clsx("!p-4 md:!p-5", props.className)}>
      {body}
    </Card>
  );
}

export function EmptyState(props: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-stroke-1 bg-bg-1/50 px-4 py-12 text-center",
        props.className
      )}
    >
      {props.icon ? (
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary-light text-primary">{props.icon}</div>
      ) : null}
      <div className="text-[14px] font-semibold text-text-primary">{props.title}</div>
      {props.description ? <div className="mt-1 max-w-sm text-[12px] text-text-muted">{props.description}</div> : null}
      {props.action ? <div className="mt-4">{props.action}</div> : null}
    </div>
  );
}

/** Shared section title inside content cards — same as Dashboard chart headers */
export function SectionTitle(props: { title: string; description?: string; right?: ReactNode; className?: string }) {
  return (
    <div className={clsx("mb-3 flex items-center justify-between gap-2", props.className)}>
      <div className="min-w-0">
        <div className="text-[14px] font-bold text-text-primary">{props.title}</div>
        {props.description ? <div className="text-[12px] text-text-muted">{props.description}</div> : null}
      </div>
      {props.right}
    </div>
  );
}
