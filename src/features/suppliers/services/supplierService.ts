import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import { pushNotification } from "@/features/orders/services/orderEngine";
import { upsertVendor } from "@/features/inventory/services/purchaseService";
import type { SupplierContactLogDoc, SupplierPaymentDoc, SupplierRatingDoc } from "../types";
import { validateGstin } from "../types";
import type { PurchaseEntryDoc, VendorDoc } from "@/features/inventory/types";

function supplierCode() {
  return `SUP-${Date.now().toString(36).toUpperCase()}`;
}

export async function upsertSupplier(input: Partial<VendorDoc> & { name: string; id?: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("Supplier name required");
  if (!validateGstin(input.gstin)) throw new Error("Invalid GSTIN format");

  // duplicate name / code check
  const snap = await getDocs(collection(db, "suppliers"));
  const dupName = snap.docs.find(
    (d) => d.id !== input.id && String(d.data().name || "").toLowerCase() === name.toLowerCase() && !d.data().isDeleted && !d.data().archived
  );
  if (dupName && !input.id) throw new Error("Duplicate supplier name");
  if (input.supplierCode) {
    const dupCode = snap.docs.find(
      (d) => d.id !== input.id && String(d.data().supplierCode || "").toLowerCase() === String(input.supplierCode).toLowerCase()
    );
    if (dupCode) throw new Error("Duplicate supplier code");
  }

  const id = await upsertVendor({
    id: input.id,
    name,
    gstin: input.gstin,
    pan: input.pan,
    contact: input.contact,
    email: input.email,
    phone: input.phone,
    whatsapp: input.whatsapp,
    address: input.address,
    paymentTerms: input.paymentTerms,
    creditLimit: input.creditLimit,
    outstanding: input.outstanding,
    rating: input.rating,
    documents: input.documents,
    items: input.items
  });

  // enterprise extensions (merge)
  await setDoc(
    doc(db, "suppliers", id),
    {
      supplierCode: input.supplierCode || snap.docs.find((d) => d.id === id)?.data()?.supplierCode || supplierCode(),
      companyName: input.companyName || name,
      website: input.website || "",
      city: input.city || "",
      state: input.state || "",
      country: input.country || "India",
      pincode: input.pincode || "",
      bankAccount: input.bankAccount || "",
      ifsc: input.ifsc || "",
      upi: input.upi || "",
      creditDays: num(input.creditDays) || 30,
      preferredCurrency: input.preferredCurrency || "INR",
      deliveryDays: num(input.deliveryDays),
      category: input.category || "General",
      notes: input.notes || "",
      nextFollowUp: input.nextFollowUp ?? null,
      qualityRating: num(input.qualityRating),
      deliveryRating: num(input.deliveryRating),
      pricingRating: num(input.pricingRating),
      serviceRating: num(input.serviceRating),
      attachments: input.attachments || [],
      archived: input.archived ?? false,
      syncStatus: "synced",
      ...auditUpdate({ status: input.archived ? "archived" : "active" })
    },
    { merge: true }
  );

  return id;
}

export async function softDeleteSupplier(id: string) {
  await setDoc(doc(db, "suppliers", id), { isDeleted: true, ...auditUpdate({ status: "deleted" }) }, { merge: true });
}

export async function archiveSupplier(id: string, archived = true) {
  await setDoc(doc(db, "suppliers", id), { archived, ...auditUpdate({ status: archived ? "archived" : "active" }) }, { merge: true });
}

export async function duplicateSupplier(id: string) {
  const snap = await getDoc(doc(db, "suppliers", id));
  if (!snap.exists()) throw new Error("Supplier not found");
  const data = snap.data() as VendorDoc;
  return upsertSupplier({
    ...data,
    name: `${data.name} (copy)`,
    supplierCode: undefined,
    gstin: "",
    outstanding: 0
  });
}

export async function mergeSuppliers(keepId: string, mergeId: string) {
  if (keepId === mergeId) throw new Error("Cannot merge a supplier into itself");
  const keep = await getDoc(doc(db, "suppliers", keepId));
  const merge = await getDoc(doc(db, "suppliers", mergeId));
  if (!keep.exists() || !merge.exists()) throw new Error("Supplier not found");
  const keepName = String(keep.data().name || "");
  const mergeName = String(merge.data().name || "");

  // re-point purchases seller name
  const purchases = await getDocs(collection(db, "purchases"));
  for (const d of purchases.docs) {
    const seller = String(d.data().seller || d.data().vendorName || "");
    if (seller.toLowerCase() === mergeName.toLowerCase() || d.data().vendorId === mergeId) {
      await setDoc(d.ref, { seller: keepName, vendorName: keepName, vendorId: keepId, ...auditUpdate() }, { merge: true });
    }
  }
  const payments = await getDocs(collection(db, "supplierPayments"));
  for (const d of payments.docs) {
    if (String(d.data().seller || "").toLowerCase() === mergeName.toLowerCase() || d.data().supplierId === mergeId) {
      await setDoc(d.ref, { seller: keepName, supplierId: keepId, ...auditUpdate() }, { merge: true });
    }
  }

  await softDeleteSupplier(mergeId);
  await logActivity({
    action: "supplier_merged",
    entityType: "suppliers",
    entityId: keepId,
    message: `${mergeName} → ${keepName}`
  });
}

export async function recordSupplierPayment(input: {
  seller: string;
  supplierId?: string | null;
  amount: number;
  date?: string;
  method?: SupplierPaymentDoc["method"];
  note?: string;
  referenceNumber?: string;
  receiptUrl?: string | null;
  purchaseId?: string | null;
}) {
  if (!(num(input.amount) > 0)) throw new Error("Payment amount required");
  if (!input.seller?.trim()) throw new Error("Supplier required");

  const ref = doc(collection(db, "supplierPayments"));
  const payload: SupplierPaymentDoc = {
    date: input.date || isoDate(),
    seller: input.seller.trim(),
    supplierId: input.supplierId || null,
    amount: num(input.amount),
    method: input.method || "cash",
    note: input.note || "",
    referenceNumber: input.referenceNumber || "",
    receiptUrl: input.receiptUrl ?? null,
    purchaseId: input.purchaseId ?? null,
    syncStatus: "synced",
    ...auditCreate({ status: "posted" })
  };
  await setDoc(ref, payload);

  // refresh outstanding on supplier
  if (input.supplierId) {
    const sref = doc(db, "suppliers", input.supplierId);
    const s = await getDoc(sref);
    if (s.exists()) {
      const outstanding = Math.max(0, num(s.data().outstanding) - num(input.amount));
      await setDoc(sref, { outstanding, creditUsed: outstanding, ...auditUpdate() }, { merge: true });
      const limit = num(s.data().creditLimit);
      if (limit > 0 && outstanding >= limit) {
        await pushNotification({
          title: "Credit limit reached",
          body: `${input.seller} outstanding ${outstanding}`,
          kind: "payment",
          roleTargets: ["owner", "manager", "admin", "accountant"],
          status: "unread",
          isDeleted: false,
          syncStatus: "synced"
        });
      }
    }
  }

  await logActivity({
    action: "supplier_payment",
    entityType: "supplierPayments",
    entityId: ref.id,
    message: `${input.seller} ${input.amount}`
  });

  await setDoc(doc(collection(db, "supplierActivity")), {
    supplierId: input.supplierId || null,
    supplierName: input.seller,
    action: "payment",
    message: `Paid ${input.amount}`,
    ...auditCreate({ status: "recorded" })
  });

  await pushNotification({
    title: "Supplier payment",
    body: `${input.seller} · ₹${input.amount}`,
    kind: "payment",
    roleTargets: ["owner", "manager", "admin", "accountant"],
    status: "unread",
    isDeleted: false,
    syncStatus: "synced"
  });

  return ref.id;
}

export async function saveSupplierRating(input: {
  supplierId: string;
  supplierName: string;
  quality: number;
  delivery: number;
  pricing: number;
  service: number;
  notes?: string;
}) {
  const overall = (num(input.quality) + num(input.delivery) + num(input.pricing) + num(input.service)) / 4;
  const ref = doc(collection(db, "supplierRatings"));
  const payload: SupplierRatingDoc = {
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    quality: num(input.quality),
    delivery: num(input.delivery),
    pricing: num(input.pricing),
    service: num(input.service),
    overall,
    notes: input.notes || "",
    syncStatus: "synced",
    ...auditCreate({ status: "active" })
  };
  await setDoc(ref, payload);
  await setDoc(
    doc(db, "suppliers", input.supplierId),
    {
      rating: overall,
      qualityRating: num(input.quality),
      deliveryRating: num(input.delivery),
      pricingRating: num(input.pricing),
      serviceRating: num(input.service),
      ...auditUpdate()
    },
    { merge: true }
  );
  return ref.id;
}

export async function logSupplierContact(input: {
  supplierId: string;
  supplierName: string;
  channel: SupplierContactLogDoc["channel"];
  note: string;
  nextFollowUp?: string | null;
}) {
  const ref = doc(collection(db, "supplierContacts"));
  const payload: SupplierContactLogDoc = {
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    channel: input.channel,
    note: input.note,
    nextFollowUp: input.nextFollowUp ?? null,
    syncStatus: "synced",
    ...auditCreate({ status: "logged" })
  };
  await setDoc(ref, payload);
  if (input.nextFollowUp) {
    await setDoc(doc(db, "suppliers", input.supplierId), { nextFollowUp: input.nextFollowUp, ...auditUpdate() }, { merge: true });
  }
  return ref.id;
}

export async function syncSupplierOutstanding(supplierId: string, outstanding: number) {
  await setDoc(
    doc(db, "suppliers", supplierId),
    { outstanding, creditUsed: outstanding, ...auditUpdate() },
    { merge: true }
  );
}

/** Classic addPurchase — supplier bill row (no stock movement). */
export async function createClassicSupplierBill(input: {
  date: string;
  seller: string;
  supplierId?: string | null;
  item: string;
  qty: number;
  rate: number;
  price: number;
  expiryDate?: string;
  paidStatus: "paid" | "unpaid";
  paymentMethod: "cash" | "online";
}) {
  if (!input.seller?.trim()) throw new Error("Select supplier");
  if (!input.item?.trim()) throw new Error("Item required");
  if (!(num(input.price) > 0)) throw new Error("Amount required");

  const ref = doc(collection(db, "purchases"));
  const paid = input.paidStatus === "paid";
  const method = paid ? (input.paymentMethod === "online" ? "online" : "cash") : "unpaid";

  const payload: PurchaseEntryDoc = {
    date: input.date,
    invoiceDate: input.date,
    seller: input.seller.trim(),
    vendorName: input.seller.trim(),
    vendorId: input.supplierId || null,
    item: input.item.trim(),
    qty: num(input.qty),
    price: num(input.price),
    lines: [],
    total: num(input.price),
    paidStatus: paid ? "paid" : "unpaid",
    paymentStatus: paid ? "paid" : "unpaid",
    paymentMethod: method as PurchaseEntryDoc["paymentMethod"],
    notes: input.expiryDate ? `Expiry ${input.expiryDate}` : "",
    syncStatus: "synced",
    ...auditCreate({ status: paid ? "paid" : "unpaid" })
  };
  await setDoc(ref, payload);

  if (input.supplierId && !paid) {
    const sref = doc(db, "suppliers", input.supplierId);
    const s = await getDoc(sref);
    if (s.exists()) {
      const outstanding = num(s.data().outstanding) + num(input.price);
      await setDoc(sref, { outstanding, creditUsed: outstanding, ...auditUpdate() }, { merge: true });
    }
  }

  await logActivity({
    action: "purchase_created",
    entityType: "purchases",
    entityId: ref.id,
    message: `${input.seller} · ${input.item} · ${input.price}`
  });

  return ref.id;
}

export async function addSupplierWithItems(input: {
  name: string;
  items: Array<{ name: string; rate?: number }>;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Enter supplier name");
  return upsertSupplier({
    name,
    gstin: "",
    items: input.items.map((it) => ({ name: it.name, rate: num(it.rate) }))
  });
}
