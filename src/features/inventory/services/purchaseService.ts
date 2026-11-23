import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import { adjustStock, upsertInventoryItem } from "./stockService";
import type { PurchaseEntryDoc, PurchaseLine, VendorDoc } from "../types";

export async function upsertVendor(input: Partial<VendorDoc> & { name: string; id?: string }) {
  const id = input.id || doc(collection(db, "suppliers")).id;
  const ref = doc(db, "suppliers", id);
  const existing = await getDoc(ref);
  await setDoc(
    ref,
    {
      name: input.name.trim(),
      gstin: input.gstin || "",
      pan: input.pan || "",
      contact: input.contact || "",
      email: input.email || "",
      phone: input.phone || "",
      whatsapp: input.whatsapp || "",
      address: input.address || "",
      paymentTerms: input.paymentTerms || "",
      creditLimit: num(input.creditLimit),
      outstanding: num(input.outstanding),
      rating: num(input.rating),
      documents: input.documents || [],
      items: input.items || [],
      syncStatus: "synced",
      ...(existing.exists() ? auditUpdate() : auditCreate({ status: "active" }))
    },
    { merge: true }
  );
  await logActivity({
    action: existing.exists() ? "vendor_updated" : "vendor_created",
    entityType: "suppliers",
    entityId: id,
    message: input.name
  });
  return id;
}

export async function createPurchaseEntry(input: {
  vendorId?: string | null;
  vendorName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  lines: PurchaseLine[];
  discount?: number;
  freight?: number;
  otherCharges?: number;
  paymentStatus?: "paid" | "unpaid" | "partial";
  paymentMethod?: "cash" | "online";
  notes?: string;
}) {
  if (!input.lines?.length) throw new Error("Add at least one purchase line");

  let subtotal = 0;
  let gstAmount = 0;
  for (const line of input.lines) {
    const lineBase = num(line.qty) * num(line.rate) - num(line.discount);
    subtotal += lineBase;
    gstAmount += (lineBase * num(line.gstRate)) / 100;
  }
  const total = subtotal + gstAmount + num(input.freight) + num(input.otherCharges) - num(input.discount);
  const purchaseRef = doc(collection(db, "purchases"));
  const purchaseNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

  // Ensure inventory items exist + increase stock per line
  for (const line of input.lines) {
    const invId =
      line.inventoryId ||
      (await upsertInventoryItem({
        item: line.item,
        unit: line.unit || "pcs",
        qty: 0,
        kind: "raw"
      }));
    await adjustStock({
      inventoryId: invId,
      delta: num(line.qty),
      type: "purchase",
      reason: `Purchase ${purchaseNumber}`,
      date: input.invoiceDate || isoDate(),
      createLot: true,
      supplier: input.vendorName || "",
      expiryDate: line.expiryDate,
      mfgDate: line.mfgDate,
      batchNumber: line.batchNumber,
      cost: num(line.rate),
      purchaseId: purchaseRef.id
    });
    line.inventoryId = invId;
  }

  const first = input.lines[0];
  const payload: PurchaseEntryDoc = {
    purchaseNumber,
    vendorId: input.vendorId || null,
    vendorName: input.vendorName || "",
    invoiceNumber: input.invoiceNumber || "",
    invoiceDate: input.invoiceDate || isoDate(),
    date: input.invoiceDate || isoDate(),
    lines: input.lines,
    item: first.item,
    qty: first.qty,
    price: total,
    seller: input.vendorName || "",
    paidStatus: input.paymentStatus === "paid" ? "paid" : "unpaid",
    paymentStatus: input.paymentStatus === "paid" ? "paid" : "unpaid",
    paymentMethod: input.paymentStatus === "paid" ? (input.paymentMethod === "online" ? "online" : "cash") : "unpaid",
    subtotal,
    gstAmount,
    discount: num(input.discount),
    freight: num(input.freight),
    otherCharges: num(input.otherCharges),
    total,
    notes: input.notes || "",
    syncStatus: "synced",
    ...auditCreate({ status: input.paymentStatus || "unpaid" })
  };

  await setDoc(purchaseRef, payload);

  if (input.vendorId && (input.paymentStatus || "unpaid") !== "paid") {
    const vref = doc(db, "suppliers", input.vendorId);
    const vsnap = await getDoc(vref);
    if (vsnap.exists()) {
      const outstanding = num(vsnap.data().outstanding) + total;
      await setDoc(vref, { outstanding, ...auditUpdate() }, { merge: true });
    }
  }

  await logActivity({
    action: "purchase_created",
    entityType: "purchases",
    entityId: purchaseRef.id,
    message: `${purchaseNumber} · ${total}`,
    meta: { vendorName: input.vendorName }
  });

  return purchaseRef.id;
}
