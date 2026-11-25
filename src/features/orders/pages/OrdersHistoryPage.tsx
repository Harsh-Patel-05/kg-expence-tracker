import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { useLiveOrders } from "../hooks/useLiveOrders";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { canAccessOrders } from "@/features/pos/utils/permissions";
import { WhatsAppShareModal } from "@/features/pos/components/WhatsAppShareModal";
import { liveOrderToWhatsAppBill } from "@/features/pos/utils/orderToWhatsAppBill";
import type { WhatsAppBillPayload } from "@/features/pos/utils/whatsappBill";
import { BRAND } from "@/lib/brand";
import { softDeleteOrderWithSales } from "@/lib/softDelete";
import { inr, isoDate, num } from "@/lib/utils";
import { ContentLoading, PageLoading } from "@/components/ui/Loading";

function orderDate(o: { date?: string; createdAt?: unknown; updatedAt?: unknown }) {
  const d = String(o.date || "").slice(0, 10);
  if (d) return d;
  const ca = o.createdAt as { toDate?: () => Date } | string | undefined;
  if (ca && typeof ca === "object" && typeof ca.toDate === "function") {
    return ca.toDate().toISOString().slice(0, 10);
  }
  if (typeof ca === "string" && ca.length >= 10) return ca.slice(0, 10);
  return "";
}

export function OrdersHistoryPage() {
  const { role, loading: authLoading } = usePosAuth();
  const { allOrders, loading } = useLiveOrders();
  const [waBill, setWaBill] = useState<WhatsAppBillPayload | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function removeOrder(o: { id: string; invoiceNo?: string; total?: number; orderType?: string }) {
    const platform = String(o.orderType || "").toLowerCase();
    const isAgg = platform.includes("swiggy") || platform.includes("zomato");
    const tip = isAgg
      ? `Delete ${o.invoiceNo || o.id}? Kitchen ticket will be removed (no shop sale).`
      : `Delete ${o.invoiceNo || o.id}? Linked sales will void and Cash / Online will reverse.`;
    if (!window.confirm(tip)) return;
    setDeletingId(o.id);
    setMsg(null);
    try {
      await softDeleteOrderWithSales(o.id);
      setMsg("Order deleted — balances updated.");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const today = isoDate();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const minA = minAmount === "" ? null : num(minAmount);
    const maxA = maxAmount === "" ? null : num(maxAmount);
    return [...allOrders]
      .filter((o) => {
        const d = orderDate(o);
        if (from && d && d < from) return false;
        if (to && d && d > to) return false;
        const amt = num(o.total ?? o.paidTotal);
        if (minA != null && amt < minA) return false;
        if (maxA != null && amt > maxA) return false;
        const t = String(o.orderType || "").toLowerCase();
        if (channel === "shop" && (t.includes("swiggy") || t.includes("zomato"))) return false;
        if (channel === "swiggy" && !t.includes("swiggy")) return false;
        if (channel === "zomato" && !t.includes("zomato")) return false;
        if (channel === "takeaway" && t !== "takeaway" && t !== "dine_in" && t !== "dine-in") return false;
        if (status !== "all" && String(o.status || "").toLowerCase() !== status) return false;
        return true;
      })
      .sort((a, b) => String(b.updatedAt || b.date || "").localeCompare(String(a.updatedAt || a.date || "")));
  }, [allOrders, from, to, minAmount, maxAmount, channel, status]);

  if (authLoading) return <PageLoading label="Loading orders…" />;
  if (!canAccessOrders(role)) {
    return <EmptyState title="Orders access denied" description={`Your role (${role}) cannot open orders.`} />;
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Orders"
        title="Order history"
        description="All bills with date and amount filters. Swiggy/Zomato are listed but do not count in shop total sales."
        actions={
          <Link to="/orders" className="kg-btn kg-btn-secondary">
            Back to orders
          </Link>
        }
      />

      <Card hover={false} padding="sm">
        <SectionTitle title="Filters" />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            From date
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            To date
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Min ₹
            <Input type="number" min={0} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="Any" />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Max ₹
            <Input type="number" min={0} value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="Any" />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Channel
            <select className="kg-input !w-auto" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="all">All</option>
              <option value="shop">Shop only (no Swiggy/Zomato)</option>
              <option value="takeaway">Takeaway / dine-in</option>
              <option value="swiggy">Swiggy</option>
              <option value="zomato">Zomato</option>
            </select>
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Status
            <select className="kg-input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="served">Served</option>
              <option value="cancelled">Cancelled</option>
              <option value="preparing">Preparing</option>
            </select>
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-text-muted">
            Showing {filtered.length} of {allOrders.length} orders
          </p>
          <button
            type="button"
            className="kg-btn kg-btn-secondary !py-1.5 !text-[12px]"
            onClick={() => {
              setFrom(monthStart);
              setTo(today);
              setMinAmount("");
              setMaxAmount("");
              setChannel("all");
              setStatus("all");
            }}
          >
            Reset
          </button>
        </div>
      </Card>

      {loading ? <ContentLoading variant="block" label="Loading" /> : null}
      {msg ? <div className="text-[13px] text-text-secondary">{msg}</div> : null}

      <Card hover={false} className="!p-0 overflow-hidden">
        {filtered.length ? (
          <div className="divide-y divide-stroke-0">
            {filtered.map((o) => {
              const t = String(o.orderType || "").toLowerCase();
              const platform = t.includes("swiggy") ? "Swiggy" : t.includes("zomato") ? "Zomato" : null;
              const gone = String(o.status || "").toLowerCase() === "cancelled" || (o as any).isDeleted;
              return (
                <div key={o.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <Link to={`/orders/${o.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-text-primary">
                      {o.invoiceNo || o.id.slice(0, 8)} · {o.customerName || o.tableName || "—"}
                      {platform ? (
                        <span className="ml-1 rounded bg-bg-1 px-1.5 py-0.5 text-[10px] font-bold text-text-muted">{platform}</span>
                      ) : null}
                    </div>
                    <div className="text-[11px] capitalize text-text-muted">
                      {orderDate(o)} · {String(o.orderType || "").replace(/_/g, " ")} · {o.status}
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-[14px] font-bold tabular-nums">{inr(o.total)}</div>
                    {!platform ? (
                      <button
                        type="button"
                        className="kg-btn kg-btn-secondary !px-2 !py-1 !text-[11px]"
                        onClick={() => setWaBill(liveOrderToWhatsAppBill(o))}
                      >
                        WhatsApp
                      </button>
                    ) : null}
                    {!gone ? (
                      <button
                        type="button"
                        className="kg-btn kg-btn-secondary !px-2 !py-1 !text-[11px] text-danger"
                        disabled={deletingId === o.id}
                        onClick={() => void removeOrder(o)}
                      >
                        {deletingId === o.id ? "…" : "Delete"}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState className="m-4" icon={<Inbox size={18} />} title="No matching orders" description="Widen filters or pick another date range." />
        )}
      </Card>

      {waBill ? (
        <WhatsAppShareModal bill={waBill} settings={{ shopName: BRAND.restaurantName }} onClose={() => setWaBill(null)} />
      ) : null}
    </div>
  );
}
