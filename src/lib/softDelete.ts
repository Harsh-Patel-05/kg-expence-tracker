import { collection, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";

function saleDateKey(data: Record<string, unknown>): string {
  const raw = data.date ?? data.saleDate ?? data.billDate;
  if (typeof raw === "string") return raw.slice(0, 10);
  if (raw && typeof raw === "object" && typeof (raw as { toDate?: () => Date }).toDate === "function") {
    try {
      return (raw as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
    } catch {
      /* ignore */
    }
  }
  return "";
}

/** Soft-delete every sales row on a calendar day (balances reverse on recompute). Expenses untouched. */
export async function softDeleteSalesOnDate(dateISO: string, reason = "Day cleared by user") {
  const date = String(dateISO || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");

  // Prefer exact date match; only fall back to a bounded recent scan if nothing matches
  const exact = await getDocs(query(collection(db, "sales"), where("date", "==", date)));
  let docs = exact.docs;
  if (!docs.length) {
    const recent = await getDocs(query(collection(db, "sales"), where("date", ">=", date.slice(0, 7) + "-01")));
    docs = recent.docs;
  }

  const batch = writeBatch(db);
  let n = 0;
  for (const d of docs) {
    const data = d.data() as Record<string, unknown>;
    if (saleDateKey(data) !== date) continue;
    if (data.isDeleted || String(data.status || "").toLowerCase() === "void") continue;
    batch.set(
      d.ref,
      {
        isDeleted: true,
        status: "void",
        countsAsRevenue: false,
        deletedReason: reason,
        ...auditUpdate({ status: "void" })
      },
      { merge: true }
    );
    n++;
  }
  if (n > 0) {
    const logRef = doc(collection(db, "activityLogs"));
    batch.set(logRef, {
      ...auditCreate({ status: "recorded" }),
      action: "sales_day_cleared",
      entityType: "sales",
      entityId: date,
      message: `${reason} · ${n} sales rows only (expenses not touched)`
    } as Record<string, unknown>);
    await batch.commit();
  }
  return n;
}

/** Soft-delete a sales row so cash/online balances reverse on next recompute. */
export async function softDeleteSale(id: string, reason = "Deleted by user") {
  await setDoc(
    doc(db, "sales", id),
    {
      isDeleted: true,
      status: "void",
      countsAsRevenue: false,
      deletedReason: reason,
      ...auditUpdate({ status: "void" })
    },
    { merge: true }
  );
  await logActivity({
    action: "sale_deleted",
    entityType: "sales",
    entityId: id,
    message: reason
  });
}

/** Soft-delete staff advance — restores cash/online that the advance had deducted. */
export async function softDeleteAdvance(id: string, reason = "Deleted by user") {
  await setDoc(
    doc(db, "advances", id),
    {
      isDeleted: true,
      deletedReason: reason,
      ...auditUpdate({ status: "deleted" })
    },
    { merge: true }
  );
  await logActivity({
    action: "advance_deleted",
    entityType: "advances",
    entityId: id,
    message: reason
  });
}

/**
 * Soft-delete an order from history and void any linked sales docs
 * so shop cash/online balances reverse.
 */
export async function softDeleteOrderWithSales(orderId: string, reason = "Deleted from order history") {
  const orderRef = doc(db, "orders", orderId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) throw new Error("Order not found");
  const order = snap.data() as { saleId?: string | null; invoiceNo?: string };

  const batch = writeBatch(db);
  batch.set(
    orderRef,
    {
      status: "cancelled",
      isDeleted: true,
      cancelledReason: reason,
      held: false,
      payLater: false,
      ...auditUpdate({ status: "deleted" })
    },
    { merge: true }
  );

  const voidSale = (saleId: string) => {
    batch.set(
      doc(db, "sales", saleId),
      {
        isDeleted: true,
        status: "void",
        countsAsRevenue: false,
        deletedReason: reason,
        ...auditUpdate({ status: "void" })
      },
      { merge: true }
    );
  };

  if (order.saleId) voidSale(String(order.saleId));

  const orderDate = String((order as { date?: string }).date || "").slice(0, 10);
  const invoiceNo = String(order.invoiceNo || "").trim();
  const [byOrder, byDate] = await Promise.all([
    getDocs(query(collection(db, "sales"), where("orderId", "==", orderId))),
    orderDate
      ? getDocs(query(collection(db, "sales"), where("date", "==", orderDate)))
      : Promise.resolve(null)
  ]);
  for (const d of byOrder.docs) voidSale(d.id);
  if (byDate && invoiceNo) {
    for (const d of byDate.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.isDeleted || String(data.status || "").toLowerCase() === "void") continue;
      const inv = String(data.invoiceNo || "");
      const notes = String(data.notes || "");
      if (inv === invoiceNo || notes.includes(invoiceNo)) voidSale(d.id);
    }
  }

  const logRef = doc(collection(db, "activityLogs"));
  batch.set(
    logRef,
    {
      ...auditCreate({ status: "recorded" }),
      action: "order_deleted",
      entityType: "orders",
      entityId: orderId,
      message: `${order.invoiceNo || orderId}: ${reason}`
    } as Record<string, unknown>
  );

  await batch.commit();
}
