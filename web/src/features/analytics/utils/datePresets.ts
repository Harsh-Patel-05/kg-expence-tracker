import { isoDate } from "@/lib/utils";
import type { DatePreset } from "../types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function resolveDatePreset(preset: DatePreset, custom?: { from: string; to: string }) {
  const today = new Date();
  const end = ymd(today);
  if (preset === "custom" && custom?.from && custom?.to) return { from: custom.from, to: custom.to, label: "Custom" };

  if (preset === "today") return { from: end, to: end, label: "Today" };
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const s = ymd(y);
    return { from: s, to: s, label: "Yesterday" };
  }
  if (preset === "last7") {
    const s = new Date(today);
    s.setDate(s.getDate() - 6);
    return { from: ymd(s), to: end, label: "Last 7 days" };
  }
  if (preset === "last30") {
    const s = new Date(today);
    s.setDate(s.getDate() - 29);
    return { from: ymd(s), to: end, label: "Last 30 days" };
  }
  if (preset === "thisMonth") {
    return { from: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`, to: end, label: "This month" };
  }
  if (preset === "lastMonth") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: ymd(first), to: ymd(last), label: "Last month" };
  }
  if (preset === "quarter") {
    const q = Math.floor(today.getMonth() / 3);
    const first = new Date(today.getFullYear(), q * 3, 1);
    return { from: ymd(first), to: end, label: "This quarter" };
  }
  if (preset === "year") {
    return { from: `${today.getFullYear()}-01-01`, to: end, label: "This year" };
  }
  return { from: end, to: end, label: "Today" };
}

/** Previous period of equal length for comparison */
export function previousPeriod(from: string, to: string) {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  const days = Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  const prevTo = new Date(a);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { from: ymd(prevFrom), to: ymd(prevTo) };
}

export function pctChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function sparklineFromDaily(daily: Array<{ date: string; value: number }>, maxPoints = 14) {
  const slice = daily.slice(-maxPoints);
  return slice.map((d) => d.value);
}

export { isoDate };
