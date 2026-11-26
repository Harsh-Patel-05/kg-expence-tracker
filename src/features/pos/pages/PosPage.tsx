import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import {
  RotateCcw,
  Search
} from "lucide-react";
import { clsx } from "clsx";
import { inr, num } from "@/lib/utils";
import { useRestaurantCollection } from "../hooks/useRestaurantCollection";
import type { CouponDoc, MenuItemDoc, OrderType } from "../types";
import { usePosStore } from "../store/posStore";
import { usePosAuth } from "../auth/PosAuthProvider";
import { ProductGrid, type PosGridItem } from "../components/ProductGrid";
import { CartLines } from "../components/CartLines";
import { PaymentPanel } from "../components/PaymentPanel";
import { QuickPickModal } from "../components/QuickPickModal";
import { PunjabiSelectModal, type PunjabiSelection } from "../components/PunjabiSelectModal";
import {
  cancelOrder,
  chargeCurrentBill,
  collectUnpaidOrder,
  deliverPaidOrder,
  payLaterCurrentBill
} from "../services/checkout";
import { PosKdsStrip } from "../components/PosKdsStrip";
import { PosOnlineOrderAlert } from "../components/PosOnlineOrderAlert";
import { PosOnlineOrderingSwitch } from "../components/PosOnlineOrderingSwitch";
import { installOnlineOrderSoundAutoUnlock } from "../utils/onlineOrderSound";
import { getPosSettings, needsShopCollect } from "../services/posFirestore";
import type { PosSettingsDoc } from "../types";
import { buildLastPosBillPayload, getLastPosBill, setLastPosBill } from "../utils/lastPosBill";
import { type WhatsAppBillPayload, type WhatsAppShopSettings } from "../utils/whatsappBill";
import { WhatsAppShareModal } from "../components/WhatsAppShareModal";
import { liveOrderToWhatsAppBill } from "../utils/orderToWhatsAppBill";
// liveOrderToWhatsAppBill used when sharing from kitchen strip / history callbacks
import {
  connectThermalPrinter,
  disconnectThermalPrinter,
  printLastBillThermal,
  thermalPrinterConnected,
  thermalPrinterSupported,
  tryReconnectThermalPrinter
} from "../utils/thermalPrinter";
import { canAccessPos, canManualPrice } from "../utils/permissions";
import { PageLoading } from "@/components/ui/Loading";
import { BRAND } from "@/lib/brand";
import type { LiveOrder } from "@/features/orders/hooks/useLiveOrders";
import { updateKitchenStatus } from "@/features/orders/services/orderEngine";
import {
  defaultSelection,
  getProducts,
  isSingleConfig,
  shouldHideLegacyItem
} from "../domain/productsCatalog";
import {
  deriveBaseAndVariant,
  findGroupForMenuItem,
  groupMenuItems,
  isExtraSabjiItem,
  isPunjabiCategory,
  type MenuGroup
} from "../domain/menuGrouping";
import type { CatalogProduct } from "../domain/productPricing";
import type { ProductSelection } from "../domain/productPricing";

const ORDER_TYPES: Array<{ id: OrderType; label: string }> = [
  { id: "takeaway", label: "Takeaway" },
  { id: "swiggy", label: "Swiggy" },
  { id: "zomato", label: "Zomato" }
];

function isSnacksCategory(cat: string) {
  return String(cat || "").trim().toLowerCase() === "snacks";
}

const HIDDEN_FILTER_CATEGORIES = new Set(["hotshots", "beverages", "general", "snacks"]);

function isHiddenFilterCategory(cat: string) {
  return HIDDEN_FILTER_CATEGORIES.has(String(cat || "").trim().toLowerCase());
}

export function PosPage() {
  const { role, loading: authLoading } = usePosAuth();
  const searchRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [discAmt, setDiscAmt] = useState("");
  const [discReason, setDiscReason] = useState("");
  const [quickPick, setQuickPick] = useState<CatalogProduct | null>(null);
  const [punjabiPick, setPunjabiPick] = useState<MenuGroup | null>(null);
  const [cartFocusId, setCartFocusId] = useState<string | null>(null);
  const [posSettings, setPosSettings] = useState<(PosSettingsDoc & { id: string }) | null>(null);
  const [thermalReady, setThermalReady] = useState(() => thermalPrinterConnected());
  const [waBill, setWaBill] = useState<WhatsAppBillPayload | null>(null);
  const store = usePosStore();
  const {
    data: menuItems,
    loading: menuLoading,
    error: menuError
  } = useRestaurantCollection<MenuItemDoc>({ path: "menuItems" });
  const { data: coupons } = useRestaurantCollection<CouponDoc>({ path: "coupons" });

  const sortedMenu = useMemo(
    () => [...menuItems].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [menuItems]
  );

  const punjabiGroups = useMemo(
    () =>
      groupMenuItems(
        sortedMenu.filter(
          (m) =>
            isPunjabiCategory(String(m.category || "")) &&
            !shouldHideLegacyItem(m.name) &&
            !isExtraSabjiItem(m.name)
        )
      ),
    [sortedMenu]
  );

  useEffect(() => {
    installOnlineOrderSoundAutoUnlock();
  }, []);

  useEffect(() => {
    void getPosSettings()
      .then((s) => {
        setPosSettings(s);
        store.setTaxConfig({
          cgstRate: 0,
          sgstRate: 0,
          igstRate: 0,
          mode: "exclusive",
          enableIgst: false,
          maxDiscountPct: s.maxDiscountPct,
          roundOffEnabled: s.roundOffEnabled
        });
      })
      .catch(() => undefined);
    void tryReconnectThermalPrinter().then(() => setThermalReady(thermalPrinterConnected()));
    if (store.orderType === "direct" || store.orderType === "dine_in" || store.orderType === "delivery") {
      store.setOrderType("takeaway");
    }
    if (isHiddenFilterCategory(store.category) || store.category === "Hotshots") store.setCategory("All");
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!store.lines.length) {
      setCartFocusId(null);
      return;
    }
    if (!cartFocusId || !store.lines.some((l) => l.lineId === cartFocusId)) {
      setCartFocusId(store.lines[store.lines.length - 1]?.lineId || null);
    }
  }, [store.lines, cartFocusId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        Boolean(target?.isContentEditable);
      const modalOpen = Boolean(quickPick || punjabiPick);

      if (e.key === "/" && !typing && !modalOpen) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "enter" && !modalOpen) {
        e.preventDefault();
        void onCharge();
        return;
      }
      if (typing || modalOpen) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        store.undoRemove();
        return;
      }

      const lines = store.lines;
      if (!lines.length) return;

      const idx = Math.max(
        0,
        lines.findIndex((l) => l.lineId === cartFocusId)
      );

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(0, idx - 1);
        setCartFocusId(lines[next].lineId);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(lines.length - 1, idx + 1);
        setCartFocusId(lines[next].lineId);
        return;
      }

      const focusId = cartFocusId || lines[lines.length - 1]?.lineId;
      if (!focusId) return;

      if (e.key === "+" || e.key === "=" || e.key === "ArrowRight") {
        e.preventDefault();
        store.bumpQty(focusId, 1);
        return;
      }
      if (e.key === "-" || e.key === "_" || e.key === "ArrowLeft") {
        e.preventDefault();
        store.bumpQty(focusId, -1);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        store.removeLine(focusId);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const catalogProducts = useMemo(() => getProducts(), []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    catalogProducts.forEach((p) =>
      p.categories.forEach((c) => {
        if (!isHiddenFilterCategory(c)) set.add(c);
      })
    );
    sortedMenu.forEach((m) => {
      const cat = String(m.category || "General");
      if (!shouldHideLegacyItem(m.name) && !isHiddenFilterCategory(cat)) set.add(cat);
    });
    return ["All", "Favorites", "Recent", ...[...set].sort()];
  }, [sortedMenu, catalogProducts]);

  const filtered = useMemo(() => {
    const q = store.search.trim().toLowerCase();
    const items: PosGridItem[] = [];

    const catalogMatch = (p: CatalogProduct) => {
      if (!q) return true;
      const blob = `${p.name} ${(p.aliases || []).join(" ")} ${p.categories.join(" ")}`.toLowerCase();
      return blob.includes(q);
    };

    let catalogs = catalogProducts.filter(
      (p) => catalogMatch(p) && !p.categories.some(isSnacksCategory)
    );
    if (store.category === "Favorites") {
      catalogs = catalogs.filter((p) => store.favoriteIds.includes(`product:${p.id}`) || p.favourite);
    } else if (store.category === "Hotshots") {
      catalogs = catalogs.filter((p) => p.favourite);
    } else if (store.category === "Recent") {
      catalogs = catalogs.filter((p) => store.recentIds.includes(`product:${p.id}`));
    } else if (store.category !== "All") {
      catalogs = catalogs.filter((p) => p.categories.includes(store.category));
    }
    catalogs.forEach((product) => items.push({ kind: "catalog", product }));

    let groups = punjabiGroups.slice();
    if (store.category === "Favorites") {
      groups = groups.filter(
        (g) =>
          store.favoriteIds.includes(`group:${g.key}`) ||
          g.favorite ||
          g.variants.some((v) => store.favoriteIds.includes(v.id))
      );
    } else if (store.category === "Hotshots") {
      groups = [];
    } else if (store.category === "Recent") {
      groups = groups.filter((g) => g.variants.some((v) => store.recentIds.includes(v.id)));
    } else if (store.category !== "All" && store.category !== "Punjabi") {
      groups = [];
    }
    if (q) {
      groups = groups.filter((g) => {
        const blob = `${g.baseName} ${g.nameHi || ""} ${g.variants.map((v) => v.name).join(" ")}`.toLowerCase();
        return blob.includes(q);
      });
    }
    groups.forEach((group) => items.push({ kind: "group", group }));

    let menu = sortedMenu.filter(
      (m) =>
        m.available !== false &&
        !shouldHideLegacyItem(m.name) &&
        !isExtraSabjiItem(m.name) &&
        !isPunjabiCategory(String(m.category || "General")) &&
        !isSnacksCategory(String(m.category || "General"))
    );
    if (store.category === "Favorites") menu = menu.filter((m) => store.favoriteIds.includes(m.id) || m.favorite);
    else if (store.category === "Hotshots") menu = [];
    else if (store.category === "Recent") menu = menu.filter((m) => store.recentIds.includes(m.id));
    else if (store.category !== "All") menu = menu.filter((m) => String(m.category || "General") === store.category);
    if (q) {
      menu = menu.filter((m) => {
        const blob = `${m.name} ${m.nameHi || ""} ${m.barcode || ""} ${m.qrCode || ""}`.toLowerCase();
        return blob.includes(q);
      });
    }
    menu.forEach((item) => items.push({ kind: "menu", item }));
    return items;
  }, [sortedMenu, catalogProducts, punjabiGroups, store.search, store.category, store.favoriteIds, store.recentIds]);

  const totals = store.totals();

  async function handleBarcodeOrSearchSubmit() {
    const q = store.search.trim();
    if (!q) return;
    const byBarcode = sortedMenu.find(
      (m) => String(m.barcode || "") === q || String(m.qrCode || "") === q || String(m.id) === q
    );
    if (byBarcode) {
      if (isPunjabiCategory(String(byBarcode.category || ""))) {
        const group = findGroupForMenuItem(punjabiGroups, byBarcode);
        if (group) {
          setPunjabiPick(group);
          store.setSearch("");
          return;
        }
      }
      store.addProduct(byBarcode);
      store.setSearch("");
      return;
    }
  }

  function openPunjabiGroup(group: MenuGroup) {
    setPunjabiPick(group);
  }

  function addPunjabiSelection(selection: PunjabiSelection) {
    const { variant, prep, qty } = selection;
    const baseEn = punjabiPick?.baseName || deriveBaseAndVariant(variant.name).base || variant.name;
    const baseHi = String(punjabiPick?.nameHi || variant.nameHi || "").trim();
    const sizeLabel = variant.sizeLabel && variant.sizeLabel !== "Regular" ? variant.sizeLabel : "";
    const prepLabel = prep === "swaminarayan" ? "Swaminarayan" : "";
    const detailParts = [sizeLabel, prepLabel].filter(Boolean);
    const detail = detailParts.join(" · ");
    const name = detail ? `${baseEn} · ${detail}` : baseEn;
    store.addProduct(
      {
        ...variant,
        name,
        nameHi: baseHi || undefined,
        nameHead: baseEn,
        nameSub: detail
      } as typeof variant & { nameHead?: string; nameSub?: string },
      {
        qty,
        note: prep === "swaminarayan" ? "Swaminarayan" : ""
      }
    );
    setPunjabiPick(null);
  }

  function onEditKitchenOrder(o: LiveOrder) {
    store.loadHeld({
      orderId: o.id,
      invoiceNo: o.invoiceNo || null,
      tokenNumber: o.tokenNumber || null,
      platformOrderId: o.platformOrderId || null,
      kotVersion: num(o.kotVersion) || null,
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
    setBanner(`Editing #${o.tokenNumber || o.invoiceNo || o.id.slice(0, 6)} · update items then Settle or Pay later`);
  }

  async function onCancelKitchenOrder(o: LiveOrder) {
    try {
      setBusy(true);
      await cancelOrder(o.id, "Cancelled from POS kitchen strip", role);
      if (store.orderId === o.id) store.clearCart();
      setBanner(`Cancelled #${o.tokenNumber || o.invoiceNo || o.id.slice(0, 6)}`);
    } catch (e: any) {
      setBanner(e?.message || "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPayLater() {
    try {
      setBusy(true);
      setBanner(null);
      const live = usePosStore.getState();
      try {
        live.recordSuggestionsFromCart();
      } catch {
        /* non-blocking */
      }
      const res = await payLaterCurrentBill(live, role);
      live.clearCart();
      setDiscAmt("");
      setDiscReason("");
      const noteBit = res.notes.length ? ` · Notes: ${res.notes.join(" · ")}` : "";
      setBanner(`Sent to kitchen · #${res.tokenNumber} (${res.invoiceNo}) · Pay later ${inr(res.totals.total)}${noteBit}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e || "Pay later failed");
      console.error("Pay later failed", e);
      setBanner(msg || "Pay later failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCollectKitchen(
    o: LiveOrder,
    args: { mode?: "cash" | "upi"; cash?: number; upi?: number }
  ) {
    try {
      setBusy(true);
      const laneReady =
        o.kitchenStatus === "ready" || o.kitchenStatus === "packed" || o.status === "ready" || o.status === "packed";
      const res = await collectUnpaidOrder({
        orderId: o.id,
        mode: args.mode,
        cash: args.cash,
        upi: args.upi,
        role,
        markServed: laneReady
      });
      setBanner(
        res.balanceDue > 0.01
          ? `Collected ${inr(res.amount)} · still due ${inr(res.balanceDue)}`
          : laneReady
            ? `Paid & delivered · #${o.tokenNumber || res.invoiceNo || o.id.slice(0, 6)} · ${inr(res.amount)}`
            : `Paid ${inr(res.amount)} · #${o.tokenNumber || res.invoiceNo || o.id.slice(0, 6)}`
      );
    } catch (e: any) {
      setBanner(e?.message || "Collect failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDeliverKitchen(o: LiveOrder) {
    try {
      setBusy(true);
      await deliverPaidOrder(o.id, role);
      setBanner(`Delivered #${o.tokenNumber || o.invoiceNo || o.id.slice(0, 6)}`);
    } catch (e: any) {
      setBanner(e?.message || "Deliver failed");
    } finally {
      setBusy(false);
    }
  }

  async function onMarkKitchenReady(o: LiveOrder) {
    try {
      setBusy(true);
      await updateKitchenStatus({ orderId: o.id, toStatus: "ready", role });
      setBanner(
        isUnpaidOrder(o)
          ? `Ready #${o.tokenNumber || o.invoiceNo || o.id.slice(0, 6)} · collect unpaid ${inr(o.balanceDue || o.total)}`
          : `Ready #${o.tokenNumber || o.invoiceNo || o.id.slice(0, 6)}${
              String(o.orderType || "").toLowerCase().match(/swiggy|zomato/) ? " · platform kitchen" : ""
            }`
      );
    } catch (e: any) {
      setBanner(e?.message || "Could not mark ready");
    } finally {
      setBusy(false);
    }
  }

  async function onMarkKitchenPreparing(o: LiveOrder) {
    try {
      setBusy(true);
      await updateKitchenStatus({ orderId: o.id, toStatus: "preparing", role });
      setBanner(`Preparing #${o.tokenNumber || o.invoiceNo || o.id.slice(0, 6)}`);
    } catch (e: any) {
      setBanner(e?.message || "Could not mark preparing");
    } finally {
      setBusy(false);
    }
  }

  function openCatalogProduct(product: CatalogProduct) {
    if (isSingleConfig(product)) {
      const sel = defaultSelection(product);
      if (sel) store.addConfiguredProduct(product, sel);
      return;
    }
    setQuickPick(product);
  }

  function addConfigured(selection: ProductSelection, productOverride?: CatalogProduct | null) {
    const product = productOverride || catalogProducts.find((p) => p.id === selection.productId);
    if (!product) return;
    store.addConfiguredProduct(product, selection);
  }

  function whatsAppShopSettings(): WhatsAppShopSettings {
    return {
      shopName: posSettings?.restaurantName || BRAND.restaurantName,
      address: posSettings?.address,
      phone: posSettings?.phone
    };
  }

  function onWhatsAppBill(bill?: WhatsAppBillPayload | null) {
    const last = bill || getLastPosBill();
    if (!last?.items?.length) {
      setBanner("Settle a bill first, then share on WhatsApp");
      return;
    }
    setWaBill({
      ...last,
      customerName: last.customerName || store.customerName || "",
      customerPhone: last.customerPhone || store.customerPhone || ""
    });
  }

  async function onThermalConnect() {
    try {
      setBusy(true);
      if (thermalPrinterConnected()) await disconnectThermalPrinter();
      const r = await connectThermalPrinter();
      setThermalReady(thermalPrinterConnected());
      setBanner(`Printer connected: ${r.name}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not connect printer";
      setBanner(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onPrintLastBill() {
    const last = getLastPosBill();
    if (!last) {
      setBanner("Settle a bill first");
      return;
    }
    if (!thermalPrinterSupported()) {
      setBanner("Bluetooth printing not supported in this browser (use Chrome)");
      return;
    }
    try {
      setBusy(true);
      if (!thermalPrinterConnected()) {
        const re = await tryReconnectThermalPrinter();
        if (!re) throw new Error("Connect thermal printer first");
        setThermalReady(thermalPrinterConnected());
      }
      await printLastBillThermal(last, posSettings?.restaurantName || BRAND.restaurantName);
      setBanner("Last bill sent to thermal printer");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Print failed";
      setBanner(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onCharge() {
    try {
      setBusy(true);
      setBanner(null);
      const live = usePosStore.getState();
      try {
        live.recordSuggestionsFromCart();
      } catch {
        /* non-blocking */
      }
      const res = await chargeCurrentBill({ store: live, role, menuItems: sortedMenu, coupons });
      setLastPosBill(
        buildLastPosBillPayload({
          invoiceNo: res.invoiceNo,
          orderType: live.orderType,
          lines: live.lines,
          customerName: live.customerName,
          customerPhone: live.customerPhone,
          totals: res.totals,
          payments: live.payments
        })
      );
      live.clearCart();
      setDiscAmt("");
      setDiscReason("");
      setBanner(
        `Paid · sent to kitchen · #${res.tokenNumber || res.invoiceNo} · ${inr(res.totals.total)}${
          res.missingRecipes.length ? ` · recipe missing: ${res.missingRecipes.join(", ")}` : ""
        }`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e || "Charge failed");
      console.error("Charge failed", e);
      setBanner(msg || "Charge failed");
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
      <PosOnlineOrderAlert />
      {banner ? (
        <div
          className={clsx(
            "flex shrink-0 items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-[13px] font-semibold shadow-panel",
            /fail|error|denied|required|incomplete|cannot|could not/i.test(banner)
              ? "border-danger/40 bg-danger-bg text-danger"
              : "border-success/35 bg-success-bg text-success"
          )}
          role="status"
        >
          <span className="min-w-0 flex-1 leading-snug">{banner}</span>
          <button
            type="button"
            className="shrink-0 text-[12px] font-bold opacity-70 hover:opacity-100"
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Slim POS toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 px-3 py-2 shadow-panel">
        <div className="mr-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{BRAND.restaurantName}</div>
          <div className="text-[15px] font-bold leading-tight text-text-primary">POS Billing</div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
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
          {store.orderType === "swiggy" || store.orderType === "zomato" ? (
            <input
              className="kg-input !w-[148px] !py-1.5 !text-[12px] font-semibold"
              inputMode="numeric"
              autoComplete="off"
              placeholder={store.orderType === "zomato" ? "Zomato order ID *" : "Swiggy order ID *"}
              value={store.platformOrderId || ""}
              onChange={(e) => store.setPlatformOrderId(e.target.value.replace(/[^\dA-Za-z-]/g, "").slice(0, 24))}
              title="Required — shown on kitchen display"
            />
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <PosOnlineOrderingSwitch />
          <button
            type="button"
            disabled={busy || !thermalPrinterSupported()}
            onClick={() => void onThermalConnect()}
            className="kg-btn kg-btn-secondary !py-1.5 !text-[12px]"
            title={thermalPrinterSupported() ? (thermalReady ? "Reconnect printer" : "Connect thermal printer") : "Use Chrome for Bluetooth printer"}
          >
            {thermalReady ? "Reconnect printer" : "Connect thermal printer"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onWhatsAppBill()}
            className="kg-btn kg-btn-secondary !py-1.5 !text-[12px] kg-pos-wa-btn"
            title="Share last bill on WhatsApp"
          >
            WhatsApp bill
          </button>
          <button
            type="button"
            disabled={busy || !thermalPrinterSupported()}
            onClick={() => void onPrintLastBill()}
            className="kg-btn kg-btn-secondary !py-1.5 !text-[12px]"
            title="Print last settled bill on Bluetooth thermal printer"
          >
            Print last bill
          </button>
          <Link to="/orders" className="kg-btn kg-btn-secondary !py-1.5 !text-[12px]">
            Orders
          </Link>
          <a href="/kds" target="_blank" rel="noopener noreferrer" className="kg-btn kg-btn-secondary !py-1.5 !text-[12px]">
            Kitchen
          </a>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-2 overflow-hidden lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.9fr)]">
        {/* LEFT — kitchen strip + catalog (cart stays full-height on the right) */}
        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
          <PosKdsStrip
            busy={busy}
            onEditOrder={onEditKitchenOrder}
            onCancelOrder={(o) => void onCancelKitchenOrder(o)}
            onCollect={(o, args) => void onCollectKitchen(o, args)}
            onMarkReady={(o) => void onMarkKitchenReady(o)}
            onMarkPreparing={(o) => void onMarkKitchenPreparing(o)}
            onDeliver={(o) => void onDeliverKitchen(o)}
            onShareWhatsApp={(o) => onWhatsAppBill(liveOrderToWhatsAppBill(o))}
          />

          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 p-2.5 shadow-panel">
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
              </div>
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
                totalMenuCount={sortedMenu.length + catalogProducts.length}
                search={store.search}
                category={store.category}
                onAddCatalog={openCatalogProduct}
                onAddMenu={(item) => {
                  if (isPunjabiCategory(String(item.category || ""))) {
                    const group = findGroupForMenuItem(punjabiGroups, item);
                    if (group) {
                      openPunjabiGroup(group);
                      return;
                    }
                  }
                  store.addProduct(item);
                }}
                onAddGroup={openPunjabiGroup}
                onToggleFavorite={(id) => store.toggleFavorite(id)}
                onClearSearch={() => store.setSearch("")}
                onResetCategory={() => store.setCategory("All")}
              />
            </div>
          </section>
        </div>

        {/* RIGHT — full-height cart summary (uses space beside kitchen strip) */}
        <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 shadow-panel">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stroke-0 px-2.5 py-2">
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-text-primary">Current cart</div>
              <div className="truncate text-[11px] capitalize text-text-muted">
                {store.tableName ? `${store.tableName} · ` : ""}
                {store.orderType.replace("_", " ")}
                {store.platformOrderId ? ` · #${store.platformOrderId}` : ""}
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

          <div className="min-h-0 flex-[1.1] overflow-y-auto overscroll-contain border-b border-stroke-0 px-2.5 py-2 kg-hide-scrollbar">
            <CartLines
              lines={store.lines}
              activeLineId={cartFocusId}
              onSelectLine={setCartFocusId}
              onBump={(id, d) => {
                setCartFocusId(id);
                store.bumpQty(id, d);
              }}
              onRemove={(id) => store.removeLine(id)}
              onEditNote={(id, note) => store.updateLine(id, { note })}
            />
          </div>

          <div className="flex min-h-0 flex-[1.35] flex-col overflow-y-auto overscroll-contain bg-card-0 kg-hide-scrollbar">
            <div className="space-y-2 px-2.5 py-2">
              <div className="space-y-0.5 text-[12px]">
                <Row label="Subtotal" value={inr(totals.subtotal)} />
                {totals.itemDiscountTotal > 0 ? <Row label="Item discounts" value={`- ${inr(totals.itemDiscountTotal)}`} /> : null}
                {totals.billDiscount > 0 ? <Row label="Bill discount" value={`- ${inr(totals.billDiscount)}`} /> : null}
                {totals.chargesTotal > 0 ? <Row label="Charges" value={inr(totals.chargesTotal)} /> : null}
                {totals.roundOff ? <Row label="Round off" value={inr(totals.roundOff)} /> : null}
                <div className="flex items-center justify-between rounded-lg bg-primary-light px-2.5 py-2 text-[14px] font-bold text-text-primary">
                  <span>Grand total</span>
                  <span className="tabular-nums text-primary">{inr(totals.total)}</span>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                <input
                  className="kg-input !py-1.5 !text-[12px]"
                  placeholder="Discount ₹"
                  inputMode="decimal"
                  value={discAmt}
                  onChange={(e) => setDiscAmt(e.target.value)}
                />
                <input
                  className="kg-input !py-1.5 !text-[12px]"
                  placeholder="Reason (optional)"
                  value={discReason}
                  onChange={(e) => setDiscReason(e.target.value)}
                />
                <button
                  type="button"
                  className="kg-btn kg-btn-primary !px-2.5 !text-[12px]"
                  onClick={() => {
                    const value = Math.max(0, Number(discAmt) || 0);
                    if (!(value > 0)) {
                      store.setDiscount({ type: "none", value: 0, reason: "" });
                      setDiscAmt("");
                      return;
                    }
                    store.setDiscount({
                      type: "fixed",
                      value,
                      reason: String(discReason || "").trim() || "Bill discount"
                    });
                  }}
                >
                  Apply
                </button>
              </div>
              {store.discount.type === "fixed" && num(store.discount.value) > 0 ? (
                <div className="flex items-center justify-between text-[11px] text-text-secondary">
                  <span>
                    Discount applied: −{inr(store.discount.value)}
                    {store.discount.reason ? ` · ${store.discount.reason}` : ""}
                  </span>
                  <button
                    type="button"
                    className="font-semibold text-danger"
                    onClick={() => {
                      store.setDiscount({ type: "none", value: 0, reason: "" });
                      setDiscAmt("");
                      setDiscReason("");
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : null}

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
            </div>

            <div className="mt-auto border-t border-stroke-0 px-2.5 pb-2.5 pt-2">
              {store.orderType === "swiggy" || store.orderType === "zomato" ? (
                <div className="mb-2">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-text-muted">
                    {store.orderType === "zomato" ? "Zomato order ID" : "Swiggy order ID"}{" "}
                    <span className="text-danger">*</span>
                  </label>
                  <input
                    className={clsx(
                      "kg-input !text-[13px] font-bold",
                      !String(store.platformOrderId || "").trim() && "border-danger/50"
                    )}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Enter platform order ID to settle"
                    value={store.platformOrderId || ""}
                    onChange={(e) => store.setPlatformOrderId(e.target.value.replace(/[^\dA-Za-z-]/g, "").slice(0, 24))}
                  />
                  {!String(store.platformOrderId || "").trim() ? (
                    <div className="mt-1 text-[11px] font-semibold text-danger">
                      Required before Settle / Pay later · shown on KDS
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] text-text-muted">KDS will show #{store.platformOrderId} · 18 min countdown</div>
                  )}
                </div>
              ) : null}
              <PaymentPanel busy={busy} onCharge={onCharge} onPayLater={onPayLater} />
            </div>
          </div>
        </aside>
      </div>

      {quickPick ? (
        <QuickPickModal
          product={quickPick}
          cartProductIds={store.lines.map((l) => l.productId).filter(Boolean) as string[]}
          cartConfigKeys={store.lines.map((l) => l.configKey).filter(Boolean) as string[]}
          onClose={() => setQuickPick(null)}
          onAdd={(selection) => {
            addConfigured(selection, quickPick);
            setQuickPick(null);
          }}
          onAddSuggestion={(selection) => {
            addConfigured(selection);
          }}
        />
      ) : null}

      {punjabiPick ? (
        <PunjabiSelectModal
          group={punjabiPick}
          onClose={() => setPunjabiPick(null)}
          onAdd={addPunjabiSelection}
        />
      ) : null}

      {waBill ? (
        <WhatsAppShareModal
          bill={waBill}
          settings={whatsAppShopSettings()}
          onClose={() => setWaBill(null)}
          onShared={({ name, phone }) => {
            store.setCustomer({ name: name || store.customerName, phone });
            setBanner("WhatsApp opened with bill");
          }}
        />
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

function isUnpaidOrder(o: LiveOrder) {
  return needsShopCollect(o);
}

