import { clsx } from "clsx";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Variant = "primary" | "secondary" | "danger" | "warning" | "success" | "ghost" | "icon";

const variants: Record<Variant, string> = {
  primary: "kg-btn kg-btn-primary",
  secondary: "kg-btn kg-btn-secondary",
  danger: "kg-btn bg-danger-bg text-danger border border-stroke-0 hover:brightness-95",
  warning: "kg-btn bg-warning-bg text-warning border border-stroke-0",
  success: "kg-btn bg-success-bg text-success border border-stroke-0",
  ghost: "kg-btn kg-btn-ghost",
  icon: "h-9 w-9 rounded-[var(--rp-radius-btn)] border border-stroke-0 bg-card-0 text-text-muted hover:bg-bg-1 grid place-items-center p-0"
};

export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>) {
  return (
    <button className={clsx(variants[variant], "disabled:opacity-50 disabled:pointer-events-none", className)} {...rest}>
      {children}
    </button>
  );
}