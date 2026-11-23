import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  PauseCircle,
  QrCode,
  RotateCcw,
  Search,
  Users,
  UtensilsCrossed
} from "lucide-react";
import { inr } from "@/lib/utils";
import { useRestaurantCollection } from "../hooks/useRestaurantCollection";
import type { CouponDoc, CustomerDoc, MenuItemDoc, OrderDoc, OrderType, TableDoc } from "../types";
import { usePosStore } from "../store/posStore";
import { usePosAuth } from "../auth/PosAuthProvider";
import { ProductGrid } from "../components/ProductGrid";
import { CartLines } from "../components/CartLines";
import { PaymentPanel } from "../components/PaymentPanel";
import { chargeCurrentBill, holdCurrentBill, splitLinesByEqual } from "../services/checkout";
import { getPosSettings, upsertCustomer, upsertTable } from "../services/posFirestore";
import { canAccessPos, canManualPrice } from "../utils/permissions";
import { printGstReceipt, printKitchenTicket } from "../utils/printReceipt";
import { createSplitOrders } from "../services/orderOps";

const ORDER_TYPES: Array<{ id: OrderType; label: string }> = [
  { id: "dine_in", label: "Dine-in" },
  { id: "takeaway", label: "Takeaway" },
  { id: "delivery", label: "Delivery" },
  { id: "swiggy", label: "Swiggy" },
  { id: "zomato", label: "Zomato" },
  { id: "direct", label: "Direct" }
];

export function PosPage() {
  const { role, loading: authLoading } = usePosAuth();
  const searchRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [showHeld, setShowHeld] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [discPct, setDiscPct] = useState("");
  const [discReason, setDiscReason] = useState("");
  const [couponInput, setCouponInput] = useState("");

  const store = usePosStore();
  const {
    data: menuItems,
    loading: menuLoading,
    error: menuError
  } = useRestaurantCollection<MenuItemDoc>({ path: "menuItems" });
  const { data: heldOrders } = useRestaurantCollection<OrderDoc>({
    path: "orders",
    whereField: "status",
    whereValue: "held"
  });
  const { data: customers } = useRestaurantCollection<CustomerDoc>({ path: "customers" });
  const { data: tables } = useRestaurantCollection<TableDoc>({ path: "tables" });
  const { data: coupons } = useRestaurantCollection<CouponDoc>({ path: "coupons" });

  const sortedMenu = useMemo(
    () => [...menuItems].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [menuItems]
  );

  useEffect(() => {
    void getPosSettings()
      .then((s) => {
        store.setTaxConfig({
          ...s.tax,
          maxDiscountPct: s.maxDiscountPct,
          roundOffEnabled: s.roundOffEnabled
        });
      })
      .catch(() => undefined);
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "enter") {
        e.preventDefault();
        void onCharge();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        void onHold();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        store.undoRemove();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    sortedMenu.forEach((m) => set.add(String(m.category || "General")));
    return ["All", "Favorites", "Recent", ...[...set].sort()];
  }, [sortedMenu]);

  const filtered = useMemo(() => {
    const q = store.search.trim().toLowerCase();
    let list = sortedMenu.filter((m) => m.available !== false);
    if (store.category === "Favorites") list = list.filter((m) => store.favoriteIds.includes(m.id) || m.favorite);
    else if (store.category === "Recent") list = list.filter((m) => store.recentIds.includes(m.id));
    else if (store.category !== "All") list = list.filter((m) => String(m.category || "General") === store.category);
    if (q) {
      list = list.filter((m) => {
        const blob = `${m.name} ${m.nameHi || ""} ${m.barcode || ""} ${m.qrCode || ""}`.toLowerCase();
        return blob.includes(q);
      });
    }
    return list;
  }, [sortedMenu, store.search, store.category, store.favoriteIds, store.recentIds]);

  const totals = store.totals();

  async function handleBarcodeOrSearchSubmit() {
    const q = store.search.trim();
    if (!q) return;
    const byBarcode = sortedMenu.find(
      (m) => String(m.barcode || "") === q || String(m.qrCode || "") === q || String(m.id) === q
    );
    if (byBarcode) {
      store.addProduct(byBarcode);
      store.setSearch("");
      setBanner(`Added ${byBarcode.name}`);
      return;
    }
    const byTable = tables.find((t) => String(t.name).toLowerCase() === q.toLowerCase() || t.id === q);
    if (byTable) {
      store.setTable({ id: byTable.id, name: byTable.name });
      store.setSearch("");
      setBanner(`Table ${byTable.name} assigned`);
      return;
    }
    const byCustomer = customers.find(
      (c) => String(c.phone || "") === q || String(c.name).toLowerCase() === q.toLowerCase()
    );
    if (byCustomer) {
      store.setCustomer({ id: byCustomer.id, name: byCustomer.name, phone: byCustomer.phone });
      store.setSearch("");
      setBanner(`Customer ${byCustomer.name}`);
      return;
    }
    if (q.length >= 3 && !filtered.length) setBanner("Product not found");
  }

  async function onHold() {
    try {
      setBusy(true);
      const id = await holdCurrentBill(store, role);
      store.clearCart();
      setBanner(`Bill held (${id.slice(0, 6)})`);
    } catch (e: any) {
      setBanner(e?.message || "Hold failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCharge() {
    try {
      setBusy(true);
      const res = await chargeCurrentBill({ store, role, menuItems: sortedMenu, coupons });
      try {
        printGstReceipt({
          ...res.totals,
          invoiceNo: res.invoiceNo,
          date: new Date().toISOString().slice(0, 10),
          items: store.lines,
          orderType: store.orderType,
          tableName: store.tableName,
          customerName: store.customerName,
          subtotal: res.totals.subtotal,
          cgst: res.totals.cgst,
          sgst: res.totals.sgst,
          total: res.totals.total
        });
        printKitchenTicket({
          items: store.lines,
          tableName: store.tableName,
          orderType: store.orderType
        });
      } catch {
        /* print optional */
      }
      store.clearCart();
      setBanner(`Bill ${res.invoiceNo} completed · ${inr(res.totals.total)}`);
      if (res.missingRecipes.length) setBanner((b) => `${b} · recipe missing: ${res.missingRecipes.join(", ")}`);
    } catch (e: any) {
      setBanner(e?.message || "Charge failed");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return <div className="grid min-h-screen place-items-center text-slate-500">Loading POS…</div>;
  }
  if (!canAccessPos(role)) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <div className="text-lg font-semibold">POS access denied</div>
          <div className="mt-2 text-sm text-slate-500">Your role ({role}) cannot open billing.</div>
          <Link to="/" className="mt-4 inline-block text-cyan-600">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
          <Link to="/" className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2 py-1.5 text-sm">
            <ArrowLeft size={16} /> ERP
          </Link>
          <div className="text-sm font-bold tracking-tight">Enterprise POS</div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {ORDER_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => store.setOrderType(t.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${store.orderType === t.id ? "bg-cyan-500 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {banner ? (
          <motion.div
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mx-auto max-w-[1600px] px-4 pt-3"
          >
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{banner}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
        {/* LEFT: catalog */}
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                ref={searchRef}
                value={store.search}
                onChange={(e) => store.setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleBarcodeOrSearchSubmit();
                }}
                placeholder="Search / barcode / QR · press / to focus"
                className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none ring-cyan-400 focus:ring-2"
              />
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              onClick={() => void handleBarcodeOrSearchSubmit()}
              title="Resolve barcode / QR"
            >
              <QrCode size={16} /> Scan
            </button>
            <button type="button" className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" onClick={() => setShowCustomer(true)}>
              <Users size={16} /> {store.customerName || "Customer"}
            </button>
            <button type="button" className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" onClick={() => setShowTable(true)}>
              <UtensilsCrossed size={16} /> {store.tableName || "Table"}
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => store.setCategory(c)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${store.category === c ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
              >
                {c}
              </button>
            ))}
          </div>

          {menuLoading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200/60" /> : null}
          {menuError ? <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{menuError}</div> : null}
          <ProductGrid
            items={filtered}
            favoriteIds={store.favoriteIds}
            onAdd={(item) => store.addProduct(item)}
            onToggleFavorite={(id) => store.toggleFavorite(id)}
          />
        </section>

        {/* RIGHT: cart */}
        <aside className="min-w-0 space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold">Current cart</div>
                <div className="text-xs text-slate-500">
                  {store.lines.reduce((s, l) => s + l.qty, 0)} items · {store.customerName || "Walk-in"}
                  {store.tableName ? ` · ${store.tableName}` : ""}
                </div>
              </div>
              <div className="flex gap-1">
                <button type="button" className="rounded-lg border border-slate-200 p-2" title="Undo remove" onClick={() => store.undoRemove()}>
                  <RotateCcw size={16} />
                </button>
                <button type="button" className="rounded-lg border border-slate-200 p-2" title="Held bills" onClick={() => setShowHeld(true)}>
                  <PauseCircle size={16} />
                </button>
              </div>
            </div>

            <CartLines
              lines={store.lines}
              onBump={(id, d) => store.bumpQty(id, d)}
              onRemove={(id) => store.removeLine(id)}
              onEditNote={(id, note) => store.updateLine(id, { note })}
            />

            <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
              <Row label="Subtotal" value={inr(totals.subtotal)} />
              {totals.itemDiscountTotal > 0 ? <Row label="Item discounts" value={`- ${inr(totals.itemDiscountTotal)}`} /> : null}
              {totals.billDiscount > 0 ? <Row label="Bill discount" value={`- ${inr(totals.billDiscount)}`} /> : null}
              {totals.couponDiscount > 0 ? <Row label="Coupon" value={`- ${inr(totals.couponDiscount)}`} /> : null}
              <Row label={`CGST`} value={inr(totals.cgst)} />
              <Row label={`SGST`} value={inr(totals.sgst)} />
              {totals.igst > 0 ? <Row label="IGST" value={inr(totals.igst)} /> : null}
              {totals.chargesTotal > 0 ? <Row label="Charges" value={inr(totals.chargesTotal)} /> : null}
              {totals.roundOff ? <Row label="Round off" value={inr(totals.roundOff)} /> : null}
              <div className="flex justify-between pt-1 text-base font-black">
                <span>Grand total</span>
                <span>{inr(totals.total)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Paid {inr(totals.paid)}</span>
                <span>Balance {inr(totals.balance)}</span>
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  className="rounded-xl border border-slate-200 px-2 py-2 text-xs"
                  placeholder="Disc %"
                  value={discPct}
                  onChange={(e) => setDiscPct(e.target.value)}
                />
                <input
                  className="rounded-xl border border-slate-200 px-2 py-2 text-xs"
                  placeholder="Reason"
                  value={discReason}
                  onChange={(e) => setDiscReason(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                  onClick={() =>
                    store.setDiscount({ type: "percent", value: Number(discPct) || 0, reason: discReason })
                  }
                >
                  Apply
                </button>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  className="rounded-xl border border-slate-200 px-2 py-2 text-xs uppercase"
                  placeholder="Coupon code"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
                  onClick={() => store.setCouponCode(couponInput.trim() || null)}
                >
                  Coupon
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 py-2 text-xs font-semibold"
                  onClick={() => store.addCharge({ label: "Packing", amount: 10, type: "packing" })}
                >
                  + Packing
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 py-2 text-xs font-semibold"
                  onClick={() => store.addCharge({ label: "Delivery", amount: 30, type: "delivery" })}
                >
                  + Delivery
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 py-2 text-xs font-semibold"
                  onClick={() => store.addCharge({ label: "Service", amount: Math.round(totals.subtotal * 0.05), type: "service" })}
                >
                  + Service
                </button>
              </div>
              {canManualPrice(role) ? (
                <button
                  type="button"
                  className="rounded-xl border border-dashed border-slate-300 py-2 text-xs text-slate-600"
                  onClick={() => {
                    const name = prompt("Custom item name");
                    const price = Number(prompt("Price") || 0);
                    if (name) store.addCustomItem(name, price);
                  }}
                >
                  Add custom / price override item
                </button>
              ) : null}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onHold()}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold"
              >
                Hold bill
              </button>
              <button
                type="button"
                disabled={busy || store.lines.length < 2}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"
                onClick={async () => {
                  const parts = Number(prompt("Split into how many equal bills?", "2") || 0);
                  if (parts < 2) return;
                  try {
                    setBusy(true);
                    const buckets = splitLinesByEqual(store.lines, parts);
                    const settings = await getPosSettings();
                    const parentId = await holdCurrentBill(store, role);
                    await createSplitOrders({
                      parent: {
                        id: parentId,
                        date: new Date().toISOString().slice(0, 10),
                        orderType: store.orderType,
                        items: store.lines,
                        customerId: store.customerId,
                        customerName: store.customerName,
                        tableId: store.tableId,
                        tableName: store.tableName,
                        taxMode: store.tax.mode,
                        subtotal: 0,
                        itemDiscountTotal: 0,
                        billDiscount: 0,
                        couponDiscount: 0,
                        taxAmount: 0,
                        cgst: 0,
                        sgst: 0,
                        igst: 0,
                        charges: [],
                        chargesTotal: 0,
                        roundOff: 0,
                        total: 0,
                        paidTotal: 0,
                        balanceDue: 0,
                        payments: [],
                        discount: { type: "none", value: 0 }
                      },
                      buckets,
                      tax: settings.tax
                    });
                    store.clearCart();
                    setBanner(`Split into ${parts} held bills`);
                  } catch (e: any) {
                    setBanner(e?.message || "Split failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Split
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Clear cart?")) store.clearCart();
                }}
                className="rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-600"
              >
                Clear
              </button>
            </div>
          </div>

          <PaymentPanel busy={busy} onCharge={onCharge} />
        </aside>
      </div>

      {showHeld ? (
        <Modal title="Held bills" onClose={() => setShowHeld(false)}>
          <div className="space-y-2">
            {heldOrders.map((o) => (
              <button
                key={o.id}
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  store.loadHeld({
                    orderId: o.id,
                    invoiceNo: o.invoiceNo || null,
                    orderType: o.orderType,
                    lines: o.items || [],
                    customerId: o.customerId,
                    customerName: o.customerName,
                    customerPhone: o.customerPhone,
                    tableId: o.tableId,
                    tableName: o.tableName,
                    notes: o.notes,
                    kitchenNote: o.kitchenNote,
                    customerNote: o.customerNote,
                    discount: o.discount,
                    couponCode: o.couponCode,
                    charges: o.charges
                  });
                  setShowHeld(false);
                  setBanner(`Resumed held bill ${o.invoiceNo || o.id.slice(0, 6)}`);
                }}
              >
                <span>
                  {o.tableName || o.customerName || "Hold"} · {o.date}
                </span>
                <span className="font-bold">{inr(o.total)}</span>
              </button>
            ))}
            {!heldOrders.length ? <div className="text-sm text-slate-500">No held bills</div> : null}
          </div>
        </Modal>
      ) : null}

      {showCustomer ? (
        <Modal title="Customer" onClose={() => setShowCustomer(false)}>
          <CustomerForm
            customers={customers}
            onPick={(c) => {
              store.setCustomer(c);
              setShowCustomer(false);
            }}
            onGuest={() => {
              store.setCustomer({ id: null, name: "Guest", phone: null });
              setShowCustomer(false);
            }}
            onWalkIn={() => {
              store.setCustomer({ id: null, name: "Walk-in", phone: null });
              setShowCustomer(false);
            }}
          />
        </Modal>
      ) : null}

      {showTable ? (
        <Modal title="Tables" onClose={() => setShowTable(false)}>
          <TableBoard
            tables={tables}
            onPick={(t) => {
              store.setTable(t);
              setShowTable(false);
            }}
            onCreate={async () => {
              const name = prompt("Table name");
              if (!name) return;
              await upsertTable({ name, status: "available" });
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-bold">{title}</div>
          <button type="button" className="text-sm text-slate-500" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CustomerForm(props: {
  customers: Array<{ id: string; name: string; phone?: string; pendingBalance?: number; rewardPoints?: number }>;
  onPick: (c: { id: string; name: string; phone?: string }) => void;
  onGuest: () => void;
  onWalkIn: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button type="button" className="rounded-xl border px-3 py-2 text-xs font-semibold" onClick={props.onWalkIn}>
          Walk-in
        </button>
        <button type="button" className="rounded-xl border px-3 py-2 text-xs font-semibold" onClick={props.onGuest}>
          Guest
        </button>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <input className="rounded-xl border px-2 py-2 text-sm" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded-xl border px-2 py-2 text-sm" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button
          type="button"
          className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-white"
          onClick={async () => {
            if (!name.trim()) return;
            const id = await upsertCustomer({ name, phone, type: "regular" });
            props.onPick({ id, name, phone });
          }}
        >
          Save
        </button>
      </div>
      <div className="max-h-64 space-y-1 overflow-auto">
        {props.customers.map((c) => (
          <button
            key={c.id}
            type="button"
            className="flex w-full justify-between rounded-xl border border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
            onClick={() => props.onPick(c)}
          >
            <span>
              {c.name}
              {c.phone ? ` · ${c.phone}` : ""}
            </span>
            <span className="text-xs text-slate-500">
              pts {c.rewardPoints || 0} · due {inr(c.pendingBalance || 0)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TableBoard(props: {
  tables: Array<{ id: string; name: string; status?: string; capacity?: number }>;
  onPick: (t: { id: string; name: string }) => void;
  onCreate: () => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <button type="button" className="rounded-xl border px-3 py-2 text-xs font-semibold" onClick={() => void props.onCreate()}>
        + New table
      </button>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {props.tables.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => props.onPick(t)}
            className={`rounded-2xl border p-3 text-left ${
              t.status === "occupied"
                ? "border-rose-200 bg-rose-50"
                : t.status === "reserved"
                  ? "border-amber-200 bg-amber-50"
                  : t.status === "cleaning"
                    ? "border-slate-200 bg-slate-100"
                    : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <div className="font-bold">{t.name}</div>
            <div className="text-[11px] capitalize text-slate-600">{t.status || "available"} · {t.capacity || 4}p</div>
          </button>
        ))}
      </div>
      {!props.tables.length ? <div className="text-sm text-slate-500">No tables yet — create one.</div> : null}
    </div>
  );
}
