import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import { leaveDays } from "../utils/payroll";
import type { AdvanceDoc, IncentiveDoc, LeaveRequestDoc, SalaryDoc, TipDoc } from "../types";
import { pushNotification } from "@/features/orders/services/orderEngine";

export async function createLeaveRequest(input: {
  name: string;
  staffId?: string | null;
  leaveType: LeaveRequestDoc["leaveType"];
  fromDate: string;
  toDate: string;
  reason?: string;
}) {
  const days = leaveDays(input.fromDate, input.toDate);
  if (days <= 0) throw new Error("Invalid leave dates");
  const ref = doc(collection(db, "leaveRequests"));
  const payload: LeaveRequestDoc = {
    name: input.name,
    staffId: input.staffId || null,
    leaveType: input.leaveType,
    fromDate: input.fromDate,
    toDate: input.toDate,
    days,
    reason: input.reason || "",
    approvalStatus: "pending",
    syncStatus: "synced",
    ...auditCreate({ status: "pending" })
  };
  await setDoc(ref, payload);
  await logActivity({
    action: "leave_requested",
    entityType: "leaveRequests",
    entityId: ref.id,
    message: `${input.name} ${input.leaveType} ${days}d`
  });
  await pushNotification({
    title: "Leave request",
    body: `${input.name} · ${input.leaveType} · ${days} day(s)`,
    kind: "info",
    roleTargets: ["manager", "owner", "admin"],
    status: "unread",
    isDeleted: false,
    syncStatus: "synced"
  });
  return ref.id;
}

export async function decideLeave(id: string, decision: "approved" | "rejected", comment?: string) {
  await setDoc(
    doc(db, "leaveRequests", id),
    {
      approvalStatus: decision,
      managerComment: comment || "",
      status: decision,
      ...auditUpdate()
    },
    { merge: true }
  );
  await logActivity({
    action: decision === "approved" ? "leave_approved" : "leave_rejected",
    entityType: "leaveRequests",
    entityId: id,
    message: comment || decision
  });
}

export async function createAdvance(input: {
  name: string;
  staffId?: string | null;
  amount: number;
  date?: string;
  month?: string;
  method?: AdvanceDoc["method"];
  note?: string;
}) {
  if (num(input.amount) <= 0) throw new Error("Advance amount required");
  const date = input.date || isoDate();
  const month = input.month || date.slice(0, 7);
  const ref = doc(collection(db, "advances"));
  const payload: AdvanceDoc = {
    date,
    month,
    name: input.name,
    staffId: input.staffId || null,
    amount: num(input.amount),
    method: input.method || "cash",
    note: input.note || "",
    recovered: 0,
    syncStatus: "synced",
    ...auditCreate({ status: "open" })
  };
  await setDoc(ref, payload);
  await logActivity({
    action: "advance_created",
    entityType: "advances",
    entityId: ref.id,
    message: `${input.name} ${input.amount}`
  });
  return ref.id;
}

export async function createIncentive(input: {
  name: string;
  staffId?: string | null;
  amount: number;
  type: IncentiveDoc["type"];
  month?: string;
  date?: string;
  note?: string;
}) {
  const date = input.date || isoDate();
  const ref = doc(collection(db, "incentives"));
  const payload: IncentiveDoc = {
    date,
    month: input.month || date.slice(0, 7),
    name: input.name,
    staffId: input.staffId || null,
    type: input.type,
    amount: num(input.amount),
    note: input.note || "",
    syncStatus: "synced",
    ...auditCreate({ status: "posted" })
  };
  await setDoc(ref, payload);
  return ref.id;
}

export async function createTip(input: {
  amount: number;
  mode: TipDoc["mode"];
  name?: string;
  staffId?: string | null;
  date?: string;
}) {
  const ref = doc(collection(db, "tips"));
  const payload: TipDoc = {
    date: input.date || isoDate(),
    amount: num(input.amount),
    mode: input.mode,
    name: input.name,
    staffId: input.staffId || null,
    settled: false,
    syncStatus: "synced",
    ...auditCreate({ status: "open" })
  };
  await setDoc(ref, payload);
  return ref.id;
}

export async function postSalary(input: {
  name: string;
  staffId?: string | null;
  month: string;
  amount: number;
  netSalary?: number;
  advanceAdjusted?: number;
  basic?: number;
  status?: "paid" | "unpaid";
  paymentMethod?: SalaryDoc["paymentMethod"];
}) {
  if (num(input.amount) < 0) throw new Error("Invalid salary amount");
  const ref = doc(collection(db, "salaries"));
  const status = input.status || "unpaid";
  const payload: SalaryDoc = {
    month: input.month,
    name: input.name,
    staffId: input.staffId || null,
    amount: num(input.amount),
    netSalary: num(input.netSalary ?? input.amount),
    advanceAdjusted: num(input.advanceAdjusted),
    basic: num(input.basic ?? input.amount),
    status,
    paymentMethod: input.paymentMethod || "cash",
    paidAt: status === "paid" ? isoDate() : null,
    syncStatus: "synced",
    ...auditCreate({ status })
  };
  await setDoc(ref, payload);

  // payroll history copy
  const href = doc(collection(db, "payrollHistory"));
  await setDoc(href, { ...payload, salaryId: ref.id, ...auditCreate({ status }) });

  await logActivity({
    action: "salary_generated",
    entityType: "salaries",
    entityId: ref.id,
    message: `${input.name} ${input.month} ${input.amount}`
  });
  return ref.id;
}

export async function toggleSalaryPaid(id: string, paid: boolean, method?: SalaryDoc["paymentMethod"]) {
  const ref = doc(db, "salaries", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Salary not found");
  await setDoc(
    ref,
    {
      status: paid ? "paid" : "unpaid",
      paidAt: paid ? isoDate() : null,
      paymentMethod: method || snap.data().paymentMethod || "cash",
      ...auditUpdate()
    },
    { merge: true }
  );
}
