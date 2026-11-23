export type {
  TaskDoc,
  TaskPriority,
  TaskStatus,
  TaskType,
  ReminderDoc,
  ReminderCategory,
  RecurrenceFreq
} from "@/features/hr/types";

import type { AuditFields, SyncStatus } from "@/features/pos/types";

/** Vanilla-compatible expense + enterprise extensions */
export type ExpensePaymentStatus = "pending" | "partial" | "paid" | "unpaid" | "cancelled" | "refunded";

export type ExpenseApprovalStatus = "draft" | "pending" | "approved" | "rejected";

export type ExpenseCategory =
  | "rent"
  | "electricity"
  | "gas"
  | "water"
  | "internet"
  | "salary"
  | "advance"
  | "vendor_payment"
  | "kitchen"
  | "packaging"
  | "cleaning"
  | "transport"
  | "fuel"
  | "maintenance"
  | "marketing"
  | "advertising"
  | "software"
  | "subscriptions"
  | "taxes"
  | "insurance"
  | "bank_charges"
  | "office"
  | "utilities"
  | "vegetables"
  | "kirana"
  | "milk"
  | "misc"
  | "other"
  | "custom";

export type ExpenseDoc = AuditFields & {
  /** Vanilla fields */
  date: string;
  category: string;
  amount: number;
  status: "paid" | "unpaid";
  paymentMethod: "cash" | "online" | "unpaid" | "bank" | "upi" | "card";
  note?: string;
  attachment?: string | null;
  attachmentName?: string;
  recurringId?: string | null;

  /** React dashboard compat */
  paidFrom?: "cash" | "bank";
  userId?: string;

  /** Enterprise extensions */
  expenseNumber?: string;
  expenseType?: string;
  vendorId?: string | null;
  vendorName?: string | null;
  branch?: string;
  department?: string;
  employeeId?: string | null;
  employeeName?: string | null;
  paymentStatus?: ExpensePaymentStatus;
  paidAmount?: number;
  gstin?: string;
  hsn?: string;
  taxableAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  tds?: number;
  taxInclusive?: boolean;
  reverseCharge?: boolean;
  invoiceNumber?: string;
  invoiceDate?: string;
  description?: string;
  remarks?: string;
  approvalStatus?: ExpenseApprovalStatus;
  approvalComment?: string;
  approvedBy?: string | null;
  attachments?: Array<{ name: string; url: string; type?: string }>;
  archived?: boolean;
  syncStatus?: SyncStatus;
};

export type RecurringExpenseDoc = AuditFields & {
  title: string;
  category: string;
  amount: number;
  dayOfMonth: number;
  paymentMethod?: "cash" | "online";
  active?: boolean;
  vendorName?: string | null;
  branch?: string;
  syncStatus?: SyncStatus;
};

export type ExpensePaymentDoc = AuditFields & {
  expenseId: string;
  amount: number;
  date: string;
  method: "cash" | "online" | "upi" | "bank" | "card";
  note?: string;
  syncStatus?: SyncStatus;
};

export type ExpenseApprovalDoc = AuditFields & {
  expenseId: string;
  decision: "approved" | "rejected" | "pending";
  comment?: string;
  decidedBy?: string | null;
  syncStatus?: SyncStatus;
};

export type ExpenseCategoryDoc = AuditFields & {
  name: string;
  code?: string;
  active?: boolean;
  syncStatus?: SyncStatus;
};

export const EXPENSE_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "rent", label: "Rent" },
  { value: "electricity", label: "Electricity" },
  { value: "gas", label: "Gas" },
  { value: "water", label: "Water" },
  { value: "internet", label: "Internet" },
  { value: "utilities", label: "Utilities" },
  { value: "salary", label: "Salary" },
  { value: "advance", label: "Advance" },
  { value: "vendor_payment", label: "Vendor payment" },
  { value: "kitchen", label: "Kitchen material" },
  { value: "vegetables", label: "Vegetables" },
  { value: "kirana", label: "Kirana" },
  { value: "packaging", label: "Packaging" },
  { value: "cleaning", label: "Cleaning" },
  { value: "transport", label: "Transport" },
  { value: "fuel", label: "Fuel" },
  { value: "maintenance", label: "Maintenance" },
  { value: "marketing", label: "Marketing" },
  { value: "software", label: "Software" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "taxes", label: "Taxes" },
  { value: "insurance", label: "Insurance" },
  { value: "bank_charges", label: "Bank charges" },
  { value: "office", label: "Office" },
  { value: "misc", label: "Miscellaneous" },
  { value: "other", label: "Other" }
];

export const TASK_TYPES = [
  "daily",
  "kitchen",
  "cleaning",
  "inventory",
  "purchase",
  "maintenance",
  "marketing",
  "hr",
  "finance",
  "custom"
] as const;

export const TASK_AUTOMATION_PRESETS: Array<{ title: string; taskType: string; priority: "critical" | "high" | "medium" | "low" }> = [
  { title: "Inventory count", taskType: "inventory", priority: "high" },
  { title: "Vendor payment follow-up", taskType: "finance", priority: "high" },
  { title: "Salary processing", taskType: "hr", priority: "critical" },
  { title: "Kitchen deep cleaning", taskType: "cleaning", priority: "medium" },
  { title: "Equipment service", taskType: "maintenance", priority: "high" },
  { title: "Purchase follow-up", taskType: "purchase", priority: "medium" },
  { title: "Customer follow-up", taskType: "marketing", priority: "medium" },
  { title: "GST filing", taskType: "finance", priority: "critical" },
  { title: "License renewal", taskType: "finance", priority: "critical" },
  { title: "Reminder follow-up", taskType: "daily", priority: "low" }
];
