import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import { pushNotification } from "@/features/orders/services/orderEngine";
import type { ExpenseDoc, ExpensePaymentDoc, RecurringExpenseDoc } from "@/features/tasks/types";
import { splitGst, toPaidFrom, toVanillaPaymentMethod, validateInvoiceUnique } from "../utils/gst";

function expenseNumber() {
  return `EXP-${Date.now().toString(36).toUpperCase()}`;
}

async function fileToDataUrl(file: File, maxBytes = 400_000): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
  if (dataUrl.length <= maxBytes) return dataUrl;
  // keep truncated marker for oversized files — caller can still store name
  if (file.type.startsWith("image/")) {
    // canvas compress
    const img = await createImageBitmap(file);
    const scale = Math.min(1, Math.sqrt(maxBytes / dataUrl.length));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(img.width * scale));
    canvas.height = Math.max(1, Math.floor(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl.slice(0, maxBytes);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }
  throw new Error("Attachment too large (max ~400KB). Use a smaller PDF/image.");
}

export async function upsertExpense(
  input: Partial<ExpenseDoc> & { date: string; category: string; amount: number; id?: string },
  opts?: { file?: File | null; existing?: ExpenseDoc[] }
) {
  const amount = num(input.amount);
  if (!(amount > 0)) throw new Error("Amount must be positive");
  if (!input.category?.trim()) throw new Error("Category required");
  if (!validateInvoiceUnique(input.invoiceNumber, opts?.existing || [], input.id)) {
    throw new Error("Duplicate invoice number");
  }

  const status: "paid" | "unpaid" = input.status === "paid" || input.paymentStatus === "paid" ? "paid" : "unpaid";
  const paidFrom = input.paidFrom || toPaidFrom(input.paymentMethod || "cash");
  const paymentMethod = toVanillaPaymentMethod(status, paidFrom === "cash" ? "cash" : "online");

  let attachment = input.attachment ?? null;
  let attachmentName = input.attachmentName || "";
  if (opts?.file) {
    attachment = await fileToDataUrl(opts.file);
    attachmentName = opts.file.name || "bill";
  }

  const gstRate = num((input as any).gstRate ?? (num(input.cgst) + num(input.sgst) + num(input.igst) > 0 ? 5 : 0));
  const gst =
    input.taxableAmount != null || input.cgst != null
      ? {
          taxable: num(input.taxableAmount),
          cgst: num(input.cgst),
          sgst: num(input.sgst),
          igst: num(input.igst),
          total: amount
        }
      : splitGst({
          amount,
          taxInclusive: input.taxInclusive,
          rate: gstRate,
          interstate: num(input.igst) > 0
        });

  const id = input.id || doc(collection(db, "expenses")).id;
  const ref = doc(db, "expenses", id);
  const prev = await getDoc(ref);

  const payload: ExpenseDoc = {
    date: input.date.slice(0, 10),
    category: input.category,
    amount,
    status,
    paymentMethod,
    paidFrom,
    note: input.note || input.description || "",
    description: input.description || input.note || "",
    remarks: input.remarks || "",
    attachment,
    attachmentName,
    recurringId: input.recurringId ?? null,
    expenseNumber: input.expenseNumber || prev.data()?.expenseNumber || expenseNumber(),
    expenseType: input.expenseType || "general",
    vendorId: input.vendorId ?? null,
    vendorName: input.vendorName ?? null,
    branch: input.branch || "Main",
    department: input.department || "",
    employeeId: input.employeeId ?? null,
    employeeName: input.employeeName ?? null,
    paymentStatus: input.paymentStatus || (status === "paid" ? "paid" : "pending"),
    paidAmount: status === "paid" ? amount : num(input.paidAmount),
    gstin: input.gstin || "",
    hsn: input.hsn || "",
    taxableAmount: gst.taxable,
    cgst: gst.cgst,
    sgst: gst.sgst,
    igst: gst.igst,
    tds: num(input.tds),
    taxInclusive: !!input.taxInclusive,
    reverseCharge: !!input.reverseCharge,
    invoiceNumber: input.invoiceNumber || "",
    invoiceDate: input.invoiceDate || input.date,
    approvalStatus: input.approvalStatus || prev.data()?.approvalStatus || "pending",
    approvalComment: input.approvalComment || "",
    approvedBy: input.approvedBy ?? null,
    attachments: input.attachments || (attachment ? [{ name: attachmentName, url: attachment }] : []),
    archived: input.archived ?? false,
    syncStatus: "synced",
    isDeleted: false,
    ...(prev.exists() ? auditUpdate({ status }) : auditCreate({ status }))
  };

  await setDoc(ref, payload, { merge: true });
  await logActivity({
    action: prev.exists() ? "expense_updated" : "expense_created",
    entityType: "expenses",
    entityId: id,
    message: `${payload.category} ${amount}`
  });

  if (!prev.exists()) {
    await pushNotification({
      title: "Expense created",
      body: `${payload.category} · ₹${amount} · ${status}`,
      kind: "payment",
      roleTargets: ["owner", "manager", "admin", "accountant"],
      status: "unread",
      isDeleted: false,
      syncStatus: "synced"
    });
  }

  return id;
}

export async function softDeleteExpense(id: string) {
  await setDoc(doc(db, "expenses", id), { isDeleted: true, ...auditUpdate({ status: "deleted" }) }, { merge: true });
}

export async function archiveExpense(id: string, archived = true) {
  await setDoc(doc(db, "expenses", id), { archived, ...auditUpdate() }, { merge: true });
}

export async function duplicateExpense(id: string) {
  const snap = await getDoc(doc(db, "expenses", id));
  if (!snap.exists()) throw new Error("Expense not found");
  const data = snap.data() as ExpenseDoc;
  return upsertExpense({
    ...data,
    invoiceNumber: data.invoiceNumber ? `${data.invoiceNumber}-COPY` : "",
    status: "unpaid",
    paymentStatus: "pending",
    paymentMethod: "unpaid",
    expenseNumber: undefined,
    date: isoDate()
  });
}

export async function toggleExpensePaid(id: string, paid: boolean, paidFrom: "cash" | "bank" = "cash") {
  const status = paid ? "paid" : "unpaid";
  const paymentMethod = toVanillaPaymentMethod(status, paidFrom);
  await setDoc(
    doc(db, "expenses", id),
    {
      status,
      paymentMethod,
      paidFrom: paid ? paidFrom : undefined,
      paymentStatus: paid ? "paid" : "pending",
      paidAmount: paid ? undefined : 0,
      ...auditUpdate({ status })
    },
    { merge: true }
  );
  if (paid) {
    const snap = await getDoc(doc(db, "expenses", id));
    const amount = num(snap.data()?.amount);
    await recordExpensePayment({
      expenseId: id,
      amount,
      date: isoDate(),
      method: paidFrom === "cash" ? "cash" : "online"
    });
  }
  await logActivity({
    action: paid ? "expense_paid" : "expense_unpaid",
    entityType: "expenses",
    entityId: id,
    message: status
  });
}

export async function recordExpensePayment(input: {
  expenseId: string;
  amount: number;
  date: string;
  method: ExpensePaymentDoc["method"];
  note?: string;
}) {
  if (!(num(input.amount) > 0)) throw new Error("Payment amount required");
  const ref = doc(collection(db, "expensePayments"));
  const payload: ExpensePaymentDoc = {
    expenseId: input.expenseId,
    amount: num(input.amount),
    date: input.date,
    method: input.method,
    note: input.note || "",
    syncStatus: "synced",
    ...auditCreate({ status: "posted" })
  };
  await setDoc(ref, payload);

  const expRef = doc(db, "expenses", input.expenseId);
  const snap = await getDoc(expRef);
  if (snap.exists()) {
    const total = num(snap.data().amount);
    const paidSoFar = num(snap.data().paidAmount) + num(input.amount);
    const fully = paidSoFar >= total;
    const method = input.method === "cash" ? "cash" : "online";
    await setDoc(
      expRef,
      {
        paidAmount: Math.min(paidSoFar, total),
        paymentStatus: fully ? "paid" : "partial",
        status: fully ? "paid" : "unpaid",
        paymentMethod: fully ? method : "unpaid",
        paidFrom: fully ? toPaidFrom(method) : snap.data().paidFrom,
        ...auditUpdate()
      },
      { merge: true }
    );
  }
  return ref.id;
}

export async function decideExpenseApproval(id: string, decision: "approved" | "rejected", comment?: string, by?: string) {
  await setDoc(
    doc(db, "expenses", id),
    {
      approvalStatus: decision,
      approvalComment: comment || "",
      approvedBy: by || null,
      ...auditUpdate({ status: decision })
    },
    { merge: true }
  );
  await setDoc(doc(collection(db, "expenseApprovals")), {
    expenseId: id,
    decision,
    comment: comment || "",
    decidedBy: by || null,
    ...auditCreate({ status: decision })
  });
  await pushNotification({
    title: `Expense ${decision}`,
    body: comment || id,
    kind: "payment",
    roleTargets: ["owner", "manager", "admin", "accountant"],
    status: "unread",
    isDeleted: false,
    syncStatus: "synced"
  });
  await logActivity({
    action: decision === "approved" ? "expense_approved" : "expense_rejected",
    entityType: "expenses",
    entityId: id,
    message: comment || decision
  });
}

export async function upsertRecurringExpense(input: Partial<RecurringExpenseDoc> & { title: string; category: string; amount: number; dayOfMonth: number; id?: string }) {
  if (!(num(input.amount) > 0)) throw new Error("Amount required");
  const id = input.id || doc(collection(db, "recurring_expenses")).id;
  const payload: RecurringExpenseDoc = {
    title: input.title.trim(),
    category: input.category,
    amount: num(input.amount),
    dayOfMonth: Math.min(28, Math.max(1, Math.floor(num(input.dayOfMonth) || 1))),
    paymentMethod: input.paymentMethod || "online",
    active: input.active ?? true,
    vendorName: input.vendorName ?? null,
    branch: input.branch || "Main",
    syncStatus: "synced",
    ...auditCreate({ status: "active" })
  };
  await setDoc(doc(db, "recurring_expenses", id), payload, { merge: true });
  return id;
}

export async function removeRecurringExpense(id: string) {
  await setDoc(doc(db, "recurring_expenses", id), { active: false, isDeleted: true, ...auditUpdate({ status: "inactive" }) }, { merge: true });
}

/** Mirror vanilla processRecurringExpenses — call on expense dashboard mount */
export async function processRecurringExpenses() {
  const snap = await getDocs(collection(db, "recurring_expenses"));
  const today = isoDate();
  const day = Number(today.slice(8, 10));
  const month = today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);

  for (const d of snap.docs) {
    const rec = d.data() as RecurringExpenseDoc;
    if (rec.active === false || rec.isDeleted) continue;
    const dueDay = Math.min(28, Math.max(1, Math.floor(num(rec.dayOfMonth) || 1)));
    if (day < dueDay) continue;

    const existing = await getDocs(query(collection(db, "expenses"), where("recurringId", "==", d.id)));
    const already = existing.docs.some((e) => String(e.data().date || "").slice(0, 7) === month && !e.data().isDeleted);
    if (already) continue;

    const dueDate = `${month}-${String(dueDay).padStart(2, "0")}`;
    // validate date (e.g. Feb)
    const check = new Date(y, m - 1, dueDay);
    const safeDate = check.getMonth() === m - 1 ? dueDate : today;

    await upsertExpense({
      date: safeDate,
      category: rec.category || "misc",
      amount: num(rec.amount),
      status: "unpaid",
      paymentMethod: "unpaid",
      note: `Recurring: ${rec.title || ""}`,
      recurringId: d.id,
      vendorName: rec.vendorName,
      branch: rec.branch,
      approvalStatus: "approved"
    });
  }
}
