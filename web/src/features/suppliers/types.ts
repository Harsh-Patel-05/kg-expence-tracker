import type { AuditFields, SyncStatus } from "@/features/pos/types";
import type { VendorDoc } from "@/features/inventory/types";

export type SupplierDoc = VendorDoc;

export type SupplierPaymentDoc = AuditFields & {
  /** Vanilla: seller is supplier name */
  date: string;
  seller: string;
  supplierId?: string | null;
  amount: number;
  method: "cash" | "online" | "upi" | "bank" | "card";
  note?: string;
  referenceNumber?: string;
  receiptUrl?: string | null;
  purchaseId?: string | null;
  syncStatus?: SyncStatus;
};

export type SupplierRatingDoc = AuditFields & {
  supplierId: string;
  supplierName: string;
  quality: number;
  delivery: number;
  pricing: number;
  service: number;
  overall: number;
  notes?: string;
  syncStatus?: SyncStatus;
};

export type SupplierContactLogDoc = AuditFields & {
  supplierId: string;
  supplierName: string;
  channel: "call" | "whatsapp" | "email" | "meeting" | "other";
  note: string;
  nextFollowUp?: string | null;
  syncStatus?: SyncStatus;
};

export type SupplierLedgerRow = {
  supplierId: string;
  name: string;
  purchases: number;
  payments: number;
  outstanding: number;
  creditLimit: number;
  creditUsed: number;
  availableCredit: number;
  overdue: number;
  lastPurchaseDate: string | null;
  purchaseCount: number;
  rating: number;
  category: string;
  status: string;
};

export function validateGstin(gstin?: string) {
  if (!gstin?.trim()) return true;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(gstin.trim());
}
