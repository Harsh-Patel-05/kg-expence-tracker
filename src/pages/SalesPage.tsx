import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Fragment, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldLabel, Input } from "@/components/ui/Input";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { auth, db } from "@/lib/firebase";
import { addDaysISO, inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { SaleDoc } from "@/lib/firestoreTypes";
import { countsAsRevenueSale, isManualPlatformSaleEntry, saleAmounts } from "@/lib/balanceMath";
import { softDeleteSale, softDeleteSalesOnDate } from "@/lib/softDelete";
import { downloadSalesPdf } from "@/lib/salesPdf";
import { ContentLoading, LoadingLabel } from "@/components/ui/Loading";
import { Inbox } from "lucide-react";

type DayRange = "10d" | "7d" | "14d" | "30d" | "week";

type DayRow = {
  date: string;
  cash: number;
  online: number;
  swiggy: number;
  zomato: number;
  shopTotal: number;
  platformTotal: number;
  grand: number;
  entryIds: string[];
};

function splitSale(s: SaleDoc | Record<string, unknown>) {
  const a = saleAmounts(s);
  return {
    cash: a.cash,
    online: Math.max(0, a.retail - a.cash),
    swiggy: a.swiggy,
    zomato: a.zomato,
    shopTotal: a.retail,
    platformTotal: a.swiggy + a.zomato,
    grand: a.retail + a.swiggy + a.zomato
  };
}

export function SalesPage() {
  const [date, setDate] = useState(isoDate());
  const [cash, setCash] = useState("");
  const [online, setOnline] = useState("");
  const [swiggy, setSwiggy] = useState("");
  const [zomato, setZomato] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [range, setRange] = useState<DayRange>("10d");
  const today = isoDate();
  const [pdfFrom, setPdfFrom] = useState(today);
  const [pdfTo, setPdfTo] = useState(today);
  const [pdfMsg, setPdfMsg] = useState<string | null>(null);

  const sales = useRestaurantCollection<SaleDoc>({ path: "sales", orderByField: "date", orderDir: "desc" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const monthKey = today.slice(0, 7);

  const monthTotals = useMemo(() => {
    let shop = 0;
    let cashT = 0;
    let onlineT = 0;
    let swiggyT = 0;
    let zomatoT = 0;
    for (const s of sales.data) {
      if (String(s.date || "").slice(0, 7) !== monthKey) continue;
      if (!countsAsRevenueSale(s)) continue;
      const a = splitSale(s);
      shop += a.shopTotal;
      cashT += a.cash;
      onlineT += a.online;
      if (isManualPlatformSaleEntry(s)) {
        swiggyT += a.swiggy;
        zomatoT += a.zomato;
      }
    }
    return { shop, cashT, onlineT, swiggyT, zomatoT, platform: swiggyT + zomatoT };
  }, [sales.data, monthKey]);

  const dayRows = useMemo(() => {
    const daysBack =
      range === "7d" || range === "week" ? 7 : range === "14d" ? 14 : range === "30d" ? 30 : 10;
    const from = addDaysISO(today, -(daysBack - 1));
    const map = new Map<string, DayRow>();
    for (let i = 0; i < daysBack; i++) {
      const d = addDaysISO(today, -i);
      map.set(d, {
        date: d,
        cash: 0,
        online: 0,
        swiggy: 0,
        zomato: 0,
        shopTotal: 0,
        platformTotal: 0,
        grand: 0,
        entryIds: []
      });
    }
    for (const s of sales.data) {
      const d = String(s.date || "").slice(0, 10);
      if (!d || d < from || d > today) continue;
      if (!countsAsRevenueSale(s)) continue;
      const cur = map.get(d);
      if (!cur) continue;
      const a = splitSale(s);
      cur.cash += a.cash;
      cur.online += a.online;
      if (isManualPlatformSaleEntry(s)) {
        cur.swiggy += a.swiggy;
        cur.zomato += a.zomato;
        cur.platformTotal += a.platformTotal;
      }
      cur.shopTotal += a.shopTotal;
      cur.grand = cur.shopTotal + cur.platformTotal;
      cur.entryIds.push(s.id);
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [sales.data, range, today]);

  const dayEntries = useMemo(() => {
    if (!expandedDay) return [];
    return sales.data
      .filter((s) => countsAsRevenueSale(s) && String(s.date || "").slice(0, 10) === expandedDay)
      .sort((a, b) => String(b.id).localeCompare(String(a.id)));
  }, [sales.data, expandedDay]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const cashAmount = num(cash);
      const otherOnlineAmount = num(online);
      const swiggyAmount = num(swiggy);
      const zomatoAmount = num(zomato);
      const onlineAmount = otherOnlineAmount + swiggyAmount + zomatoAmount;
      const day = String(date || isoDate()).slice(0, 10);
      if (!(cashAmount > 0 || otherOnlineAmount > 0 || swiggyAmount > 0 || zomatoAmount > 0)) {
        setMsg("Enter at least one amount");
        setSaving(false);
        return;
      }
      await addDoc(collection(db, "sales"), {
        userId: auth.currentUser?.uid ?? "owner",
        date: day,
        cashAmount,
        onlineAmount,
        otherOnlineAmount,
        swiggyAmount,
        zomatoAmount,
        totalAmount: cashAmount + onlineAmount,
        countsAsRevenue: true,
        status: "settled",
        source: "manual_sales",
        createdAt: serverTimestamp()
      });
      setCash("");
      setOnline("");
      setSwiggy("");
      setZomato("");
      setDate(day);
      setExpandedDay(day);
      setMsg("Saved!");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function removeSale(id: string) {
    if (!window.confirm("Delete this sales entry? Cash / Online balance will reverse.")) return;
    setDeletingId(id);
    setMsg(null);
    try {
      await softDeleteSale(id);
      setMsg("Sales entry deleted — balance updated.");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function clearDay(day: string) {
    if (
      !window.confirm(
        `Delete ALL sales on ${day}? Cash / Online / shop totals for that day will reverse.`
      )
    ) {
      return;
    }
    setDeletingId(`day:${day}`);
    setMsg(null);
    try {
      const n = await softDeleteSalesOnDate(day, `Cleared day ${day}`);
      setMsg(n ? `Removed ${n} sales on ${day} — balances updated.` : `No active sales on ${day}.`);
      setExpandedDay(null);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Clear day failed");
    } finally {
      setDeletingId(null);
    }
  }

  function runSalesPdf(kind: "simple" | "full") {
    let from = pdfFrom.slice(0, 10);
    let to = pdfTo.slice(0, 10);
    if (to < from) to = from;
    try {
      const err = downloadSalesPdf(kind, sales.data as Record<string, unknown>[], from, to);
      setPdfMsg(err || (kind === "full" ? "Full sales report ready — Save as PDF" : "Sales PDF ready — Save as PDF"));
    } catch (e: unknown) {
      setPdfMsg(e instanceof Error ? e.message : "Print failed");
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Operations"
        title="Sales"
        description="Day-wise Cash / Online / Swiggy / Zomato. Shop total excludes Swiggy & Zomato."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="This month · shop sales" value={inr(monthTotals.shop)} tone="good" hint="Cash + UPI only" />
        <KpiCard title="This month · cash" value={inr(monthTotals.cashT)} />
        <KpiCard title="This month · online" value={inr(monthTotals.onlineT)} />
        <KpiCard
          title="This month · Swiggy + Zomato"
          value={inr(monthTotals.platform)}
          hint="Not in shop total"
        />
      </div>

      <Card hover={false}>
        <SectionTitle title="Add sales (end of day)" description="Optional manual entry for a date." />
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <div>
            <FieldLabel htmlFor="sales-date">Date</FieldLabel>
            <Input id="sales-date" value={date} onChange={(e) => setDate(e.target.value)} type="date" />
          </div>
          <div>
            <FieldLabel htmlFor="sales-cash">Cash (₹)</FieldLabel>
            <Input id="sales-cash" value={cash} onChange={(e) => setCash(e.target.value)} inputMode="decimal" placeholder="e.g. 12000" />
          </div>
          <div>
            <FieldLabel htmlFor="sales-online">Online / UPI (₹)</FieldLabel>
            <Input id="sales-online" value={online} onChange={(e) => setOnline(e.target.value)} inputMode="decimal" placeholder="e.g. 6800" />
          </div>
          <div>
            <FieldLabel htmlFor="sales-swiggy">Swiggy (₹)</FieldLabel>
            <Input id="sales-swiggy" value={swiggy} onChange={(e) => setSwiggy(e.target.value)} inputMode="decimal" placeholder="e.g. 4500" />
          </div>
          <div>
            <FieldLabel htmlFor="sales-zomato">Zomato (₹)</FieldLabel>
            <Input id="sales-zomato" value={zomato} onChange={(e) => setZomato(e.target.value)} inputMode="decimal" placeholder="e.g. 3200" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled={saving || sales.loading} onClick={() => void save()}>
            {saving ? <LoadingLabel>Saving…</LoadingLabel> : "Save Sales"}
          </Button>
          {msg ? (
            <div className={`text-sm ${msg === "Saved!" ? "text-success" : "text-danger"}`} role="status">
              {msg}
            </div>
          ) : null}
        </div>
      </Card>

      <Card hover={false}>
        <SectionTitle title="Sales PDF export" description="Revenue sales only (excludes customer advances)." />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <FieldLabel htmlFor="salesPdfFrom">From date</FieldLabel>
            <Input
              id="salesPdfFrom"
              type="date"
              value={pdfFrom}
              max={pdfTo}
              onChange={(e) => {
                setPdfFrom(e.target.value);
                if (pdfTo < e.target.value) setPdfTo(e.target.value);
              }}
            />
          </div>
          <div>
            <FieldLabel htmlFor="salesPdfTo">To date</FieldLabel>
            <Input
              id="salesPdfTo"
              type="date"
              value={pdfTo}
              min={pdfFrom}
              onChange={(e) => {
                setPdfTo(e.target.value);
                if (e.target.value < pdfFrom) setPdfFrom(e.target.value);
              }}
            />
          </div>
          <button type="button" className="kg-btn kg-btn-secondary" onClick={() => runSalesPdf("simple")}>
            PDF · time / amount / mode
          </button>
          <button type="button" className="kg-btn kg-btn-primary" onClick={() => runSalesPdf("full")}>
            PDF · full day report
          </button>
        </div>
        {pdfMsg ? <div className="mt-2 text-sm text-text-secondary">{pdfMsg}</div> : null}
      </Card>

      {sales.error ? (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          Could not load sales: {sales.error}
        </div>
      ) : null}

      <Card hover={false}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle
            title="Daily sales totals"
            description={`One row per day · shop month ${inr(monthTotals.shop)}. Open a day to delete a mistaken entry.`}
          />
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "10d" as const, label: "10 days" },
                { id: "7d" as const, label: "7 days" },
                { id: "week" as const, label: "This week" },
                { id: "14d" as const, label: "2 weeks" },
                { id: "30d" as const, label: "30 days" }
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                className={`kg-btn !py-1.5 !text-[12px] ${range === r.id ? "kg-btn-primary" : "kg-btn-secondary"}`}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {sales.loading ? (
          <ContentLoading variant="table" label="Loading sales" />
        ) : dayRows.some((d) => d.shopTotal > 0 || d.platformTotal > 0 || d.date === today) ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Cash</th>
                  <th className="px-3 py-2">Online</th>
                  <th className="px-3 py-2">Swiggy*</th>
                  <th className="px-3 py-2">Zomato*</th>
                  <th className="px-3 py-2">Shop total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {dayRows
                  .filter((d) => d.shopTotal > 0 || d.platformTotal > 0 || d.date === today)
                  .map((d) => (
                    <Fragment key={d.date}>
                      <tr className="border-t border-stroke-0">
                        <td className="px-3 py-2 font-semibold">
                          {d.date}
                          {d.date === today ? (
                            <span className="ml-1 text-[10px] font-bold text-primary">TODAY</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{inr(d.cash)}</td>
                        <td className="px-3 py-2">{inr(d.online)}</td>
                        <td className="px-3 py-2">{inr(d.swiggy)}</td>
                        <td className="px-3 py-2">{inr(d.zomato)}</td>
                        <td className="px-3 py-2 font-bold text-success">{inr(d.shopTotal)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-xs font-semibold text-primary"
                            onClick={() => setExpandedDay((cur) => (cur === d.date ? null : d.date))}
                          >
                            {expandedDay === d.date ? "Hide" : `Details (${d.entryIds.length})`}
                          </button>
                        </td>
                      </tr>
                      {expandedDay === d.date ? (
                        <tr className="border-t border-stroke-0 bg-bg-1/60">
                          <td colSpan={7} className="px-3 py-2">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                                Entries for {d.date} — delete reverses Cash / Online
                              </div>
                              <button
                                type="button"
                                className="text-xs font-semibold text-danger disabled:opacity-50"
                                disabled={deletingId === `day:${d.date}`}
                                onClick={() => void clearDay(d.date)}
                              >
                                {deletingId === `day:${d.date}` ? "…" : "Clear whole day"}
                              </button>
                            </div>
                            <div className="grid gap-1.5">
                              {dayEntries.map((s) => {
                                const a = splitSale(s);
                                return (
                                  <div
                                    key={s.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke-0 bg-card-0 px-2.5 py-1.5 text-[12px]"
                                  >
                                    <span>
                                      Cash {inr(a.cash)} · Online {inr(a.online)}
                                      {isManualPlatformSaleEntry(s)
                                        ? ` · Swiggy ${inr(a.swiggy)} · Zomato ${inr(a.zomato)}`
                                        : ""}
                                      <span className="ml-2 text-text-muted">
                                        {(s as any).source === "manual_sales" ? "manual" : "POS"}
                                      </span>
                                    </span>
                                    <button
                                      type="button"
                                      className="text-xs font-semibold text-danger disabled:opacity-50"
                                      disabled={deletingId === s.id}
                                      onClick={() => void removeSale(s.id)}
                                    >
                                      {deletingId === s.id ? "…" : "Delete"}
                                    </button>
                                  </div>
                                );
                              })}
                              {!dayEntries.length ? (
                                <div className="text-[12px] text-text-muted">No entries.</div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
              </tbody>
            </table>
            <p className="mt-2 px-1 text-[11px] text-text-muted">
              Shop total = Cash + Online only. *Swiggy / Zomato show only weekly Sales-page entries (not POS).
            </p>
          </div>
        ) : (
          <EmptyState
            icon={<Inbox size={18} />}
            title="No sales in this range"
            description="POS bills and end-of-day entries roll up here by day."
          />
        )}
      </Card>
    </div>
  );
}
