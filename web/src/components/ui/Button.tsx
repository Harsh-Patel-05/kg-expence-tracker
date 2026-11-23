import { clsx } from "clsx";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Variant = "primary" | "secondary" | "danger" | "warning" | "success" | "ghost" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-[#6D5EF7] text-white shadow-[0_8px_20px_rgba(109,94,247,0.28)] hover:bg-[#7B6EF6] hover:-translate-y-0.5",
  secondary: "bg-white text-[#111827] border border-[#E9EDF5] hover:bg-[#F5F7FB]",
  danger: "bg-[#FEF2F2] text-[#EF4444] border border-[#FECACA] hover:bg-[#FEE2E2]",
  warning: "bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]",
  success: "bg-[#ECFDF5] text-[#15803D] border border-[#A7F3D0]",
  ghost: "bg-transparent text-[#6B7280] hover:bg-[#F5F7FB]",
  icon: "h-10 w-10 rounded-xl border border-[#E9EDF5] bg-white text-[#6B7280] hover:bg-[#F5F7FB] grid place-items-center p-0"
};

export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-semibold disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
