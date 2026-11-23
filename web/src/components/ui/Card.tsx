import { clsx } from "clsx";
import type { PropsWithChildren } from "react";

export function Card(
  props: PropsWithChildren<{
    className?: string;
    hover?: boolean;
    padding?: "sm" | "md" | "lg";
    gradientTop?: "teal" | "cyan" | "green" | "gold" | "orange" | "purple" | "rose" | "none";
  }>
) {
  const pad = props.padding === "sm" ? "p-4" : props.padding === "lg" ? "p-6" : "p-5";
  const isFlexCol = typeof props.className === "string" && props.className.includes("flex-col");
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 text-text-primary shadow-panel",
        props.hover !== false && "transition hover:border-stroke-1 hover:shadow-float",
        pad,
        props.className
      )}
    >
      {props.gradientTop && props.gradientTop !== "none" ? (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-accent" />
      ) : null}
      <div className={clsx("relative", isFlexCol && "flex min-h-0 flex-1 flex-col")}>{props.children}</div>
    </div>
  );
}
