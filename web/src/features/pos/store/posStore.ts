import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CartLine,
  ChargeLine,
  DiscountState,
  MenuItemDoc,
  OrderType,
  PaymentLine,
  PaymentMode,
  TaxConfig
} from "../types";
import { computeBillTotals, paidTotal } from "../utils/pricing";
import { num } from "@/lib/utils";

function uid(prefix = "ln") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

const defaultTax: TaxConfig = {
  cgstRate: 2.5,
  sgstRate: 2.5,
  igstRate: 5,
  mode: "exclusive",
  enableIgst: false
};

type PosState = {
  orderId: string | null;
  invoiceNo: string | null;
  orderType: OrderType;
  search: string;
  category: string;
  lines: CartLine[];
  removedStack: CartLine[];
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  tableId: string | null;
  tableName: string | null;
  notes: string;
  kitchenNote: string;
  customerNote: string;
  discount: DiscountState;
  couponCode: string | null;
  charges: ChargeLine[];
  payments: PaymentLine[];
  tax: TaxConfig;
  maxDiscountPct: number;
  roundOffEnabled: boolean;
  recentIds: string[];
  favoriteIds: string[];
  toast: string | null;

  setSearch: (v: string) => void;
  setCategory: (v: string) => void;
  setOrderType: (v: OrderType) => void;
  setTaxConfig: (t: Partial<TaxConfig> & { maxDiscountPct?: number; roundOffEnabled?: boolean }) => void;
  setCustomer: (c: { id?: string | null; name?: string | null; phone?: string | null } | null) => void;
  setTable: (t: { id?: string | null; name?: string | null } | null) => void;
  setNotes: (notes: string, kitchenNote?: string, customerNote?: string) => void;
  setDiscount: (d: DiscountState) => void;
  setCouponCode: (code: string | null) => void;
  addCharge: (c: Omit<ChargeLine, "id">) => void;
  removeCharge: (id: string) => void;
  addPayment: (mode: PaymentMode, amount: number, reference?: string) => void;
  clearPayments: () => void;
  addProduct: (item: MenuItemDoc & { id: string }, opts?: { qty?: number; note?: string }) => void;
  addCustomItem: (name: string, price: number) => void;
  setQty: (lineId: string, qty: number) => void;
  bumpQty: (lineId: string, delta: number) => void;
  updateLine: (lineId: string, patch: Partial<CartLine>) => void;
  removeLine: (lineId: string) => void;
  undoRemove: () => void;
  clearCart: () => void;
  loadHeld: (payload: Partial<PosState> & { lines: CartLine[] }) => void;
  markRecent: (menuItemId: string) => void;
  toggleFavorite: (menuItemId: string) => void;
  setToast: (msg: string | null) => void;
  totals: () => ReturnType<typeof computeBillTotals> & { paid: number; balance: number };
};

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      orderId: null,
      invoiceNo: null,
      orderType: "dine_in",
      search: "",
      category: "All",
      lines: [],
      removedStack: [],
      customerId: null,
      customerName: null,
      customerPhone: null,
      tableId: null,
      tableName: null,
      notes: "",
      kitchenNote: "",
      customerNote: "",
      discount: { type: "none", value: 0 },
      couponCode: null,
      charges: [],
      payments: [],
      tax: defaultTax,
      maxDiscountPct: 20,
      roundOffEnabled: true,
      recentIds: [],
      favoriteIds: [],
      toast: null,

      setSearch: (v) => set({ search: v }),
      setCategory: (v) => set({ category: v }),
      setOrderType: (v) => set({ orderType: v }),
      setTaxConfig: (t) =>
        set((s) => ({
          tax: { ...s.tax, ...t },
          maxDiscountPct: t.maxDiscountPct ?? s.maxDiscountPct,
          roundOffEnabled: t.roundOffEnabled ?? s.roundOffEnabled
        })),
      setCustomer: (c) =>
        set({
          customerId: c?.id ?? null,
          customerName: c?.name ?? null,
          customerPhone: c?.phone ?? null
        }),
      setTable: (t) => set({ tableId: t?.id ?? null, tableName: t?.name ?? null }),
      setNotes: (notes, kitchenNote, customerNote) =>
        set((s) => ({
          notes,
          kitchenNote: kitchenNote ?? s.kitchenNote,
          customerNote: customerNote ?? s.customerNote
        })),
      setDiscount: (d) => set({ discount: d }),
      setCouponCode: (code) => set({ couponCode: code }),
      addCharge: (c) => set((s) => ({ charges: [...s.charges, { ...c, id: uid("ch") }] })),
      removeCharge: (id) => set((s) => ({ charges: s.charges.filter((x) => x.id !== id) })),
      addPayment: (mode, amount, reference) =>
        set((s) => ({
          payments: [
            ...s.payments,
            { id: uid("pay"), mode, amount: num(amount), reference, paidAt: new Date().toISOString() }
          ]
        })),
      clearPayments: () => set({ payments: [] }),

      addProduct: (item, opts) => {
        const qty = Math.max(1, Math.floor(num(opts?.qty) || 1));
        set((s) => {
          const existing = s.lines.find((l) => l.menuItemId === item.id && !l.complimentary && !l.note && !opts?.note);
          let lines: CartLine[];
          if (existing) {
            lines = s.lines.map((l) => (l.lineId === existing.lineId ? { ...l, qty: l.qty + qty } : l));
          } else {
            lines = [
              ...s.lines,
              {
                lineId: uid(),
                menuItemId: item.id,
                name: item.name,
                nameHi: item.nameHi,
                price: num(item.price),
                qty,
                note: opts?.note || "",
                taxRate: num(item.taxRate) || s.tax.cgstRate + s.tax.sgstRate,
                hsnCode: item.hsnCode,
                diet: item.diet,
                category: item.category
              }
            ];
          }
          const recentIds = [item.id, ...s.recentIds.filter((id) => id !== item.id)].slice(0, 24);
          return { lines, recentIds };
        });
      },

      addCustomItem: (name, price) =>
        set((s) => ({
          lines: [
            ...s.lines,
            {
              lineId: uid(),
              menuItemId: `custom_${uid()}`,
              name: name.trim() || "Custom item",
              price: Math.max(0, num(price)),
              qty: 1,
              isCustom: true,
              taxRate: s.tax.cgstRate + s.tax.sgstRate
            }
          ]
        })),

      setQty: (lineId, qty) =>
        set((s) => ({
          lines: s.lines
            .map((l) => (l.lineId === lineId ? { ...l, qty: Math.max(0, Math.floor(num(qty))) } : l))
            .filter((l) => l.qty > 0)
        })),

      bumpQty: (lineId, delta) => {
        const line = get().lines.find((l) => l.lineId === lineId);
        if (!line) return;
        get().setQty(lineId, line.qty + delta);
      },

      updateLine: (lineId, patch) =>
        set((s) => ({ lines: s.lines.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)) })),

      removeLine: (lineId) =>
        set((s) => {
          const line = s.lines.find((l) => l.lineId === lineId);
          if (!line) return s;
          return {
            lines: s.lines.filter((l) => l.lineId !== lineId),
            removedStack: [line, ...s.removedStack].slice(0, 20)
          };
        }),

      undoRemove: () =>
        set((s) => {
          const [first, ...rest] = s.removedStack;
          if (!first) return s;
          return { lines: [...s.lines, first], removedStack: rest };
        }),

      clearCart: () =>
        set({
          orderId: null,
          invoiceNo: null,
          lines: [],
          removedStack: [],
          discount: { type: "none", value: 0 },
          couponCode: null,
          charges: [],
          payments: [],
          notes: "",
          kitchenNote: "",
          customerNote: "",
          customerId: null,
          customerName: null,
          customerPhone: null,
          tableId: null,
          tableName: null
        }),

      loadHeld: (payload) =>
        set((s) => ({
          ...s,
          orderId: payload.orderId ?? null,
          invoiceNo: payload.invoiceNo ?? null,
          orderType: payload.orderType || s.orderType,
          lines: payload.lines || [],
          customerId: payload.customerId ?? null,
          customerName: payload.customerName ?? null,
          customerPhone: payload.customerPhone ?? null,
          tableId: payload.tableId ?? null,
          tableName: payload.tableName ?? null,
          notes: payload.notes || "",
          kitchenNote: payload.kitchenNote || "",
          customerNote: payload.customerNote || "",
          discount: payload.discount || { type: "none", value: 0 },
          couponCode: payload.couponCode ?? null,
          charges: payload.charges || [],
          payments: []
        })),

      markRecent: (menuItemId) =>
        set((s) => ({ recentIds: [menuItemId, ...s.recentIds.filter((id) => id !== menuItemId)].slice(0, 24) })),

      toggleFavorite: (menuItemId) =>
        set((s) => ({
          favoriteIds: s.favoriteIds.includes(menuItemId)
            ? s.favoriteIds.filter((id) => id !== menuItemId)
            : [...s.favoriteIds, menuItemId]
        })),

      setToast: (msg) => set({ toast: msg }),

      totals: () => {
        const s = get();
        const t = computeBillTotals({
          lines: s.lines,
          discount: s.discount,
          couponCode: s.couponCode,
          charges: s.charges,
          tax: s.tax,
          taxMode: s.tax.mode,
          maxDiscountPct: s.maxDiscountPct,
          roundOffEnabled: s.roundOffEnabled
        });
        const paid = paidTotal(s.payments);
        return { ...t, paid, balance: Math.max(0, Math.round((t.total - paid) * 100) / 100) };
      }
    }),
    {
      name: "kg_pos_v1",
      partialize: (s) => ({
        recentIds: s.recentIds,
        favoriteIds: s.favoriteIds,
        orderType: s.orderType
      })
    }
  )
);
