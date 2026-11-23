export type PaymentMethod = "cash" | "bank";

export type SaleDoc = {
  userId: string;
  date: string; // YYYY-MM-DD
  cashAmount: number;
  onlineAmount: number;
  createdAt?: unknown;
};

export type ExpenseCategory = "rent" | "utilities" | "supplies" | "misc" | "salary" | "other";

export type ExpenseDoc = {
  userId?: string;
  date: string; // YYYY-MM-DD
  category: string;
  amount: number;
  /** React dashboard field */
  paidFrom?: PaymentMethod;
  /** Vanilla-compatible fields */
  status?: "paid" | "unpaid";
  paymentMethod?: "cash" | "online" | "unpaid" | "bank" | "upi" | "card";
  paymentStatus?: string;
  paidAmount?: number;
  note?: string;
  isDeleted?: boolean;
  archived?: boolean;
  createdAt?: unknown;
};

export type StaffDoc = {
  userId: string;
  name: string;
  monthlySalary: number;
  active: boolean;
  createdAt?: unknown;
};

export type AttendanceDoc = {
  userId: string;
  staffId: string;
  date: string; // YYYY-MM-DD
  present: boolean;
  createdAt?: unknown;
};

export type AdvanceDoc = {
  userId: string;
  staffId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  paidFrom: PaymentMethod;
  note?: string;
  createdAt?: unknown;
};

export type SupplierDoc = {
  userId: string;
  name: string;
  phone?: string;
  createdAt?: unknown;
};

export type SupplierBillStatus = "paid" | "unpaid";

export type SupplierBillDoc = {
  userId: string;
  supplierId: string;
  title?: string;
  amount: number;
  billDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  status: SupplierBillStatus;
  paidFrom?: PaymentMethod;
  paidAt?: string; // YYYY-MM-DD
  createdAt?: unknown;
};

export type ReminderDoc = {
  userId: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  daysBefore: number; // notify N days before
  enabled: boolean;
  createdAt?: unknown;
};

/** POS types live under features/pos — re-export for convenience */
export type { MenuItemDoc, OrderDoc, CustomerDoc, TableDoc } from "@/features/pos/types";

