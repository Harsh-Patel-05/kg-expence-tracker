import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  setDoc
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import { pushNotification } from "@/features/orders/services/orderEngine";
import type { InventoryItemDoc, StockLotDoc, StockMovementDoc } from "../types";
import { availableQty } from "../utils/alerts";

function actor() {
  return auth.currentUser?.uid ?? null;
}

async function writeInvLog(action: string, entityId: string, message: string, meta?: Record<string, unknown>) {
  const ref = doc(collection(db, "inventoryLogs"));
  await setDoc(ref, {
    action,
    entityType: "inventory",
    entityId,
    message,
    meta,
    actorId: actor(),
    syncStatus: "synced",
    ...auditCreate({ status: "recorded" })
  });
}

export async function upsertInventoryItem(
  input: Partial<InventoryItemDoc> & { item: string; id?: string }
): Promise<string> {
  const name = input.item.trim();
  if (!name) throw new Error("Item name required");

  // Upsert by name (vanilla compat) unless id provided
  let id = input.id;
  if (!id) {
    const snap = await getDocs(collection(db, "inventory"));
    const existing = snap.docs.find((d) => String(d.data().item || "").toLowerCase() === name.toLowerCase());
    id = existing?.id || doc(collection(db, "inventory")).id;
  }
  const ref = doc(db, "inventory", id);
  const prev = await getDoc(ref);
  const prevData = prev.exists() ? (prev.data() as InventoryItemDoc) : null;

  if (input.sku) {
    const all = await getDocs(collection(db, "inventory"));
    const dup = all.docs.find(
      (d) => d.id !== id && String(d.data().sku || "").toLowerCase() === String(input.sku).toLowerCase()
    );
    if (dup) throw new Error("Duplicate SKU");
  }

  const qty = input.qty !== undefined ? num(input.qty) : num(prevData?.qty);
  if (qty < 0) throw new Error("Negative stock not allowed");

  const payload: Record<string, unknown> = {
    item: name,
    unit: input.unit || prevData?.unit || "pcs",
    qty,
    threshold: input.threshold ?? input.minStock ?? prevData?.threshold ?? 0,
    kind: input.kind || prevData?.kind || "raw",
    sku: input.sku ?? prevData?.sku ?? "",
    barcode: input.barcode ?? prevData?.barcode ?? "",
    qrCode: input.qrCode ?? prevData?.qrCode ?? "",
    imageUrl: input.imageUrl ?? prevData?.imageUrl ?? "",
    internalCode: input.internalCode ?? prevData?.internalCode ?? "",
    hsnCode: input.hsnCode ?? prevData?.hsnCode ?? "",
    gstRate: input.gstRate ?? prevData?.gstRate ?? 0,
    storageLocation: input.storageLocation ?? prevData?.storageLocation ?? "Store Room",
    rackNumber: input.rackNumber ?? prevData?.rackNumber ?? "",
    minStock: input.minStock ?? prevData?.minStock ?? input.threshold ?? 0,
    maxStock: input.maxStock ?? prevData?.maxStock ?? 0,
    reorderLevel: input.reorderLevel ?? prevData?.reorderLevel ?? input.threshold ?? 0,
    openingStock: input.openingStock ?? prevData?.openingStock ?? qty,
    reservedQty: input.reservedQty ?? prevData?.reservedQty ?? 0,
    avgCost: input.avgCost ?? prevData?.avgCost ?? 0,
    lastPurchaseCost: input.lastPurchaseCost ?? prevData?.lastPurchaseCost ?? 0,
    preferredVendorId: input.preferredVendorId ?? prevData?.preferredVendorId ?? null,
    preferredVendorName: input.preferredVendorName ?? prevData?.preferredVendorName ?? null,
    vendorIds: input.vendorIds ?? prevData?.vendorIds ?? [],
    notes: input.notes ?? prevData?.notes ?? "",
    sellingPrice: input.sellingPrice ?? prevData?.sellingPrice ?? 0,
    costPrice: input.costPrice ?? prevData?.costPrice ?? 0,
    recipeId: input.recipeId ?? prevData?.recipeId ?? null,
    menuItemId: input.menuItemId ?? prevData?.menuItemId ?? null,
    archived: input.archived ?? prevData?.archived ?? false,
    syncStatus: "synced",
    isDeleted: false,
    ...(prev.exists() ? auditUpdate() : auditCreate({ status: "active" }))
  };

  await setDoc(ref, payload, { merge: true });
  await logActivity({
    action: prev.exists() ? "inventory_updated" : "inventory_created",
    entityType: "inventory",
    entityId: id,
    message: `${prev.exists() ? "Updated" : "Created"} ${name}`
  });
  await writeInvLog(prev.exists() ? "update" : "create", id, `${name} saved`);
  return id;
}

/** Port of api.inventory.adjust with lots FIFO + movements */
export async function adjustStock(args: {
  inventoryId: string;
  delta: number;
  type: string;
  reason?: string;
  date?: string;
  createLot?: boolean;
  supplier?: string;
  expiryDate?: string;
  mfgDate?: string;
  batchNumber?: string;
  cost?: number;
  allowNegative?: boolean;
  purchaseId?: string;
  orderId?: string;
  transferId?: string;
  requireApproval?: boolean;
}) {
  const delta = num(args.delta);
  if (!delta) throw new Error("Delta required");
  const ref = doc(db, "inventory", args.inventoryId);

  // Read lots if consuming
  const lotsSnap =
    delta < 0
      ? await getDocs(query(collection(db, "stock_lots"), where("inventoryId", "==", args.inventoryId)))
      : null;

  const batch = writeBatch(db);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Inventory item not found");
  const item = snap.data() as InventoryItemDoc;
  const before = num(item.qty);
  const after = before + delta;
  if (!args.allowNegative && after < 0) {
    throw new Error(`Insufficient stock for ${item.item}`);
  }

  batch.set(
    ref,
    {
      qty: after,
      ...(delta > 0 && args.cost != null
        ? {
            lastPurchaseCost: num(args.cost),
            avgCost: before <= 0 ? num(args.cost) : (num(item.avgCost) * before + num(args.cost) * delta) / after
          }
        : {}),
      syncStatus: "synced",
      ...auditUpdate()
    },
    { merge: true }
  );

  const movRef = doc(collection(db, "inventory_movements"));
  const movement: StockMovementDoc = {
    inventoryId: args.inventoryId,
    item: item.item,
    unit: item.unit,
    delta,
    qtyBefore: before,
    qtyAfter: after,
    type: args.type,
    reason: args.reason || "",
    date: args.date || isoDate(),
    purchaseId: args.purchaseId,
    orderId: args.orderId,
    transferId: args.transferId,
    batchNumber: args.batchNumber,
    syncStatus: "synced",
    ...auditCreate({ status: "posted" })
  };
  batch.set(movRef, movement);

  if (delta > 0 && args.createLot) {
    const lotRef = doc(collection(db, "stock_lots"));
    const lot: StockLotDoc = {
      inventoryId: args.inventoryId,
      item: item.item,
      unit: item.unit,
      qty: delta,
      remainingQty: delta,
      supplier: args.supplier || "",
      expiryDate: args.expiryDate || "",
      mfgDate: args.mfgDate || "",
      date: args.date || isoDate(),
      purchaseId: args.purchaseId || null,
      batchNumber: args.batchNumber || `B${Date.now().toString(36).toUpperCase()}`,
      cost: args.cost,
      syncStatus: "synced",
      ...auditCreate({ status: "active" })
    };
    batch.set(lotRef, lot);
  }

  if (delta < 0 && lotsSnap) {
    let need = Math.abs(delta);
    const lots = lotsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as StockLotDoc) }))
      .filter((l) => num(l.remainingQty ?? l.qty) > 0 && !l.isDeleted)
      .sort((a, b) => String(a.expiryDate || a.date || "").localeCompare(String(b.expiryDate || b.date || "")));
    for (const lot of lots) {
      if (need <= 0) break;
      const rem = num(lot.remainingQty ?? lot.qty);
      const take = Math.min(rem, need);
      batch.set(
        doc(db, "stock_lots", lot.id),
        { remainingQty: rem - take, ...auditUpdate() },
        { merge: true }
      );
      need -= take;
    }
  }

  await batch.commit();
  await logActivity({
    action: "stock_adjusted",
    entityType: "inventory",
    entityId: args.inventoryId,
    message: `${item.item} ${delta > 0 ? "+" : ""}${delta} (${args.type})`,
    meta: { reason: args.reason }
  });
  await writeInvLog("adjustment", args.inventoryId, `${item.item} Δ${delta}`, { type: args.type });

  // Low stock notify
  const thr = num(item.threshold || item.minStock);
  if (thr > 0 && after <= thr) {
    await pushNotification({
      title: after <= 0 ? "Out of stock" : "Low stock",
      body: `${item.item}: ${after} ${item.unit || ""}`,
      kind: "info",
      roleTargets: ["manager", "owner", "admin"],
      status: "unread",
      isDeleted: false,
      syncStatus: "synced"
    });
  }

  return { before, after, available: Math.max(0, after - num(item.reservedQty)) };
}

export async function softDeleteInventory(id: string) {
  await setDoc(doc(db, "inventory", id), { isDeleted: true, archived: true, ...auditUpdate() }, { merge: true });
  await writeInvLog("delete", id, "Archived inventory item");
}

export async function restoreInventory(id: string) {
  await setDoc(doc(db, "inventory", id), { isDeleted: false, archived: false, status: "active", ...auditUpdate() }, { merge: true });
  await writeInvLog("restore", id, "Restored inventory item");
}

export async function reserveStock(inventoryId: string, qty: number) {
  const ref = doc(db, "inventory", inventoryId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Item not found");
  const item = snap.data() as InventoryItemDoc;
  const avail = availableQty(item);
  if (num(qty) > avail) throw new Error("Cannot reserve more than available");
  await setDoc(ref, { reservedQty: num(item.reservedQty) + num(qty), ...auditUpdate() }, { merge: true });
}

export { availableQty };
