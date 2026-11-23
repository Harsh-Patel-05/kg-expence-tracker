import { num } from "@/lib/utils";
import type { PurchaseEntryDoc } from "@/features/inventory/types";
import type { SupplierDoc, SupplierLedgerRow, SupplierPaymentDoc } from "../types";
import type { WithId } from "@/features/pos/hooks/useRestaurantCollection";

export function isPurchasePaid(p: { paidStatus?: string; paymentStatus?: string; status?: string }) {
  const s = String(p?.paidStatus || p?.paymentStatus || p?.status || "")
    .toLowerCase()
    .trim();
  return s === "paid";
}

export function supplierRemaining(
  name: string,
  purchases: Array<{ seller?: string; vendorName?: string; price?: number; total?: number; paidStatus?: string; paymentStatus?: string; status?: string }>,
  payments: Array<{ seller?: string; amount?: number }>
) {
  const buy = purchases
    .filter((p) => String(p.seller || p.vendorName || "").toLowerCase() === name.toLowerCase() && !isPurchasePaid(p))
    .reduce((s, p) => s + num(p.price ?? p.total), 0);
  const paid = payments
    .filter((p) => String(p.seller || "").toLowerCase() === name.toLowerCase())
    .reduce((s, p) => s + num(p.amount), 0);
  return buy - paid;
}

export function buildSupplierLedger(args: {
  suppliers: Array<WithId<SupplierDoc>>;
  purchases: Array<WithId<PurchaseEntryDoc> | PurchaseEntryDoc & { id?: string }>;
  payments: Array<WithId<SupplierPaymentDoc> | SupplierPaymentDoc & { id?: string }>;
  today?: string;
}): SupplierLedgerRow[] {
  const today = args.today || new Date().toISOString().slice(0, 10);
  return args.suppliers
    .filter((s) => !s.isDeleted && !s.archived)
    .map((s) => {
      const name = s.name;
      const rows = args.purchases.filter(
        (p) => String(p.seller || p.vendorName || "").toLowerCase() === name.toLowerCase() || p.vendorId === s.id
      );
      const pays = args.payments.filter((p) => String(p.seller || "").toLowerCase() === name.toLowerCase() || p.supplierId === s.id);
      const purchases = rows.reduce((a, p) => a + num(p.price ?? p.total), 0);
      const payments = pays.reduce((a, p) => a + num(p.amount), 0);
      const unpaidAmt = rows.filter((p) => !isPurchasePaid(p)).reduce((a, p) => a + num(p.price ?? p.total), 0);
      const outstanding = unpaidAmt - payments;
      const creditLimit = num(s.creditLimit);
      const creditUsed = Math.max(0, outstanding);
      const availableCredit = Math.max(0, creditLimit - creditUsed);
      const unpaidPurchases = rows.filter((p) => !isPurchasePaid(p));
      const overdue = unpaidPurchases
        .filter((p) => {
          const d = String(p.invoiceDate || p.date || "");
          const days = num(s.creditDays) || 30;
          if (!d) return outstanding > 0;
          const due = new Date(d + "T00:00:00");
          due.setDate(due.getDate() + days);
          return due.toISOString().slice(0, 10) < today;
        })
        .reduce((a, p) => a + num(p.price ?? p.total), 0);
      const lastPurchaseDate =
        rows
          .map((p) => String(p.date || p.invoiceDate || ""))
          .filter(Boolean)
          .sort()
          .reverse()[0] || null;

      return {
        supplierId: s.id,
        name,
        purchases,
        payments,
        outstanding,
        creditLimit,
        creditUsed,
        availableCredit,
        overdue: Math.min(Math.max(0, overdue), Math.max(0, outstanding)),
        lastPurchaseDate,
        purchaseCount: rows.length,
        rating: num(s.rating),
        category: s.category || "General",
        status: s.status || (s.archived ? "archived" : "active")
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));
}

export function avgPurchaseValue(row: SupplierLedgerRow) {
  if (!row.purchaseCount) return 0;
  return row.purchases / row.purchaseCount;
}
