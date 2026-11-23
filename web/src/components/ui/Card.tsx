import { clsx } from "clsx";
import type { PropsWithChildren } from "react";

export function Card(
  props: PropsWithChildren<{
    className?: string;
    hover?: boolean;
    gradientTop?: "teal" | "cyan" | "green" | "gold" | "orange" | "purple" | "rose" | "none";
  }>
) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-[20px] border border-[#E9EDF5] bg-white p-6 text-[#111827] shadow-[0_8px_30px_rgba(0,0,0,0.05)] transition duration-300",
        props.hover !== false && "hover:-translate-y-1.5 hover:shadow-[0_16px_40px_rgba(109,94,247,0.1)]",
        props.className
      )}
    >
      {props.gradientTop && props.gradientTop !== "none" ? (
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#6D5EF7] to-[#8B7CFF]" />
      ) : null}
      <div className="relative">{props.children}</div>
    </div>
  );
}
