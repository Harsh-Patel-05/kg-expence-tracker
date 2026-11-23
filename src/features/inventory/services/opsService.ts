import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import { adjustStock } from "./stockService";
import type { PhysicalCountDoc, StockTransferDoc, WastageDoc } from "../types";

export async function recordWastage(input: {
  inventoryId: string;
  item: string;
  qty: number;
  unit?: string;
  reason: WastageDoc["reason"];
  notes?: string;
  costImpact?: number;
  approve?: boolean;
}) {
  if (num(input.qty) <= 0) throw new Error("Quantity required");
  if (!input.reason) throw new Error("Reason required");

  await adjustStock({
    inventoryId: input.inventoryId,
    delta: -num(input.qty),
    type: "wastage",
    reason: `${input.reason}${input.notes ? ` · ${input.notes}` : ""}`,
    date: isoDate()
  });

  const ref = doc(collection(db, "wastage"));
  const payload: WastageDoc = {
    inventoryId: input.inventoryId,
    item: input.item,
    qty: num(input.qty),
    unit: input.unit,
    reason: input.reason,
    notes: input.notes || "",
    costImpact: num(input.costImpact),
    approvalStatus: input.approve === false ? "pending" : "approved",
    date: isoDate(),
    syncStatus: "synced",
    ...auditCreate({ status: input.approve === false ? "pending" : "approved" })
  };
  await setDoc(ref, payload);
  await logActivity({
    action: "wastage_recorded",
    entityType: "wastage",
    entityId: ref.id,
    message: `${input.item} −${input.qty}`
  });
  return ref.id;
}

export async function createStockTransfer(input: {
  inventoryId: string;
  item: string;
  qty: number;
  unit?: string;
  fromLocation: string;
  toLocation: string;
  reason?: string;
  autoComplete?: boolean;
}) {
  if (num(input.qty) <= 0) throw new Error("Transfer qty required");
  if (!input.fromLocation || !input.toLocation) throw new Error("Source and destination required");
  if (input.fromLocation === input.toLocation) throw new Error("Locations must differ");

  const ref = doc(collection(db, "stockTransfers"));
  const payload: StockTransferDoc = {
    transferNumber: `TR-${Date.now().toString(36).toUpperCase()}`,
    inventoryId: input.inventoryId,
    item: input.item,
    qty: num(input.qty),
    unit: input.unit,
    fromLocation: input.fromLocation,
    toLocation: input.toLocation,
    approvalStatus: "approved",
    transferStatus: input.autoComplete === false ? "pending" : "completed",
    reason: input.reason || "",
    syncStatus: "synced",
    ...auditCreate({ status: "completed" })
  };
  await setDoc(ref, payload);

  await setDoc(
    doc(db, "inventory", input.inventoryId),
    { storageLocation: input.toLocation, ...auditUpdate() },
    { merge: true }
  );

  // Location transfer ledger (qty unchanged within same inventory record)
  const movRef = doc(collection(db, "inventory_movements"));
  await setDoc(movRef, {
    inventoryId: input.inventoryId,
    item: input.item,
    unit: input.unit,
    delta: 0,
    type: "transfer",
    reason: `${input.fromLocation} → ${input.toLocation} · qty ${input.qty}`,
    date: isoDate(),
    transferId: ref.id,
    syncStatus: "synced",
    ...auditCreate({ status: "posted" })
  });

  await logActivity({
    action: "stock_transfer",
    entityType: "stockTransfers",
    entityId: ref.id,
    message: `${input.item} ${input.qty} ${input.fromLocation}→${input.toLocation}`
  });
  return ref.id;
}

export async function savePhysicalCount(input: {
  lines: PhysicalCountDoc["lines"];
  applyAdjustments?: boolean;
}) {
  if (!input.lines?.length) throw new Error("No count lines");
  const varianceTotal = input.lines.reduce((s, l) => s + Math.abs(num(l.variance)), 0);
  const ref = doc(collection(db, "physicalStock"));
  const payload: PhysicalCountDoc = {
    countNumber: `PC-${Date.now().toString(36).toUpperCase()}`,
    date: isoDate(),
    lines: input.lines,
    varianceTotal,
    adjustmentCreated: Boolean(input.applyAdjustments),
    syncStatus: "synced",
    ...auditCreate({ status: "completed" })
  };
  await setDoc(ref, payload);

  if (input.applyAdjustments) {
    for (const line of input.lines) {
      const delta = num(line.actualQty) - num(line.systemQty);
      if (!delta) continue;
      await adjustStock({
        inventoryId: line.inventoryId,
        delta,
        type: "audit_adjustment",
        reason: `Physical count ${payload.countNumber}`,
        date: isoDate(),
        allowNegative: true
      });
    }
  }

  await logActivity({
    action: "physical_count",
    entityType: "physicalStock",
    entityId: ref.id,
    message: `Count variance ${varianceTotal}`
  });
  return ref.id;
}

export const LOCATIONS = ["Kitchen", "Store Room", "Warehouse", "Branch", "Freezer", "Cold Storage"] as const;
