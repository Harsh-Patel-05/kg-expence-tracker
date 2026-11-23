import type { ReactNode } from "react";
import { clsx } from "clsx";

export function Spinner(props: { size?: "sm" | "md" | "lg"; className?: string }) {
  const dim = props.size === "sm" ? "h-4 w-4 border-2" : props.size === "lg" ? "h-9 w-9 border-[3px]" : "h-6 w-6 border-2";
  return (
    <span
      className={clsx(
        "inline-block animate-spin rounded-full border-primary/25 border-t-primary",
        dim,
        props.className
      )}
      aria-hidden
    />
  );
}

/** Shimmer block — use for cards, tables, KPI slots */
export function Skeleton(props: { className?: string }) {
  return <div className={clsx("kg-shimmer rounded-[var(--radius-xl)]", props.className)} aria-hidden />;
}

/** Centered spinner for module / page gate */
export function PageLoading(props: { label?: string; className?: string }) {
  const label = props.label ?? "Loading…";
  return (
    <div
      className={clsx("grid min-h-[42vh] place-items-center px-4", props.className)}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <Spinner size="lg" />
    </div>
  );
}

/** Full-screen auth / boot loading — spinner only */
export function FullPageLoading(props: { label?: string }) {
  const label = props.label ?? "Loading…";
  return (
    <div
      className="grid min-h-dvh place-items-center bg-bg-0"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <Spinner size="lg" />
    </div>
  );
}

/** Inline content placeholder while Firestore / data loads */
export function ContentLoading(props: {
  /** Visual density */
  variant?: "block" | "cards" | "table" | "dashboard";
  label?: string;
  className?: string;
}) {
  const label = props.label ?? "Loading content";
  const variant = props.variant ?? "block";

  let body: ReactNode;
  if (variant === "dashboard") {
    body = (
      <>
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </>
    );
  } else if (variant === "cards") {
    body = (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    );
  } else if (variant === "table") {
    body = (
      <>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </>
    );
  } else {
    body = <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className={clsx("space-y-3", props.className)} role="status" aria-busy="true" aria-label={label}>
      {body}
    </div>
  );
}

/** Compact row for buttons / toolbars while saving */
export function LoadingLabel(props: { children?: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", props.className)}>
      <Spinner size="sm" />
      <span>{props.children ?? "Please wait…"}</span>
    </span>
  );
}
