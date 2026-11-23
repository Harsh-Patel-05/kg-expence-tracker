import type { AuditFields, NotificationDoc, NotificationKind, NotificationPriority, SyncStatus } from "@/features/pos/types";

export type { NotificationDoc, NotificationKind, NotificationPriority };

export type NotificationPreferencesDoc = AuditFields & {
  userId: string;
  mutedKinds?: NotificationKind[];
  quietHoursStart?: string; // HH:mm
  quietHoursEnd?: string;
  soundEnabled?: boolean;
  desktopEnabled?: boolean;
  mobileEnabled?: boolean;
  emailEnabled?: boolean;
  whatsappEnabled?: boolean;
  syncStatus?: SyncStatus;
};

export type DashboardMetricsDoc = AuditFields & {
  period: string; // YYYY-MM-DD or YYYY-MM or YYYY
  periodType: "day" | "week" | "month" | "year";
  sales: number;
  expenses: number;
  profit: number;
  orders: number;
  aov: number;
  foodCostPct: number;
  inventoryValue: number;
  pendingPayments: number;
  customers: number;
  syncStatus?: SyncStatus;
};

export type DatePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "quarter"
  | "year"
  | "custom";
