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
      (e) => setError(e.message)
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

  if (error) return <div className="p-4 text-rose-600">{error}</div>;
  if (!order) return <div className="p-4 text-slate-500">Loading order…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/orders/board" className="text-xs font-semibold text-cyan-700">
            ← Board
          </Link>
          <h1 className="text-2xl font-black text-slate-900">{order.invoiceNo || order.id.slice(0, 10)}</h1>
          <div className="text-sm text-slate-600">
            {ORDER_TYPE_LABELS[order.orderType] || order.orderType} · <span className="capitalize">{order.status}</span>
            {order.platformOrderId ? ` · Platform #${order.platformOrderId}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
            onClick={() => void run(() => printKotForOrder(order.id, "reprint"), "KOT printed")}
          >
            Reprint KOT
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
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
            className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white"
            onClick={() => void run(() => confirmOrderToKitchen(order.id, role), "Sent to kitchen")}
          >
            Confirm → Kitchen
          </button>
        </div>
      </div>

      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4">
          <Card title="Items">
            <div className="space-y-2">
              {(order.items || []).map((l) => (
                <div key={l.lineId} className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    <div className="font-semibold">
                      {l.name} × {l.qty}
                    </div>
                    {(l.note || l.kitchenNote || l.specialInstructions) && (
                      <div className="text-xs text-slate-500">
                        {l.kitchenNote || l.note || l.specialInstructions}
                      </div>
                    )}
                  </div>
                  <div className="font-bold">{inr(l.complimentary ? 0 : l.price * l.qty)}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Status timeline">
            <ol className="relative space-y-3 border-l border-slate-200 pl-4">
              {timeline.map((t, i) => (
                <li key={`${t.status}-${i}`} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-cyan-500" />
                  <div className="text-sm font-semibold capitalize">{String(t.status).replace(/_/g, " ")}</div>
                  <div className="text-xs text-slate-500">
                    {t.at ? new Date(t.at).toLocaleString("en-IN") : "—"}
                    {t.note ? ` · ${t.note}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card title="Customer & table">
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
          </Card>

          <Card title="Payment">
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
          </Card>

          <Card title="Actions">
            <div className="flex flex-wrap gap-2">
              {(["accepted", "preparing", "ready", "served", "completed", "cancelled"] as OrderStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold capitalize"
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
                <div className="mb-1 text-xs font-semibold text-slate-500">Assign chef</div>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
                <div className="mb-1 text-xs font-semibold text-slate-500">Assign driver</div>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
              <div className="mb-1 text-xs font-semibold text-slate-500">Transfer table</div>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-sm font-bold">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-50 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value}</span>
    </div>
  );
}
