/** Shared audit fields for POS / ERP documents */
export type AuditFields = {
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string | null;
  updatedBy?: string | null;
  isDeleted?: boolean;
  status?: string;
};

export type PosRole =
  | "owner"
  | "manager"
  | "admin"
  | "cashier"
  | "captain"
  | "kitchen"
  | "chef"
  | "delivery"
  | "accountant"
  | "employee";

export type DietType = "veg" | "nonveg" | "jain" | "egg";

export type OrderType =
  | "dine_in"
  | "takeaway"
  | "delivery"
  | "online"
  | "swiggy"
  | "zomato"
  | "magicpin"
  | "dotpe"
  | "ondc"
  | "qr"
  | "phone"
  | "whatsapp"
  | "scheduled"
  | "bulk"
  | "catering"
  | "direct";

export type OrderStatus =
  | "draft"
  | "held"
  | "pending"
  | "confirmed"
  | "accepted"
  | "preparing"
  | "cooking"
  | "ready"
  | "packed"
  | "waiting_pickup"
  | "out_for_delivery"
  | "served"
  | "delivered"
  | "completed"
  | "cancelled"
  | "rejected"
  | "refunded";

export type KitchenStatus =
  | "new"
  | "accepted"
  | "preparing"
  | "cooking"
  | "plating"
  | "ready"
  | "packed"
  | "served"
  | "completed";

export type PaymentMode = "cash" | "upi" | "card" | "wallet" | "bank" | "credit" | "other";

export type TableStatus = "available" | "occupied" | "reserved" | "cleaning";

export type TaxMode = "inclusive" | "exclusive";

export type SyncStatus = "synced" | "pending" | "conflict" | "offline";

export type OrderPriority = "normal" | "vip" | "express" | "delayed" | "large" | "bulk";

export type PlatformSource = "swiggy" | "zomato" | "magicpin" | "dotpe" | "ondc" | "internal";


/** Reuses existing Firestore `menuItems` collection */
export type MenuItemDoc = AuditFields & {
  name: string;
  nameHi?: string;
  price: number;
  category?: string;
  imageUrl?: string;
  available?: boolean;
  favorite?: boolean;
  barcode?: string;
  qrCode?: string;
  diet?: DietType;
  hsnCode?: string;
  taxRate?: number;
  recipe?: Array<{ item: string; qty: number }>;
  recipeText?: string;
  stockQty?: number;
  trackStock?: boolean;
};

export type CartLine = {
  lineId: string;
  menuItemId: string;
  name: string;
  nameHi?: string;
  price: number;
  qty: number;
  note?: string;
  kitchenNote?: string;
  customerNote?: string;
  specialInstructions?: string;
  complimentary?: boolean;
  complimentaryReason?: string;
  itemDiscountPct?: number;
  itemDiscountAmt?: number;
  taxRate?: number;
  hsnCode?: string;
  diet?: DietType;
  category?: string;
  isCustom?: boolean;
};

export type CustomerDoc = AuditFields & {
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  rewardPoints?: number;
  pendingBalance?: number;
  type?: "regular" | "guest" | "walk_in";
};

export type TableDoc = AuditFields & {
  name: string;
  capacity?: number;
  floor?: string;
  status: TableStatus;
  currentOrderId?: string | null;
  mergedInto?: string | null;
};

export type TaxConfig = {
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  mode: TaxMode;
  gstin?: string;
  enableIgst?: boolean;
};

export type ChargeLine = {
  id: string;
  label: string;
  amount: number;
  type: "packing" | "delivery" | "service" | "tip" | "custom" | "round_off";
};

export type DiscountState = {
  type: "none" | "percent" | "fixed" | "item" | "bill";
  value: number;
  reason?: string;
  approvedBy?: string | null;
  couponCode?: string | null;
};

export type PaymentLine = {
  id: string;
  mode: PaymentMode;
  amount: number;
  reference?: string;
  paidAt?: string;
};

export type CouponDoc = AuditFields & {
  code: string;
  type: "percent" | "fixed";
  value: number;
  minOrder?: number;
  maxDiscount?: number;
  expiresAt?: string;
  usageCount?: number;
  maxUsage?: number;
  productIds?: string[];
  categoryIds?: string[];
  autoApply?: boolean;
};

export type PosSettingsDoc = AuditFields & {
  restaurantName?: string;
  gstin?: string;
  address?: string;
  phone?: string;
  tax: TaxConfig;
  invoicePrefix?: string;
  nextInvoiceNo?: number;
  maxDiscountPct?: number;
  allowNegativeStock?: boolean;
  roundOffEnabled?: boolean;
};

export type OrderDoc = AuditFields & {
  date: string;
  invoiceNo?: string;
  orderType: OrderType;
  items: CartLine[];
  notes?: string;
  customerNote?: string;
  kitchenNote?: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  tableId?: string | null;
  tableName?: string | null;
  subtotal: number;
  itemDiscountTotal: number;
  billDiscount: number;
  couponDiscount: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  charges: ChargeLine[];
  chargesTotal: number;
  roundOff: number;
  total: number;
  paidTotal: number;
  balanceDue: number;
  payments: PaymentLine[];
  discount: DiscountState;
  couponCode?: string | null;
  taxMode: TaxMode;
  held?: boolean;
  heldAt?: string | null;
  cancelledReason?: string | null;
  refundedAmount?: number;
  saleId?: string | null;
  splitFromOrderId?: string | null;
  mergedOrderIds?: string[];
  kotSentAt?: string | null;
  kotVersion?: number;
  /** OMS / KDS extensions */
  syncStatus?: SyncStatus;
  kitchenStatus?: KitchenStatus;
  priority?: OrderPriority;
  platform?: PlatformSource;
  platformOrderId?: string;
  platformCharges?: number;
  platformCommission?: number;
  expectedPayout?: number;
  platformNotes?: string;
  tokenNumber?: string;
  pickupAt?: string | null;
  packagingStatus?: "pending" | "packing" | "packed" | "collected";
  guestCount?: number;
  captainId?: string | null;
  captainName?: string | null;
  chefId?: string | null;
  chefName?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  deliveryAddress?: string;
  deliveryMapLink?: string;
  deliveryCharge?: number;
  etaMinutes?: number;
  expectedReadyAt?: string | null;
  acceptedAt?: string | null;
  preparingAt?: string | null;
  cookingAt?: string | null;
  readyAt?: string | null;
  servedAt?: string | null;
  completedAt?: string | null;
  scheduledFor?: string | null;
  venue?: string;
  eventDate?: string;
  eventTime?: string;
  foodPackage?: string;
  equipmentRequired?: string;
  advancePaid?: number;
  balancePayment?: number;
  whatsappRef?: string;
  chatRef?: string;
  qrTableId?: string | null;
  kitchenCategories?: string[];
  delayed?: boolean;
  statusHistory?: Array<{
    status: string;
    at: string;
    by?: string | null;
    note?: string;
  }>;
};

export type PaymentDoc = AuditFields & {
  orderId: string;
  invoiceNo?: string;
  mode: PaymentMode;
  amount: number;
  reference?: string;
  date: string;
};

export type RefundDoc = AuditFields & {
  orderId: string;
  invoiceNo?: string;
  type: "full" | "partial" | "item" | "payment";
  amount: number;
  reason: string;
  itemLineIds?: string[];
  approvedBy?: string | null;
  inventoryRestored?: boolean;
};

export type KitchenTicketDoc = AuditFields & {
  orderId: string;
  tableName?: string | null;
  orderType: OrderType;
  items: Array<{
    lineId: string;
    name: string;
    qty: number;
    note?: string;
    kitchenNote?: string;
    category?: string;
  }>;
  version: number;
  printedAt?: string | null;
  kind?: "new" | "modified" | "cancel" | "reprint";
  chefId?: string | null;
  categoryFilter?: string | null;
};

export type StatusHistoryDoc = AuditFields & {
  orderId: string;
  fromStatus?: string | null;
  toStatus: string;
  note?: string;
  actorId?: string | null;
  actorRole?: string | null;
  syncStatus?: SyncStatus;
};

export type KitchenAssignmentDoc = AuditFields & {
  orderId: string;
  chefId: string;
  chefName: string;
  categories?: string[];
  assignedAt?: string;
  syncStatus?: SyncStatus;
};

export type DriverDoc = AuditFields & {
  name: string;
  phone?: string;
  active?: boolean;
  currentOrderId?: string | null;
  syncStatus?: SyncStatus;
};

export type NotificationKind =
  | "new_order"
  | "delayed"
  | "ready"
  | "cancelled"
  | "payment"
  | "chef_assigned"
  | "driver_assigned"
  | "scheduled_reminder"
  | "info"
  | "low_stock"
  | "out_of_stock"
  | "refund"
  | "review"
  | "task"
  | "reminder_due"
  | "salary_due"
  | "vendor_due"
  | "purchase_approval"
  | "expense_approval"
  | "inventory_alert"
  | "equipment_service"
  | "license_renewal"
  | "security"
  | "system"
  | "custom";

export type NotificationPriority = "critical" | "high" | "medium" | "low";

export type NotificationDoc = AuditFields & {
  title: string;
  body: string;
  kind: NotificationKind;
  orderId?: string;
  entityType?: string;
  entityId?: string;
  link?: string;
  read?: boolean;
  readStatus?: "unread" | "read" | "archived" | "deleted";
  priority?: NotificationPriority;
  pinned?: boolean;
  snoozedUntil?: string | null;
  channels?: Array<"in_app" | "desktop" | "push" | "email" | "whatsapp" | "sms">;
  roleTargets?: string[];
  userId?: string | null;
  dedupeKey?: string;
  syncStatus?: SyncStatus;
};

export type ActivityLogDoc = AuditFields & {
  action: string;
  entityType: string;
  entityId?: string;
  message: string;
  meta?: Record<string, unknown>;
  actorId?: string | null;
  actorRole?: string | null;
};

export type InventoryDoc = AuditFields & {
  item: string;
  qty: number;
  unit?: string;
  threshold?: number;
  /** Extended fields also used by features/inventory */
  kind?: string;
  sku?: string;
  avgCost?: number;
  lastPurchaseCost?: number;
  reservedQty?: number;
  storageLocation?: string;
  costPrice?: number;
  recipeId?: string | null;
};

export type BillTotals = {
  subtotal: number;
  itemDiscountTotal: number;
  billDiscount: number;
  couponDiscount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxAmount: number;
  chargesTotal: number;
  roundOff: number;
  total: number;
};
