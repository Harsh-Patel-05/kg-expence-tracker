import type { AuditFields, SyncStatus } from "@/features/pos/types";
import type { RecurrenceFreq, TaskPriority } from "@/features/hr/types";

export type CalendarEventType =
  | "order"
  | "birthday"
  | "event"
  | "task"
  | "vendor_payment"
  | "leave"
  | "catering"
  | "bulk_order"
  | "inventory_count"
  | "purchase"
  | "meeting"
  | "equipment_service"
  | "license_renewal"
  | "reminder"
  | "salary"
  | "custom";

export type CalendarEventDoc = AuditFields & {
  title: string;
  description?: string;
  eventNumber?: string;
  category?: string;
  eventType: CalendarEventType;
  priority?: TaskPriority;
  date: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  department?: string;
  branch?: string;
  relatedCustomer?: string | null;
  relatedSupplier?: string | null;
  relatedOrderId?: string | null;
  relatedTaskId?: string | null;
  relatedReminderId?: string | null;
  color?: string;
  attachments?: Array<{ name: string; url: string }>;
  notes?: string;
  recurrence?: RecurrenceFreq;
  recurrenceInterval?: number;
  recurrenceEndDate?: string | null;
  recurrenceCount?: number | null;
  notifyBeforeMinutes?: number[];
  archived?: boolean;
  source?: "manual" | "integrated";
  syncStatus?: SyncStatus;
};

export type CalendarCategoryDoc = AuditFields & {
  name: string;
  color?: string;
  eventType?: CalendarEventType;
  syncStatus?: SyncStatus;
};

export type UnifiedCalendarItem = {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  eventType: CalendarEventType;
  color: string;
  source: "calendar" | "reminder" | "task" | "leave" | "birthday" | "order";
  priority?: string;
  meta?: Record<string, unknown>;
};

export const EVENT_COLORS: Record<CalendarEventType, string> = {
  order: "#0ea5e9",
  birthday: "#ec4899",
  event: "#6366f1",
  task: "#10b981",
  vendor_payment: "#f59e0b",
  leave: "#8b5cf6",
  catering: "#14b8a6",
  bulk_order: "#06b6d4",
  inventory_count: "#64748b",
  purchase: "#f97316",
  meeting: "#3b82f6",
  equipment_service: "#ef4444",
  license_renewal: "#dc2626",
  reminder: "#84cc16",
  salary: "#a855f7",
  custom: "#334155"
};

export type DocumentCategory =
  | "gst_certificate"
  | "fssai"
  | "shop_establishment"
  | "trade_license"
  | "fire_noc"
  | "insurance"
  | "rent_agreement"
  | "electricity"
  | "water"
  | "gas"
  | "internet"
  | "vendor_bill"
  | "purchase_bill"
  | "employee"
  | "salary_slip"
  | "pan"
  | "aadhar"
  | "bank"
  | "contract"
  | "agreement"
  | "legal"
  | "marketing"
  | "custom";

export type DocumentFolderDoc = AuditFields & {
  name: string;
  parentId?: string | null;
  path?: string;
  syncStatus?: SyncStatus;
};

export type ManagedDocumentDoc = AuditFields & {
  title: string;
  description?: string;
  category: DocumentCategory | string;
  folderId?: string | null;
  folderPath?: string;
  tags?: string[];
  fileName: string;
  fileSize: number;
  fileType: string;
  storagePath?: string;
  downloadUrl: string;
  uploadedByName?: string;
  branch?: string;
  department?: string;
  ownerName?: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  renewalDate?: string | null;
  notes?: string;
  version?: number;
  archived?: boolean;
  syncStatus?: SyncStatus;
};

export type DocumentVersionDoc = AuditFields & {
  documentId: string;
  version: number;
  fileName: string;
  downloadUrl: string;
  storagePath?: string;
  fileSize: number;
  comment?: string;
  syncStatus?: SyncStatus;
};

export type DocumentCommentDoc = AuditFields & {
  documentId: string;
  text: string;
  by?: string;
  mentions?: string[];
  syncStatus?: SyncStatus;
};

export const DOCUMENT_CATEGORIES: Array<{ value: DocumentCategory; label: string }> = [
  { value: "gst_certificate", label: "GST Certificate" },
  { value: "fssai", label: "FSSAI License" },
  { value: "shop_establishment", label: "Shop & Establishment" },
  { value: "trade_license", label: "Trade License" },
  { value: "fire_noc", label: "Fire NOC" },
  { value: "insurance", label: "Insurance" },
  { value: "rent_agreement", label: "Rent Agreement" },
  { value: "electricity", label: "Electricity Bills" },
  { value: "water", label: "Water Bills" },
  { value: "gas", label: "Gas Bills" },
  { value: "internet", label: "Internet Bills" },
  { value: "vendor_bill", label: "Vendor Bills" },
  { value: "purchase_bill", label: "Purchase Bills" },
  { value: "employee", label: "Employee Documents" },
  { value: "salary_slip", label: "Salary Slips" },
  { value: "pan", label: "PAN" },
  { value: "aadhar", label: "Aadhar" },
  { value: "bank", label: "Bank Documents" },
  { value: "contract", label: "Contracts" },
  { value: "agreement", label: "Agreements" },
  { value: "legal", label: "Legal" },
  { value: "marketing", label: "Marketing" },
  { value: "custom", label: "Custom" }
];

export const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "application/zip"
];

export const MAX_FILE_BYTES = 12 * 1024 * 1024;
