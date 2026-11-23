import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { inr } from "@/lib/utils";
import type { OrderDoc, OrderStatus } from "@/features/pos/types";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { ORDER_TYPE_LABELS } from "../engine/statusMachine";
import {
  assignChef,
  assignDriver,
  printKotForOrder,
  updateOrderStatus
} from "../services/orderEngine";
import { confirmOrderToKitchen } from "../services/channelOrders";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { canAssignChef, canAssignDriver } from "@/features/pos/utils/permissions";
import { transferTable } from "@/features/pos/services/orderOps";
import { printGstReceipt } from "@/features/pos/utils/printReceipt";
import { Card as UiCard } from "@/components/ui/Card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { PageLoading } from "@/components/ui/Loading";

type StaffDoc = { name?: string; active?: boolean };
type DriverDoc = { name: string; phone?: string; active?: boolean };

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const { role } = usePosAuth();
  const [order, setOrder] = useState<(OrderDoc & { id: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { data: staff } = useRestaurantCollection<StaffDoc>({ path: "staff" });
  const { data: drivers } = useRestaurantCollection<DriverDoc>({ path: "drivers" });
  const { data: tables } = useRestaurantCollection<{ name: string; status?: string }>({ path: "tables" });

  useEffect(() => {
    if (!orderId) return;
    setOrder(null);
    setError(null);
    return onSnapshot(
      doc(db, "orders", orderId),
      (snap) => {
        if (!snap.exists()) {
          setError("Order not found");
          setOrder(null);
          return;
        }
        setOrder({ id: snap.id, ...(snap.data() as OrderDoc) });
        setError(null);
      },
      (e) => {
        setError(e.message);
        setOrder(null);
      }
    );
  }, [orderId]);

  const timeline = useMemo(() => {
    const hist = order?.statusHistory || [];
    if (hist.length) return hist;
    return order?.status ? [{ status: order.status, at: "", note: "Current" }] : [];
  }, [order]);

  async function run(fn: () => Promise<unknown>, ok = "Updated") {
    try {
      setBusy(true);
      await fn();
      setMsg(ok);
    } catch (e: any) {
      setMsg(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="grid gap-4">
        <PageHeader
          back={<Link to="/orders/board" className="text-xs font-semibold text-primary">← Board</Link>}
          title="Order"
          description="Could not load this order."
        />
        <EmptyState title={error} description="Go back to the board and pick another order." action={<Link to="/orders/board" className="kg-btn kg-btn-primary">Back to board</Link>} />
      </div>
    );
  }
  if (!order) return <PageLoading label="Loading order…" />;

  return (
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/orders/board" className="text-xs font-semibold text-primary">← Board</Link>}
        title={order.invoiceNo || order.id.slice(0, 10)}
        description={
          <>
            {ORDER_TYPE_LABELS[order.orderType] || order.orderType} · <span className="capitalize">{order.status}</span>
            {order.platformOrderId ? ` · Platform #${order.platformOrderId}` : ""}
          </>
        }
        actions={
          <>
            <button
              type="button"
              disabled={busy}
              className="kg-btn kg-btn-secondary"
              onClick={() => void run(() => printKotForOrder(order.id, "reprint"), "KOT printed")}
            >
              Reprint KOT
            </button>
            <button
              type="button"
              disabled={busy}
              className="kg-btn kg-btn-secondary"
              onClick={() => {
                printGstReceipt(order);
                setMsg("Receipt opened");
              }}
            >
              Print invoice
            </button>
            <button
              type="button"
              disabled={busy}
              className="kg-btn kg-btn-primary"
              onClick={() => void run(() => confirmOrderToKitchen(order.id, role), "Sent to kitchen")}
            >
              Confirm → Kitchen
            </button>
          </>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4">
          <Section title="Items">
            <div className="space-y-2">
              {(order.items || []).map((l) => (
                <div key={l.lineId} className="flex justify-between gap-3 rounded-lg border border-stroke-0 bg-bg-1/60 px-3 py-2.5 text-[13px]">
                  <div>
                    <div className="font-semibold">
                      {l.name} × {l.qty}
                    </div>
                    {(l.note || l.kitchenNote || l.specialInstructions) && (
                      <div className="text-xs text-text-muted">
                        {l.kitchenNote || l.note || l.specialInstructions}
                      </div>
                    )}
                  </div>
                  <div className="font-bold">{inr(l.complimentary ? 0 : l.price * l.qty)}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Status timeline">
            <ol className="relative space-y-3 border-l border-stroke-0 pl-4">
              {timeline.map((t, i) => (
                <li key={`${t.status}-${i}`} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="text-[13px] font-semibold capitalize">{String(t.status).replace(/_/g, " ")}</div>
                  <div className="text-xs text-text-muted">
                    {t.at ? new Date(t.at).toLocaleString("en-IN") : "—"}
                    {t.note ? ` · ${t.note}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </section>

        <aside className="space-y-4">
          <Section title="Customer & table">
            <Row label="Customer" value={order.customerName || "—"} />
            <Row label="Phone" value={order.customerPhone || "—"} />
            <Row label="Table" value={order.tableName || "—"} />
            <Row label="Guest count" value={String(order.guestCount || "—")} />
            <Row label="Captain" value={order.captainName || "—"} />
            <Row label="Chef" value={order.chefName || "—"} />
            <Row label="Driver" value={order.driverName || "—"} />
            {order.deliveryAddress ? <Row label="Address" value={order.deliveryAddress} /> : null}
            {order.tokenNumber ? <Row label="Token" value={order.tokenNumber} /> : null}
            {order.scheduledFor ? <Row label="Scheduled" value={new Date(order.scheduledFor).toLocaleString("en-IN")} /> : null}
          </Section>

          <Section title="Payment">
            <Row label="Subtotal" value={inr(order.subtotal)} />
            <Row label="Tax" value={inr(order.taxAmount)} />
            <Row label="Total" value={inr(order.total)} />
            <Row label="Paid" value={inr(order.paidTotal)} />
            <Row label="Balance" value={inr(order.balanceDue)} />
            {order.platform ? (
              <>
                <Row label="Platform" value={String(order.platform)} />
                <Row label="Commission" value={inr(order.platformCommission || 0)} />
                <Row label="Expected payout" value={inr(order.expectedPayout || 0)} />
              </>
            ) : null}
          </Section>

          <Section title="Actions">
            <div className="flex flex-wrap gap-2">
              {(["accepted", "preparing", "ready", "served", "completed", "cancelled"] as OrderStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  className="kg-btn kg-btn-secondary capitalize disabled:opacity-50"
                  onClick={() =>
                    void run(async () => {
                      const note = s === "cancelled" ? prompt("Cancel reason") || "" : undefined;
                      if (s === "cancelled" && !note) throw new Error("Reason required");
                      await updateOrderStatus({ orderId: order.id, toStatus: s, note, role });
                    }, `Status → ${s}`)
                  }
                >
                  {s.replace(/_/g, " ")}
                </button>
              ))}
            </div>

            {canAssignChef(role) ? (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-text-muted">Assign chef</div>
                <select
                  className="kg-input w-full"
                  defaultValue=""
                  onChange={(e) => {
                    const name = e.target.value;
                    if (!name) return;
                    const id = staff.find((s) => (typeof s === "object" ? s.name : s) === name)?.id || name;
                    void run(() => assignChef({ orderId: order.id, chefId: String(id), chefName: name, role }), "Chef assigned");
                  }}
                >
                  <option value="">Select staff</option>
                  {staff.map((s) => {
                    const name = typeof s === "object" ? String((s as any).name || s.id) : String(s);
                    return (
                      <option key={s.id || name} value={name}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : null}

            {canAssignDriver(role) ? (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-text-muted">Assign driver</div>
                <select
                  className="kg-input w-full"
                  defaultValue=""
                  onChange={(e) => {
                    const id = e.target.value;
                    const d = drivers.find((x) => x.id === id);
                    if (!d) return;
                    void run(() => assignDriver({ orderId: order.id, driverId: d.id, driverName: d.name, role }), "Driver assigned");
                  }}
                >
                  <option value="">Select driver</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold text-text-muted">Transfer table</div>
              <select
                className="kg-input w-full"
                defaultValue=""
                onChange={(e) => {
                  const id = e.target.value;
                  const t = tables.find((x) => x.id === id);
                  if (!t) return;
                  void run(
                    () => transferTable(order.id, order.tableId || null, t.id, t.name),
                    `Transferred to ${t.name}`
                  );
                }}
              >
                <option value="">Select table</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.status || "—"})
                  </option>
                ))}
              </select>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <UiCard padding="sm" hover={false}>
      <SectionTitle title={title} />
      {children}
    </UiCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-stroke-0 py-1.5 text-[13px] last:border-0">
      <span className="text-text-muted">{label}</span>
      <span className="text-right font-semibold text-text-primary">{value}</span>
    </div>
  );
}
