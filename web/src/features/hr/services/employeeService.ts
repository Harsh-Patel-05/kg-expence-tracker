import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import type { AttendanceDoc, EmployeeDoc, FixedSalaryDoc } from "../types";

export async function upsertEmployee(input: Partial<EmployeeDoc> & { name: string; id?: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("Employee name required");

  let id = input.id;
  if (!id) {
    const snap = await getDocs(collection(db, "staff"));
    const existing = snap.docs.find((d) => String(d.data().name || "").toLowerCase() === name.toLowerCase());
    id = existing?.id || doc(collection(db, "staff")).id;
  }

  // Duplicate employee code check
  if (input.employeeCode) {
    const all = await getDocs(collection(db, "staff"));
    const dup = all.docs.find(
      (d) => d.id !== id && String(d.data().employeeCode || "").toLowerCase() === String(input.employeeCode).toLowerCase()
    );
    if (dup) throw new Error("Duplicate employee code");
  }

  const ref = doc(db, "staff", id);
  const prev = await getDoc(ref);
  await setDoc(
    ref,
    {
      name,
      employeeCode: input.employeeCode || prev.data()?.employeeCode || `EMP-${Date.now().toString(36).toUpperCase()}`,
      photoUrl: input.photoUrl ?? prev.data()?.photoUrl ?? "",
      gender: input.gender ?? prev.data()?.gender ?? "",
      dob: input.dob ?? prev.data()?.dob ?? "",
      joiningDate: input.joiningDate ?? prev.data()?.joiningDate ?? isoDate(),
      department: input.department ?? prev.data()?.department ?? "Kitchen",
      designation: input.designation ?? prev.data()?.designation ?? "",
      role: input.role ?? prev.data()?.role ?? "employee",
      managerId: input.managerId ?? prev.data()?.managerId ?? null,
      managerName: input.managerName ?? prev.data()?.managerName ?? null,
      email: input.email ?? prev.data()?.email ?? "",
      phone: input.phone ?? prev.data()?.phone ?? "",
      whatsapp: input.whatsapp ?? prev.data()?.whatsapp ?? "",
      emergencyContact: input.emergencyContact ?? prev.data()?.emergencyContact ?? "",
      address: input.address ?? prev.data()?.address ?? "",
      branch: input.branch ?? prev.data()?.branch ?? "Main",
      salaryType: input.salaryType ?? prev.data()?.salaryType ?? "monthly",
      monthlySalary: num(input.monthlySalary ?? prev.data()?.monthlySalary),
      dailyWage: num(input.dailyWage ?? prev.data()?.dailyWage),
      hourlyRate: num(input.hourlyRate ?? prev.data()?.hourlyRate),
      bankAccount: input.bankAccount ?? prev.data()?.bankAccount ?? "",
      ifsc: input.ifsc ?? prev.data()?.ifsc ?? "",
      upi: input.upi ?? prev.data()?.upi ?? "",
      pan: input.pan ?? prev.data()?.pan ?? "",
      aadhar: input.aadhar ?? prev.data()?.aadhar ?? "",
      documents: input.documents ?? prev.data()?.documents ?? [],
      skills: input.skills ?? prev.data()?.skills ?? [],
      notes: input.notes ?? prev.data()?.notes ?? "",
      active: input.active ?? prev.data()?.active ?? true,
      syncStatus: "synced",
      isDeleted: false,
      ...(prev.exists() ? auditUpdate({ status: "active" }) : auditCreate({ status: "active" }))
    },
    { merge: true }
  );

  // Keep fixedSalaries in sync for vanilla payroll
  const amount = num(input.monthlySalary ?? prev.data()?.monthlySalary);
  if (amount > 0) {
    await setFixedSalary({ name, amount, staffId: id, joinDate: input.joiningDate || isoDate() });
  }

  await logActivity({
    action: prev.exists() ? "employee_updated" : "employee_created",
    entityType: "staff",
    entityId: id,
    message: name
  });
  return id;
}

export async function setFixedSalary(input: { name: string; amount: number; staffId?: string | null; joinDate?: string }) {
  const snap = await getDocs(collection(db, "fixedSalaries"));
  const existing = snap.docs.find((d) => String(d.data().name || "").toLowerCase() === input.name.toLowerCase());
  const ref = existing ? doc(db, "fixedSalaries", existing.id) : doc(collection(db, "fixedSalaries"));
  const payload: FixedSalaryDoc = {
    name: input.name,
    amount: num(input.amount),
    joinDate: input.joinDate || existing?.data()?.joinDate || isoDate(),
    staffId: input.staffId || existing?.data()?.staffId || null,
    syncStatus: "synced",
    ...(existing ? auditUpdate({ status: "active" }) : auditCreate({ status: "active" }))
  };
  await setDoc(ref, payload, { merge: true });
  return ref.id;
}

export async function softDeleteEmployee(id: string) {
  await setDoc(doc(db, "staff", id), { isDeleted: true, active: false, ...auditUpdate({ status: "inactive" }) }, { merge: true });
}

export async function upsertAttendance(input: {
  date: string;
  name: string;
  staffId?: string | null;
  status: AttendanceDoc["status"];
  clockIn?: string | null;
  clockOut?: string | null;
  note?: string;
  id?: string;
}) {
  if (!input.name || !input.date) throw new Error("Name and date required");
  let id = input.id;
  if (!id) {
    const snap = await getDocs(collection(db, "attendance"));
    const existing = snap.docs.find(
      (d) =>
        String(d.data().date || "").slice(0, 10) === input.date.slice(0, 10) &&
        String(d.data().name || "").toLowerCase() === input.name.toLowerCase()
    );
    id = existing?.id || doc(collection(db, "attendance")).id;
  }
  const ref = doc(db, "attendance", id);
  const prev = await getDoc(ref);
  await setDoc(
    ref,
    {
      date: input.date.slice(0, 10),
      name: input.name,
      staffId: input.staffId || null,
      status: input.status,
      clockIn: input.clockIn ?? null,
      clockOut: input.clockOut ?? null,
      note: input.note || "",
      syncStatus: "synced",
      ...(prev.exists() ? auditUpdate() : auditCreate({ status: input.status }))
    },
    { merge: true }
  );
  await logActivity({
    action: "attendance_updated",
    entityType: "attendance",
    entityId: id,
    message: `${input.name} ${input.date} → ${input.status}`
  });
  return id;
}

export async function bulkMarkAttendance(args: {
  date: string;
  rows: Array<{ name: string; staffId?: string | null; status: AttendanceDoc["status"] }>;
}) {
  for (const row of args.rows) {
    await upsertAttendance({ date: args.date, ...row });
  }
}
