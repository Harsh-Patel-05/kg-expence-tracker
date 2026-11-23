import type { AuditFields, SyncStatus } from "@/features/pos/types";

export type InventoryKind =
  | "raw"
  | "semi_finished"
  | "finished"
  | "packaging"
  | "consumable"
  | "cleaning"
  | "kitchen_supply";

export type StockUnit = "g" | "kg" | "ml" | "l" | "pcs" | "packet" | "box" | "dozen" | string;

/** Extends existing Firestore `inventory` docs (keeps vanilla fields). */
export type InventoryItemDoc = AuditFields & {
  item: string;
  unit?: StockUnit;
  qty: number;
  threshold?: number;
  kind?: InventoryKind;
  sku?: string;
  barcode?: string;
  qrCode?: string;
  imageUrl?: string;
  internalCode?: string;
  hsnCode?: string;
  gstRate?: number;
  storageLocation?: string;
  rackNumber?: string;
  minStock?: number;
  maxStock?: number;
  reorderLevel?: number;
  openingStock?: number;
  reservedQty?: number;
  avgCost?: number;
  lastPurchaseCost?: number;
  preferredVendorId?: string | null;
  preferredVendorName?: string | null;
  vendorIds?: string[];
  notes?: string;
  attachmentUrls?: string[];
  sellingPrice?: number;
  costPrice?: number;
  recipeId?: string | null;
  menuItemId?: string | null;
  syncStatus?: SyncStatus;
  archived?: boolean;
};

export type StockLotDoc = AuditFields & {
  inventoryId: string;
  item: string;
  unit?: string;
  qty: number;
  remainingQty: number;
  supplier?: string;
  expiryDate?: string;
  mfgDate?: string;
  date?: string;
  purchaseId?: string | null;
  batchNumber?: string;
  supplierBatch?: string;
  cost?: number;
  syncStatus?: SyncStatus;
};

export type StockMovementDoc = AuditFields & {
  inventoryId: string;
  item: string;
  unit?: string;
  delta: number;
  qtyBefore?: number;
  qtyAfter?: number;
  type: string;
  reason?: string;
  date: string;
  orderId?: string;
  purchaseId?: string;
  transferId?: string;
  batchNumber?: string;
  syncStatus?: SyncStatus;
};

export type VendorDoc = AuditFields & {
  name: string;
  supplierCode?: string;
  companyName?: string;
  gstin?: string;
  pan?: string;
  contact?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  bankAccount?: string;
  ifsc?: string;
  upi?: string;
  paymentTerms?: string;
  creditDays?: number;
  preferredCurrency?: string;
  deliveryDays?: number;
  category?: string;
  creditLimit?: number;
  creditUsed?: number;
  outstanding?: number;
  rating?: number;
  qualityRating?: number;
  deliveryRating?: number;
  pricingRating?: number;
  serviceRating?: number;
  notes?: string;
  nextFollowUp?: string | null;
  documents?: string[];
  attachments?: Array<{ name: string; url: string }>;
  items?: Array<{ name: string; rate?: number }>;
  archived?: boolean;
  syncStatus?: SyncStatus;
};

export type PurchaseLine = {
  inventoryId?: string;
  item: string;
  qty: number;
  unit?: string;
  rate: number;
  gstRate?: number;
  discount?: number;
  expiryDate?: string;
  mfgDate?: string;
  batchNumber?: string;
};

export type PurchaseEntryDoc = AuditFields & {
  purchaseNumber?: string;
  vendorId?: string | null;
  vendorName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  date: string;
  lines: PurchaseLine[];
  /** Vanilla compat single-line fields */
  item?: string;
  qty?: number;
  price?: number;
  seller?: string;
  paidStatus?: "paid" | "unpaid" | "partial";
  subtotal?: number;
  gstAmount?: number;
  discount?: number;
  freight?: number;
  otherCharges?: number;
  total: number;
  paymentStatus?: "paid" | "unpaid" | "partial";
  paymentMethod?: "cash" | "online" | "unpaid";
  notes?: string;
  syncStatus?: SyncStatus;
};

export type StockTransferDoc = AuditFields & {
  transferNumber?: string;
  inventoryId: string;
  item: string;
  qty: number;
  unit?: string;
  fromLocation: string;
  toLocation: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  transferStatus?: "draft" | "in_transit" | "completed" | "cancelled";
  reason?: string;
  syncStatus?: SyncStatus;
};

export type WastageDoc = AuditFields & {
  inventoryId: string;
  item: string;
  qty: number;
  unit?: string;
  reason: "expired" | "burnt" | "spoiled" | "kitchen" | "return" | "prep" | "other";
  notes?: string;
  costImpact?: number;
  approvalStatus?: "pending" | "approved" | "rejected";
  date: string;
  syncStatus?: SyncStatus;
};

export type PhysicalCountDoc = AuditFields & {
  countNumber?: string;
  date: string;
  lines: Array<{
    inventoryId: string;
    item: string;
    systemQty: number;
    actualQty: number;
    variance: number;
    unit?: string;
  }>;
  varianceTotal?: number;
  adjustmentCreated?: boolean;
  syncStatus?: SyncStatus;
};

export type UnitConversionDoc = AuditFields & {
  fromUnit: string;
  toUnit: string;
  factor: number;
  itemId?: string | null;
  syncStatus?: SyncStatus;
};

export type RecipeIngredient = {
  id: string;
  inventoryId?: string | null;
  item: string;
  qty: number;
  unit: StockUnit;
  cost?: number;
  prepLossPct?: number;
  cookLossPct?: number;
  optional?: boolean;
  mandatory?: boolean;
};

export type RecipeDoc = AuditFields & {
  name: string;
  category?: string;
  imageUrl?: string;
  prepTimeMin?: number;
  cookTimeMin?: number;
  servingSize?: number;
  yieldQty?: number;
  yieldUnit?: string;
  difficulty?: "easy" | "medium" | "hard";
  instructions?: string;
  notes?: string;
  attachments?: string[];
  ingredients: RecipeIngredient[];
  packagingCost?: number;
  gasCost?: number;
  labourCost?: number;
  overheadCost?: number;
  sellingPrice?: number;
  portionSize?: number;
  rawWeight?: number;
  cookedWeight?: number;
  menuItemId?: string | null;
  version?: number;
  syncStatus?: SyncStatus;
};

export type RecipeVersionDoc = AuditFields & {
  recipeId: string;
  version: number;
  snapshot: RecipeDoc;
  changeNote?: string;
  syncStatus?: SyncStatus;
};

export type ProductionBatchDoc = AuditFields & {
  batchNumber?: string;
  recipeId: string;
  recipeName: string;
  outputKind: "semi_finished" | "finished";
  outputInventoryId?: string | null;
  outputItem: string;
  outputQty: number;
  outputUnit?: string;
  servings?: number;
  ingredientCost?: number;
  totalCost?: number;
  date: string;
  notes?: string;
  syncStatus?: SyncStatus;
};

export type InventoryLogDoc = AuditFields & {
  action: string;
  entityType: string;
  entityId?: string;
  message: string;
  meta?: Record<string, unknown>;
  syncStatus?: SyncStatus;
};

export type StockAlert = {
  kind: "low" | "out" | "critical" | "reorder" | "expiry" | "expired";
  text: string;
  inventoryId?: string;
  sort: number;
};

export type RecipeCostBreakdown = {
  ingredientCost: number;
  packagingCost: number;
  gasCost: number;
  labourCost: number;
  overheadCost: number;
  totalProductionCost: number;
  costPerPortion: number;
  sellingPrice: number;
  profit: number;
  foodCostPct: number;
  grossMarginPct: number;
  yieldPct: number;
};
