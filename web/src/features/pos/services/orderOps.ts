import { doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auditCreate, auditUpdate, logActivity, saveOrderDoc } from "./posFirestore";
import { computeBillTotals } from "../utils/pricing";
import type { OrderDoc, TaxConfig } from "../types";
import { isoDate, num } from "@/lib/utils";

/** Merge multiple held/open orders into a target order and recalculate taxes. */
export async function mergeOrders(args: {
  targetOrderId: string;
  sourceOrderIds: string[];
  tax: TaxConfig;
}) {
  const targetSnap = await getDoc(doc(db, "orders", args.targetOrderId));
  if (!targetSnap.exists()) throw new Error("Target order not found");
  const target = { id: targetSnap.id, ...(targetSnap.data() as OrderDoc) };
  const sources: OrderDoc[] = [];
  for (const id of args.sourceOrderIds) {
    if (id === args.targetOrderId) continue;
    const s = await getDoc(doc(db, "orders", id));
    if (s.exists()) sources.push({ ...(s.data() as OrderDoc) });
  }
  if (!sources.length) throw new Error("No source orders to merge");

  const items = [...(target.items || [])];
  for (const src of sources) {
    for (const line of src.items || []) {
      items.push({ ...line, lineId: `${line.lineId}_m${Math.random().toString(36).slice(2, 6)}` });
    }
  }

  const totals = computeBillTotals({
    lines: items,
    discount: target.discount || { type: "none", value: 0 },
    couponCode: target.couponCode,
    charges: target.charges || [],
    tax: args.tax,
    taxMode: target.taxMode || args.tax.mode
  });

  const batch = writeBatch(db);
  batch.set(
    doc(db, "orders", args.targetOrderId),
    {
      items,
      mergedOrderIds: [...(target.mergedOrderIds || []), ...args.sourceOrderIds],
      subtotal: totals.subtotal,
      itemDiscountTotal: totals.itemDiscountTotal,
      billDiscount: totals.billDiscount,
      couponDiscount: totals.couponDiscount,
      taxAmount: totals.taxAmount,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      chargesTotal: totals.chargesTotal,
      roundOff: totals.roundOff,
      total: totals.total,
      balanceDue: totals.total - num(target.paidTotal),
      ...auditUpdate({ status: target.status || "held" })
    },
    { merge: true }
  );
  for (const id of args.sourceOrderIds) {
    batch.set(
      doc(db, "orders", id),
      { status: "cancelled", cancelledReason: `Merged into ${args.targetOrderId}`, isDeleted: true, ...auditUpdate() },
      { merge: true }
    );
  }
  await batch.commit();
  await logActivity({
    action: "orders_merged",
    entityType: "orders",
    entityId: args.targetOrderId,
    message: `Merged ${args.sourceOrderIds.length} order(s)`,
    meta: { sourceOrderIds: args.sourceOrderIds }
  });
  return args.targetOrderId;
}

export async function transferTable(orderId: string, fromTableId: string | null, toTableId: string, toTableName: string) {
  const batch = writeBatch(db);
  batch.set(doc(db, "orders", orderId), { tableId: toTableId, tableName: toTableName, ...auditUpdate() }, { merge: true });
  if (fromTableId) {
    batch.set(doc(db, "tables", fromTableId), { status: "cleaning", currentOrderId: null, ...auditUpdate() }, { merge: true });
  }
  batch.set(doc(db, "tables", toTableId), { status: "occupied", currentOrderId: orderId, ...auditUpdate() }, { merge: true });
  await batch.commit();
  await logActivity({
    action: "table_changed",
    entityType: "orders",
    entityId: orderId,
    message: `Transferred to ${toTableName}`
  });
}

export async function createSplitOrders(args: {
  parent: OrderDoc & { id: string };
  buckets: OrderDoc["items"][];
  tax: TaxConfig;
}) {
  const ids: string[] = [];
  for (const items of args.buckets) {
    if (!items.length) continue;
    const totals = computeBillTotals({
      lines: items,
      discount: { type: "none", value: 0 },
      charges: [],
      tax: args.tax,
      taxMode: args.parent.taxMode || args.tax.mode
    });
    const id = await saveOrderDoc(null, {
      date: isoDate(),
      orderType: args.parent.orderType,
      items,
      customerId: args.parent.customerId,
      customerName: args.parent.customerName,
      tableId: args.parent.tableId,
      tableName: args.parent.tableName,
      subtotal: totals.subtotal,
      itemDiscountTotal: 0,
      billDiscount: 0,
      couponDiscount: 0,
      taxAmount: totals.taxAmount,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      charges: [],
      chargesTotal: 0,
      roundOff: totals.roundOff,
      total: totals.total,
      paidTotal: 0,
      balanceDue: totals.total,
      payments: [],
      discount: { type: "none", value: 0 },
      taxMode: args.parent.taxMode || "exclusive",
      splitFromOrderId: args.parent.id,
      status: "held",
      held: true,
      heldAt: new Date().toISOString()
    });
    ids.push(id);
  }
  await logActivity({
    action: "bill_split",
    entityType: "orders",
    entityId: args.parent.id,
    message: `Split into ${ids.length} bills`,
    meta: { ids }
  });
  return ids;
}

export { auditCreate };
