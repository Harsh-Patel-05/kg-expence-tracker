import { clsx } from "clsx";
import type { PropsWithChildren } from "react";

export function Card(props: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-stroke-0 bg-card-0 p-4 shadow-panel backdrop-blur",
        "relative overflow-hidden",
        props.className
      )}
    >
      {/* subtle neon rim */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl [background:linear-gradient(135deg,rgba(34,211,238,0.16),transparent_35%,rgba(96,165,250,0.10))] opacity-70" />
      <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/5" />
      <div className="relative">{props.children}</div>
    </div>
  );
}

