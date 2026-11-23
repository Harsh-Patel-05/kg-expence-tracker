import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auditCreate, logActivity } from "@/features/pos/services/posFirestore";

export async function cacheReportSnapshot(input: {
  reportType: string;
  filters: Record<string, unknown>;
  summary: Record<string, unknown>;
}) {
  const ref = doc(collection(db, "analyticsSnapshots"));
  await setDoc(ref, {
    reportType: input.reportType,
    filters: input.filters,
    summary: input.summary,
    syncStatus: "synced",
    ...auditCreate({ status: "cached" })
  });
  return ref.id;
}

export async function logReportExport(input: { reportType: string; format: "csv" | "excel" | "pdf" | "print"; rowCount: number }) {
  const ref = doc(collection(db, "reportExports"));
  await setDoc(ref, {
    ...input,
    syncStatus: "synced",
    ...auditCreate({ status: "exported" })
  });
  await logActivity({
    action: "report_exported",
    entityType: "reportExports",
    entityId: ref.id,
    message: `${input.reportType} ${input.format}`
  });
  return ref.id;
}

export async function saveScheduledReport(input: {
  title: string;
  reportType: string;
  cadence: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  email?: string;
  filters?: Record<string, unknown>;
}) {
  const ref = doc(collection(db, "reportsCache"));
  await setDoc(ref, {
    ...input,
    active: true,
    syncStatus: "synced",
    ...auditCreate({ status: "scheduled" })
  });
  return ref.id;
}
