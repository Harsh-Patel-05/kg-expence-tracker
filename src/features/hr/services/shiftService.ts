import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import type { PerformanceDoc, ShiftAssignmentDoc, ShiftDoc } from "../types";
import { upsertReminder } from "@/features/tasks/services/taskReminderService";

export async function upsertShift(input: Partial<ShiftDoc> & { name: string; startTime: string; endTime: string; id?: string }) {
  const id = input.id || doc(collection(db, "shifts")).id;
  await setDoc(
    doc(db, "shifts", id),
    {
      name: input.name,
      startTime: input.startTime,
      endTime: input.endTime,
      kind: input.kind || "custom",
      syncStatus: "synced",
      ...auditCreate({ status: "active" })
    },
    { merge: true }
  );
  return id;
}

export async function assignShift(input: {
  date: string;
  shiftId: string;
  shiftName?: string;
  name: string;
  staffId?: string | null;
}) {
  // prevent overlapping assignment same day+name
  const snap = await getDocs(collection(db, "shiftAssignments"));
  const overlap = snap.docs.find(
    (d) =>
      String(d.data().date || "") === input.date &&
      String(d.data().name || "").toLowerCase() === input.name.toLowerCase() &&
      d.data().shiftId !== input.shiftId &&
      d.data().isDeleted !== true
  );
  if (overlap) {
    // allow but flag — soft warn via throw for strict mode
    throw new Error(`Overlapping shift for ${input.name} on ${input.date}`);
  }

  const ref = doc(collection(db, "shiftAssignments"));
  const payload: ShiftAssignmentDoc = {
    date: input.date,
    shiftId: input.shiftId,
    shiftName: input.shiftName,
    name: input.name,
    staffId: input.staffId || null,
    approvalStatus: "approved",
    syncStatus: "synced",
    ...auditCreate({ status: "scheduled" })
  };
  await setDoc(ref, payload);
  await logActivity({
    action: "shift_assigned",
    entityType: "shiftAssignments",
    entityId: ref.id,
    message: `${input.name} ${input.date}`
  });
  return ref.id;
}

export async function upsertPerformance(input: {
  month: string;
  name: string;
  staffId?: string | null;
  rating?: number;
  attendanceScore?: number;
  salesScore?: number;
  accuracyScore?: number;
  notes?: string;
  id?: string;
}) {
  const id = input.id || doc(collection(db, "performance")).id;
  const payload: PerformanceDoc = {
    month: input.month,
    name: input.name,
    staffId: input.staffId || null,
    rating: input.rating,
    attendanceScore: input.attendanceScore,
    salesScore: input.salesScore,
    accuracyScore: input.accuracyScore,
    notes: input.notes || "",
    syncStatus: "synced",
    ...auditCreate({ status: "active" })
  };
  await setDoc(doc(db, "performance", id), payload, { merge: true });
  return id;
}

export async function requestShiftSwap(id: string) {
  await setDoc(doc(db, "shiftAssignments", id), { swapRequested: true, approvalStatus: "pending", ...auditUpdate() }, { merge: true });
}

/** Auto birthday reminders for staff with DOB matching today (MM-DD). */
export async function autoCreateBirthdayReminders(staff: Array<{ id: string; name: string; dob?: string }>) {
  const today = isoDate();
  const mmdd = today.slice(5);
  const due = today;
  for (const s of staff) {
    if (!s.dob || String(s.dob).slice(5, 10) !== mmdd) continue;
    await upsertReminder({
      title: `Birthday wish — ${s.name}`,
      dueDate: due,
      category: "birthday",
      priority: "medium",
      notifyBeforeDays: 0,
      relatedEntityType: "staff",
      relatedEntityId: s.id,
      notes: "Auto-generated staff birthday reminder"
    });
  }
}
