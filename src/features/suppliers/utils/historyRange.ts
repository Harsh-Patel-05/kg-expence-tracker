import { isoDate } from "@/lib/utils";

export type SupplierHistoryRange = "week" | "month" | "year" | "all";

function localStart(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startOfSupplierHistoryRange(range: SupplierHistoryRange, today = isoDate()): string {
  const d = new Date(`${today}T00:00:00`);
  if (range === "week") {
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return localStart(d);
  }
  if (range === "month") {
    d.setDate(1);
    return localStart(d);
  }
  if (range === "year") {
    d.setMonth(0, 1);
    return localStart(d);
  }
  return "0000-01-01";
}

export function withinSupplierHistoryRange(dateISO: string, range: SupplierHistoryRange, today?: string): boolean {
  const start = startOfSupplierHistoryRange(range, today);
  const x = String(dateISO || "").slice(0, 10);
  if (!x) return false;
  return x >= start;
}