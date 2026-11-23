import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { AnimatePresence, motion } from "framer-motion";
import {
  PauseCircle,
  QrCode,
  RotateCcw,
  Search,
  Users,
  UtensilsCrossed
} from "lucide-react";
import { clsx } from "clsx";
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
import { PageLoading } from "@/components/ui/Loading";
import { BRAND } from "@/lib/brand";

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
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        Boolean(target?.isContentEditable);

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "enter") {
        e.preventDefault();
        void onCharge();
        return;
      }
      if (typing) return;
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
    return <PageLoading label="Loading POS…" />;
  }
  if (!canAccessPos(role)) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Operations" title="POS" />
        <EmptyState
          title="POS access denied"
          description={`Your role (${role}) cannot open billing.`}
          action={
            <Link to="/" className="kg-btn kg-btn-secondary">
              Back to dashboard
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      {/* Slim POS toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 px-3 py-2 shadow-panel">
        <div className="mr-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{BRAND.restaurantName}</div>
          <div className="text-[15px] font-bold leading-tight text-text-primary">POS Billing</div>
        </div>

        <div className="flex flex-wrap gap-1">
          {ORDER_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => store.setOrderType(t.id)}
              className={clsx(
                "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold",
                store.orderType === t.id
                  ? "bg-primary text-white"
                  : "border border-stroke-0 bg-bg-1 text-text-secondary hover:border-primary/35"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Link to="/orders" className="kg-btn kg-btn-secondary !py-1.5 !text-[12px]">
            Orders
          </Link>
          <Link to="/kds" className="kg-btn kg-btn-secondary !py-1.5 !text-[12px]">
            Kitchen
          </Link>
          <button type="button" className="kg-btn kg-btn-secondary !p-2" title="Held bills" onClick={() => setShowHeld(true)}>
            <PauseCircle size={15} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {banner ? (
          <motion.div className="shrink-0" initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] font-medium text-primary">{banner}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid min-h-0 flex-1 gap-2 overflow-hidden lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.85fr)]">
        {/* LEFT — catalog */}
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 p-2.5 shadow-panel">
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <div className="relative min-w-[200px] flex-1">
              <Search
                size={15}
                strokeWidth={2}
                className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-text-muted"
                aria-hidden
              />
              <input
                ref={searchRef}
                value={store.search}
                onChange={(e) => store.setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleBarcodeOrSearchSubmit();
                }}
                placeholder="Search item or barcode"
                aria-label="Search item or barcode"
                className="kg-input !bg-bg-1 !py-2 !pl-9 !pr-10 text-[13px]"
              />
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-stroke-0 bg-card-0 px-1.5 py-0.5 text-[10px] font-semibold text-text-muted sm:inline-block">
                /
              </kbd>
            </div>
            <button type="button" className="kg-btn kg-btn-secondary !px-2.5 !py-2" onClick={() => void handleBarcodeOrSearchSubmit()} title="Scan barcode" aria-label="Scan barcode">
              <QrCode size={15} aria-hidden />
            </button>
            <button type="button" className="kg-btn kg-btn-secondary !px-2.5 !py-2 text-[12px]" onClick={() => setShowCustomer(true)}>
              <Users size={14} aria-hidden />
              <span className="max-w-[88px] truncate">{store.customerName || "Customer"}</span>
            </button>
            <button type="button" className="kg-btn kg-btn-secondary !px-2.5 !py-2 text-[12px]" onClick={() => setShowTable(true)}>
              <UtensilsCrossed size={14} aria-hidden />
              <span className="max-w-[72px] truncate">{store.tableName || "Table"}</span>
            </button>
          </div>

          <div className="mt-2 flex shrink-0 gap-1 overflow-x-auto pb-0.5">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => store.setCategory(c)}
                className={clsx(
                  "shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold",
                  store.category === c
                    ? "bg-primary text-white"
                    : "border border-stroke-0 bg-bg-1 text-text-secondary hover:border-primary/35"
                )}
              >
                {c}
              </button>
            ))}
          </div>

          {menuError ? (
            <div className="mt-2 shrink-0 rounded-lg border border-red-200 bg-danger-bg p-2 text-[12px] text-danger">{menuError}</div>
          ) : null}

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-0.5 kg-hide-scrollbar">
            <ProductGrid
              items={filtered}
              favoriteIds={store.favoriteIds}
              loading={menuLoading}
              totalMenuCount={sortedMenu.length}
              search={store.search}
              category={store.category}
              onAdd={(item) => store.addProduct(item)}
              onToggleFavorite={(id) => store.toggleFavorite(id)}
              onClearSearch={() => store.setSearch("")}
              onResetCategory={() => store.setCategory("All")}
            />
          </div>
        </section>

        {/* RIGHT — cart scrolls alone; totals + pay stay below (no overlap) */}
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 shadow-panel">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stroke-0 px-2.5 py-2">
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-text-primary">Current cart</div>
              <div className="truncate text-[11px] text-text-muted">
                {store.lines.reduce((s, l) => s + l.qty, 0)} items · {store.customerName || "Walk-in"}
                {store.tableName ? ` · ${store.tableName}` : ""} · {store.orderType.replace("_", " ")}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" className="kg-btn kg-btn-secondary !p-1.5" title="Undo" onClick={() => store.undoRemove()}>
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                className="kg-btn !border-danger/30 !p-1.5 !text-danger hover:!bg-danger-bg"
                title="Clear cart"
                onClick={() => {
                  if (store.lines.length && confirm("Clear cart?")) store.clearCart();
                }}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2 kg-hide-scrollbar">
            <CartLines
              lines={store.lines}
              onBump={(id, d) => store.bumpQty(id, d)}
              onRemove={(id) => store.removeLine(id)}
              onEditNote={(id, note) => store.updateLine(id, { note })}
            />
          </div>

          <div className="flex max-h-[55%] shrink-0 flex-col overflow-y-auto overscroll-contain border-t border-stroke-0 bg-card-0 kg-hide-scrollbar">
          <div className="space-y-2 px-2.5 py-2">
            <div className="space-y-0.5 text-[12px]">
              <Row label="Subtotal" value={inr(totals.subtotal)} />
              {totals.itemDiscountTotal > 0 ? <Row label="Item discounts" value={`- ${inr(totals.itemDiscountTotal)}`} /> : null}
              {totals.billDiscount > 0 ? <Row label="Bill discount" value={`- ${inr(totals.billDiscount)}`} /> : null}
              {totals.couponDiscount > 0 ? <Row label="Coupon" value={`- ${inr(totals.couponDiscount)}`} /> : null}
              <Row label="Tax (CGST+SGST)" value={inr(totals.cgst + totals.sgst)} />
              {totals.igst > 0 ? <Row label="IGST" value={inr(totals.igst)} /> : null}
              {totals.chargesTotal > 0 ? <Row label="Charges" value={inr(totals.chargesTotal)} /> : null}
              {totals.roundOff ? <Row label="Round off" value={inr(totals.roundOff)} /> : null}
              <div className="flex items-center justify-between rounded-lg bg-primary-light px-2.5 py-2 text-[14px] font-bold text-text-primary">
                <span>Grand total</span>
                <span className="tabular-nums text-primary">{inr(totals.total)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-text-muted">
                <span>Paid {inr(totals.paid)}</span>
                <span>Balance {inr(totals.balance)}</span>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
              <input className="kg-input !py-1.5 !text-[12px]" placeholder="Disc %" value={discPct} onChange={(e) => setDiscPct(e.target.value)} />
              <input className="kg-input !py-1.5 !text-[12px]" placeholder="Reason" value={discReason} onChange={(e) => setDiscReason(e.target.value)} />
              <button
                type="button"
                className="kg-btn kg-btn-primary !px-2.5 !text-[12px]"
                onClick={() => store.setDiscount({ type: "percent", value: Number(discPct) || 0, reason: discReason })}
              >
                Apply
              </button>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-1.5">
              <input
                className="kg-input !py-1.5 !text-[12px] uppercase"
                placeholder="Coupon"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
              />
              <button type="button" className="kg-btn kg-btn-secondary !text-[12px]" onClick={() => store.setCouponCode(couponInput.trim() || null)}>
                Coupon
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              <button type="button" className="rounded-lg border border-stroke-0 bg-bg-1 px-1 py-1.5 text-[10px] font-semibold text-text-secondary hover:border-primary/35" onClick={() => store.addCharge({ label: "Packing", amount: 10, type: "packing" })}>
                +Pack
              </button>
              <button type="button" className="rounded-lg border border-stroke-0 bg-bg-1 px-1 py-1.5 text-[10px] font-semibold text-text-secondary hover:border-primary/35" onClick={() => store.addCharge({ label: "Delivery", amount: 30, type: "delivery" })}>
                +Deliv
              </button>
              <button type="button" className="rounded-lg border border-stroke-0 bg-bg-1 px-1 py-1.5 text-[10px] font-semibold text-text-secondary hover:border-primary/35" onClick={() => store.addCharge({ label: "Service", amount: Math.round(totals.subtotal * 0.05), type: "service" })}>
                +Svc
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-stroke-0 bg-bg-1 px-1 py-1.5 text-[10px] font-semibold text-text-secondary hover:border-primary/35 disabled:opacity-50"
                onClick={() => void onHold()}
              >
                Hold
              </button>
            </div>

            {canManualPrice(role) ? (
              <button
                type="button"
                className="w-full rounded-lg border border-dashed border-stroke-1 py-1.5 text-[11px] font-semibold text-text-secondary hover:bg-bg-1"
                onClick={() => {
                  const name = prompt("Custom item name");
                  const price = Number(prompt("Price") || 0);
                  if (name) store.addCustomItem(name, price);
                }}
              >
                + Custom item
              </button>
            ) : null}

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={busy || store.lines.length < 2}
                className="kg-btn kg-btn-secondary !py-2 !text-[12px] disabled:opacity-50"
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
                Split bill
              </button>
              <button type="button" className="kg-btn kg-btn-secondary !py-2 !text-[12px]" onClick={() => setShowHeld(true)}>
                Held bills
              </button>
            </div>
          </div>

          <div className="border-t border-stroke-0 px-2.5 pb-2.5 pt-2">
            <PaymentPanel busy={busy} onCharge={onCharge} />
          </div>
          </div>
        </aside>
      </div>

      {showHeld ? (
        <Modal title="Held bills" onClose={() => setShowHeld(false)}>
          <div className="space-y-2">
            {heldOrders.map((o) => (
              <button
                key={o.id}
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-stroke-0 px-3 py-2 text-left text-[13px] hover:bg-bg-1 bg-bg-1 text-text-primary"
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
            {!heldOrders.length ? <div className="text-[13px] text-text-muted">No held bills</div> : null}
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
    <div className="flex justify-between text-text-secondary">
      <span>{label}</span>
      <span className="font-semibold text-text-primary">{value}</span>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-text-primary/40 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-[var(--radius-xl)] bg-card-0 p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-bold">{title}</div>
          <button type="button" className="text-[13px] text-text-muted" onClick={onClose}>
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
        <button type="button" className="kg-btn kg-btn-secondary" onClick={props.onWalkIn}>
          Walk-in
        </button>
        <button type="button" className="kg-btn kg-btn-secondary" onClick={props.onGuest}>
          Guest
        </button>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <input className="kg-input !w-auto" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="kg-input !w-auto" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button
          type="button"
          className="kg-btn kg-btn-primary"
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
            className="flex w-full justify-between rounded-lg border border-stroke-0 px-3 py-2 text-left text-[13px] hover:bg-bg-1 bg-bg-1 text-text-primary"
            onClick={() => props.onPick(c)}
          >
            <span>
              {c.name}
              {c.phone ? ` · ${c.phone}` : ""}
            </span>
            <span className="text-xs text-text-muted">
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
      <button type="button" className="kg-btn kg-btn-secondary" onClick={() => void props.onCreate()}>
        + New table
      </button>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {props.tables.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => props.onPick(t)}
            className={`rounded-[var(--radius-xl)] border p-3 text-left ${
              t.status === "occupied"
                ? "border-danger/30 bg-danger-bg"
                : t.status === "reserved"
                  ? "border-warning/30 bg-warning-bg"
                  : t.status === "cleaning"
                    ? "border-stroke-0 bg-bg-1"
                    : "border-success/30 bg-success-bg"
            }`}
          >
            <div className="font-bold">{t.name}</div>
            <div className="text-[11px] capitalize text-text-secondary">{t.status || "available"} · {t.capacity || 4}p</div>
          </button>
        ))}
      </div>
      {!props.tables.length ? <div className="text-[13px] text-text-muted">No tables yet — create one.</div> : null}
    </div>
  );
}
