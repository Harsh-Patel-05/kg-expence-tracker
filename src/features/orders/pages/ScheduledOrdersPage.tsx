import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarClock, Inbox, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { FieldLabel, Input } from "@/components/ui/Input";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { MenuItemDoc } from "@/features/pos/types";
import { bookScheduledAdvance, type BookAdvanceItem } from "../services/scheduledOrderService";
import { WhatsAppShareModal } from "@/features/pos/components/WhatsAppShareModal";
import { advanceSaleToWhatsAppBill, liveOrderToWhatsAppBill } from "@/features/pos/utils/orderToWhatsAppBill";
import type { WhatsAppBillPayload } from "@/features/pos/utils/whatsappBill";
import { BRAND } from "@/lib/brand";
import { inr, isoDate, num } from "@/lib/utils";

type ScheduledOrderDoc = {
  id?: string;
  orderNo?: string;
  customerName?: string;
  customerPhone?: string;
  scheduledAt?: string;
  grandTotal?: number;
  remainingBalance?: number;
  paymentStatus?: string;
  status?: string;
  fulfillmentType?: string;
  customerNotes?: string;
  amountReceived?: number;
  items?: BookAdvanceItem[];
};

type AdvanceSaleDoc = {
  date?: string;
  source?: string;
  revenueKind?: string;
  customerName?: string;
  notes?: string;
  totalAmount?: number;
  cashAmount?: number;
  otherOnlineAmount?: number;
  billNo?: string;
  scheduledOrderId?: string;
};

function formatWhen(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function defaultScheduledLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setMinutes(0, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function menuPrice(m: MenuItemDoc) {
  return num((m as any).price ?? (m as any).sellingPrice ?? (m as any).rate);
}

function menuName(m: MenuItemDoc) {
  return String((m as any).name || (m as any).nameEn || (m as any).title || "Item");
}

export function ScheduledOrdersPage() {
  const [searchParams] = useSearchParams();
  const focusBook = searchParams.get("book") === "1";

  const { data: orders, loading: ordersLoading } = useRestaurantCollection<ScheduledOrderDoc>({
    path: "scheduledOrders",
    orderByField: "scheduledAt",
    max: 300
  });
  const { data: sales } = useRestaurantCollection<AdvanceSaleDoc>({ path: "sales", max: 500 });
  const { data: menuItems } = useRestaurantCollection<MenuItemDoc>({ path: "menuItems", max: 400 });

  const advanceSales = useMemo(
    () =>
      sales.filter(
        (s) =>
          String(s.source || "") === "scheduled_advance" ||
          String(s.revenueKind || "") === "customer_advance" ||
          String((s as any).orderType || "") === "Scheduled"
      ),
    [sales]
  );

  const upcoming = useMemo(() => {
    const now = Date.now();
    return [...orders]
      .filter((o) => {
        const st = String(o.status || "").toLowerCase();
        if (st === "cancelled" || st === "completed") return false;
        const t = new Date(o.scheduledAt || 0).getTime();
        return !Number.isNaN(t) && t >= now - 86400000;
      })
      .sort((a, b) => String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || "")));
  }, [orders]);

  const menuOptions = useMemo(
    () =>
      [...menuItems]
        .filter((m) => !(m as any).isDeleted && (m as any).active !== false)
        .sort((a, b) => menuName(a).localeCompare(menuName(b))),
    [menuItems]
  );

  const [form, setForm] = useState({
    scheduledAt: defaultScheduledLocal(),
    customerName: "",
    customerPhone: "",
    grandTotal: "",
    advanceCash: "",
    advanceOnline: "",
    paymentReference: "",
    customerNotes: "",
    fulfillmentType: "pickup" as "pickup" | "delivery"
  });
  const [lines, setLines] = useState<BookAdvanceItem[]>([]);
  const [pickId, setPickId] = useState("");
  const [pickQty, setPickQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [waBill, setWaBill] = useState<WhatsAppBillPayload | null>(null);

  const itemsTotal = useMemo(() => lines.reduce((s, l) => s + num(l.price) * num(l.qty), 0), [lines]);

  useEffect(() => {
    if (itemsTotal > 0) {
      setForm((f) => ({ ...f, grandTotal: String(Math.round(itemsTotal)) }));
    }
  }, [itemsTotal]);

  function addMenuLine() {
    const item = menuOptions.find((m) => m.id === pickId);
    if (!item) {
      setMsg("Select a menu item");
      return;
    }
    const qty = Math.max(1, Math.round(num(pickQty) || 1));
    const price = menuPrice(item);
    const name = menuName(item);
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === item.id && l.price === price);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, qty: l.qty + qty } : l));
      }
      return [...prev, { productId: item.id, name, qty, price }];
    });
    setPickQty("1");
    setMsg(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const advanceCash = num(form.advanceCash);
    const advanceOnline = num(form.advanceOnline);
    if (advanceCash + advanceOnline <= 0) {
      setMsg("Enter advance cash and/or online amount");
      return;
    }
    if (!lines.length && !(num(form.grandTotal) > 0)) {
      setMsg("Add order items or enter order total");
      return;
    }
    try {
      setSaving(true);
      setMsg(null);
      const scheduledAt = new Date(form.scheduledAt).toISOString();
      const res = await bookScheduledAdvance({
        scheduledAt,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        grandTotal: num(form.grandTotal) || itemsTotal,
        advanceCash,
        advanceOnline,
        paymentReference: form.paymentReference,
        customerNotes: form.customerNotes,
        fulfillmentType: form.fulfillmentType,
        items: lines
      });
      setMsg(`Booked ${res.orderNo} — advance Cash/Online saved in today's sales`);
      setLines([]);
      setForm((f) => ({
        ...f,
        customerName: "",
        customerPhone: "",
        grandTotal: "",
        advanceCash: "",
        advanceOnline: "",
        paymentReference: "",
        customerNotes: ""
      }));
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Could not save booking");
    } finally {
      setSaving(false);
    }
  }

  function shareOrder(o: ScheduledOrderDoc) {
    setWaBill(
      liveOrderToWhatsAppBill({
        id: o.id,
        invoiceNo: o.orderNo,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        orderType: "Scheduled",
        total: o.grandTotal,
        grandTotal: o.grandTotal,
        items: (o.items || []).map((it) => ({
          name: it.name,
          qty: it.qty,
          price: it.price,
          note: it.note
        }))
      })
    );
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Operations"
        title="Advance orders"
        description="Book party/advance orders with menu items. Cash/Online advance posts into today's sales totals."
        actions={
          <Link to="/pos" className="kg-btn kg-btn-secondary">
            Back to POS
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <div id="book-advance">
          <Card hover={false}>
            <SectionTitle title="Book advance" description="Select items, then take Cash / Online advance." />
            <form className="mt-3 grid gap-3" onSubmit={(e) => void onSubmit(e)}>
              <div>
                <FieldLabel htmlFor="so-when">Scheduled date &amp; time</FieldLabel>
                <Input
                  id="so-when"
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                />
              </div>
              <div>
                <FieldLabel htmlFor="so-customer">Customer</FieldLabel>
                <Input
                  id="so-customer"
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  placeholder="Name"
                  autoFocus={focusBook}
                />
              </div>
              <div>
                <FieldLabel htmlFor="so-phone">Phone</FieldLabel>
                <Input
                  id="so-phone"
                  value={form.customerPhone}
                  onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                  placeholder="WhatsApp number"
                  inputMode="tel"
                />
              </div>

              <div className="rounded-lg border border-stroke-0 bg-bg-1 p-2.5">
                <div className="mb-2 text-[12px] font-bold text-text-primary">Order items</div>
                <div className="grid grid-cols-[1fr_72px_auto] gap-1.5">
                  <select className="kg-input !py-2 text-[12px]" value={pickId} onChange={(e) => setPickId(e.target.value)}>
                    <option value="">Select menu item</option>
                    {menuOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {menuName(m)} · {inr(menuPrice(m))}
                      </option>
                    ))}
                  </select>
                  <Input type="number" min={1} value={pickQty} onChange={(e) => setPickQty(e.target.value)} placeholder="Qty" />
                  <button type="button" className="kg-btn kg-btn-secondary !px-2.5" onClick={addMenuLine} title="Add item">
                    <Plus size={16} />
                  </button>
                </div>
                {lines.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {lines.map((l, idx) => (
                      <li key={`${l.productId}-${idx}`} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="min-w-0 truncate font-semibold">
                          {l.qty}× {l.name}
                        </span>
                        <span className="shrink-0 tabular-nums">{inr(l.price * l.qty)}</span>
                        <button
                          type="button"
                          className="shrink-0 text-danger"
                          onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                    <li className="flex justify-between border-t border-stroke-0 pt-1.5 text-[12px] font-bold">
                      <span>Items total</span>
                      <span>{inr(itemsTotal)}</span>
                    </li>
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-text-muted">Add items from the menu (required for kitchen prep).</p>
                )}
              </div>

              <div>
                <FieldLabel htmlFor="so-total">Order total (₹)</FieldLabel>
                <Input
                  id="so-total"
                  type="number"
                  value={form.grandTotal}
                  onChange={(e) => setForm((f) => ({ ...f, grandTotal: e.target.value }))}
                  placeholder="Auto from items"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel htmlFor="so-cash">Advance Cash (₹)</FieldLabel>
                  <Input
                    id="so-cash"
                    type="number"
                    value={form.advanceCash}
                    onChange={(e) => setForm((f) => ({ ...f, advanceCash: e.target.value }))}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="so-online">Advance Online (₹)</FieldLabel>
                  <Input
                    id="so-online"
                    type="number"
                    value={form.advanceOnline}
                    onChange={(e) => setForm((f) => ({ ...f, advanceOnline: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="so-ref">Payment reference</FieldLabel>
                <Input
                  id="so-ref"
                  value={form.paymentReference}
                  onChange={(e) => setForm((f) => ({ ...f, paymentReference: e.target.value }))}
                  placeholder="UPI ref (optional)"
                />
              </div>
              <div>
                <FieldLabel htmlFor="so-notes">Notes</FieldLabel>
                <textarea
                  id="so-notes"
                  className="kg-input min-h-[64px] w-full"
                  value={form.customerNotes}
                  onChange={(e) => setForm((f) => ({ ...f, customerNotes: e.target.value }))}
                  placeholder="Party details…"
                />
              </div>
              <div>
                <FieldLabel htmlFor="so-fulfillment">Fulfillment</FieldLabel>
                <select
                  id="so-fulfillment"
                  className="kg-input w-full"
                  value={form.fulfillmentType}
                  onChange={(e) => setForm((f) => ({ ...f, fulfillmentType: e.target.value as "pickup" | "delivery" }))}
                >
                  <option value="pickup">Pickup</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>
              <button type="submit" disabled={saving} className="kg-btn kg-btn-primary disabled:opacity-50">
                {saving ? "Saving…" : "Save advance booking"}
              </button>
              {msg ? (
                <div className={`text-sm ${msg.includes("Booked") ? "text-success" : "text-text-secondary"}`} role="status">
                  {msg}
                </div>
              ) : null}
            </form>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card hover={false} className="!p-0 overflow-hidden">
            <div className="border-b border-stroke-0 px-3 py-2">
              <SectionTitle title="Upcoming bookings" description={ordersLoading ? "Loading…" : `${upcoming.length} active`} />
            </div>
            {upcoming.length ? (
              <div className="divide-y divide-stroke-0">
                {upcoming.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-[13px]">
                    <div>
                      <div className="font-bold text-text-primary">{o.orderNo || o.id}</div>
                      <div>
                        {o.customerName}
                        {o.customerPhone ? ` · ${o.customerPhone}` : ""}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[12px] text-text-muted">
                        <CalendarClock size={13} />
                        {formatWhen(o.scheduledAt)}
                      </div>
                      {o.items?.length ? (
                        <div className="mt-1 text-[11px] text-text-muted">
                          {o.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-right text-[12px]">
                      <div className="font-bold">{inr(o.grandTotal)}</div>
                      <div className="text-text-muted">
                        Adv {inr(o.amountReceived)} · due {inr(o.remainingBalance)}
                      </div>
                      <button type="button" className="mt-1 text-[11px] font-semibold text-primary" onClick={() => shareOrder(o)}>
                        WhatsApp bill
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState className="m-3" icon={<Inbox size={18} />} title="No upcoming scheduled orders" description="Book an advance using the form." />
            )}
          </Card>

          <Card hover={false} className="!p-0 overflow-x-auto">
            <div className="border-b border-stroke-0 px-3 py-2">
              <SectionTitle title="Customer advances (today's sales)" description={`${advanceSales.length} ledger rows · ${isoDate()}`} />
            </div>
            <table className="w-full text-left text-[13px]">
              <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Bill</th>
                  <th className="px-3 py-2">Cash</th>
                  <th className="px-3 py-2">Online</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Share</th>
                </tr>
              </thead>
              <tbody>
                {advanceSales.slice(0, 40).map((s) => (
                  <tr key={s.id} className="border-t border-stroke-0">
                    <td className="px-3 py-2">{String(s.date || "").slice(0, 10)}</td>
                    <td className="px-3 py-2 font-semibold">{s.billNo || s.id}</td>
                    <td className="px-3 py-2">{inr(s.cashAmount)}</td>
                    <td className="px-3 py-2">{inr(s.otherOnlineAmount)}</td>
                    <td className="px-3 py-2 font-bold">{inr(s.totalAmount)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-primary"
                        onClick={() => setWaBill(advanceSaleToWhatsAppBill(s))}
                      >
                        WhatsApp
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!advanceSales.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No advance sales yet" /> : null}
          </Card>
        </div>
      </div>

      {waBill ? (
        <WhatsAppShareModal
          bill={waBill}
          settings={{ shopName: BRAND.restaurantName }}
          onClose={() => setWaBill(null)}
        />
      ) : null}
    </div>
  );
}
