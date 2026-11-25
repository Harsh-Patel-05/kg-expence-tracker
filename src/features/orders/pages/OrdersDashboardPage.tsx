import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChefHat, ClipboardList, MonitorSmartphone, Inbox } from "lucide-react";
import { inr } from "@/lib/utils";
import { useLiveOrders } from "../hooks/useLiveOrders";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { canAccessOrders } from "@/features/pos/utils/permissions";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { Button } from "@/components/ui/Button";
import { WhatsAppShareModal } from "@/features/pos/components/WhatsAppShareModal";
import { liveOrderToWhatsAppBill } from "@/features/pos/utils/orderToWhatsAppBill";
import type { WhatsAppBillPayload } from "@/features/pos/utils/whatsappBill";
import { BRAND } from "@/lib/brand";

import { ContentLoading, PageLoading } from "@/components/ui/Loading";

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  const toneClass =
    tone === "bg-warning-bg"
      ? "border-warning/40 bg-warning-bg/40"
      : tone === "bg-success-bg"
        ? "border-success/40 bg-success-bg/40"
        : tone === "bg-danger-bg"
          ? "border-danger/40 bg-danger-bg/40"
          : tone === "bg-primary-light"
            ? "border-primary/40 bg-primary-light/60"
            : undefined;
  return <KpiCard title={label} value={String(value)} className={toneClass} />;
}

export function OrdersDashboardPage() {
  const navigate = useNavigate();
  const { role, loading: authLoading } = usePosAuth();
  const { stats, loading, error, allOrders } = useLiveOrders();
  const [waBill, setWaBill] = useState<WhatsAppBillPayload | null>(null);

  if (authLoading) return <PageLoading label="Loading orders…" />;
  if (!canAccessOrders(role)) {
    return <EmptyState title="Orders access denied" description={`Your role (${role}) cannot open orders.`} />;
  }

  const recent = [...allOrders]
    .sort((a, b) => String(b.updatedAt || b.date || "").localeCompare(String(a.updatedAt || a.date || "")))
    .slice(0, 10);

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Order management"
        title="Live operations"
        actions={
          <>
          <Link to="/orders/board" className="kg-btn kg-btn-primary">
            <ClipboardList size={16} /> Live board
          </Link>
          <a href="/kds" target="_blank" rel="noopener noreferrer" className="kg-btn kg-btn-secondary">
            <MonitorSmartphone size={16} /> Kitchen display
          </a>
          <Link to="/pos" className="kg-btn kg-btn-secondary">
            <ChefHat size={16} /> POS
          </Link>
          </>
        }
      />

      {loading ? <ContentLoading variant="block" label="Loading" /> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Live orders" value={stats.live} />
        <Stat label="Preparing" value={stats.preparing} tone="bg-warning-bg" />
        <Stat label="Ready" value={stats.ready} tone="bg-success-bg" />
        <Stat label="Served" value={stats.served} />
        <Stat label="Completed" value={stats.completed} />
        <Stat label="Cancelled" value={stats.cancelled} tone="bg-danger-bg" />
        <Stat label="Refunded" value={stats.refunded} />
        <Stat label="Delayed" value={stats.delayed} tone="bg-primary-light" />
        <Stat label="Priority" value={stats.priority} />
        <Stat label="Scheduled upcoming" value={stats.scheduled} />
        <Stat label="Pending payments" value={stats.pendingPay} />
        <Stat label="Today's shop sales" value={inr(stats.revenue)} />
        <Stat label="Today's orders" value={stats.ordersToday} />
        <Stat label="Avg prep (min)" value={stats.avgPrep.toFixed(1)} />
        <Stat label="Avg delivery (min)" value={stats.avgDelivery.toFixed(1)} />
      </div>

      <Card padding="sm" hover={false}>
        <SectionTitle
          title="Recent orders"
          description="Latest 10 bills"
          right={
            <Button variant="secondary" onClick={() => navigate("/orders/history")}>
              Show all
            </Button>
          }
        />
        <div className="divide-y divide-stroke-0">
          {recent.map((o) => {
            const t = String(o.orderType || "").toLowerCase();
            const isPlatform = t.includes("swiggy") || t.includes("zomato");
            return (
              <div key={o.id} className="flex items-center justify-between gap-3 px-1 py-3 hover:bg-bg-1">
                <Link to={`/orders/${o.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">
                    {o.invoiceNo || o.id.slice(0, 8)} · {o.customerName || o.tableName || "—"}
                  </div>
                  <div className="text-xs capitalize text-text-muted">
                    {o.orderType.replace(/_/g, " ")} · {o.status}
                    {o.delayed ? " · delayed" : ""}
                    {isPlatform ? " · not in shop sales" : ""}
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-[14px] font-bold text-text-primary">{inr(o.total)}</div>
                  {!isPlatform ? (
                    <button
                      type="button"
                      className="kg-btn kg-btn-secondary !px-2 !py-1 !text-[11px]"
                      onClick={() => setWaBill(liveOrderToWhatsAppBill(o))}
                    >
                      WhatsApp
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {!recent.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No orders yet — create from POS." /> : null}
        </div>
        {recent.length ? (
          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-stroke-0 py-2 text-[12px] font-semibold text-primary hover:bg-primary-light"
            onClick={() => navigate("/orders/history")}
          >
            Show all history
          </button>
        ) : null}
      </Card>

      {waBill ? (
        <WhatsAppShareModal bill={waBill} settings={{ shopName: BRAND.restaurantName }} onClose={() => setWaBill(null)} />
      ) : null}
    </div>
  );
}
