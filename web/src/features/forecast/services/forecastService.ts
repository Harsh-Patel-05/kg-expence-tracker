import { collection, doc, getDocs, limit, orderBy, query, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auditCreate, logActivity } from "@/features/pos/services/posFirestore";
import { emitNotification } from "@/features/notifications/services/notificationEngine";
import type { ForecastResult } from "../utils/forecastEngine";
import { biasFromAccuracy } from "../utils/forecastEngine";

export type ForecastSnapshotDoc = {
  horizon: string;
  from: string;
  to: string;
  expectedRevenue: number;
  expectedOrders: number;
  expectedProfit: number;
  confidence: string;
  confidenceScore: number;
  risk: string;
  growthPct: number;
  model: ForecastResult["model"];
  series?: ForecastResult["series"];
  insights?: string[];
  recommendations?: string[];
};

export type ForecastAccuracyDoc = {
  date: string;
  horizon: string;
  forecast: number;
  actual: number;
  errorPct: number;
  snapshotId?: string;
};

export async function saveForecastSnapshot(result: ForecastResult) {
  const ref = doc(collection(db, "forecastSnapshots"));
  const payload: ForecastSnapshotDoc = {
    horizon: result.horizon,
    from: result.from,
    to: result.to,
    expectedRevenue: result.expectedRevenue,
    expectedOrders: result.expectedOrders,
    expectedProfit: result.expectedProfit,
    confidence: result.confidence,
    confidenceScore: result.confidenceScore,
    risk: result.risk,
    growthPct: result.growthPct,
    model: result.model,
    series: result.series,
    insights: result.insights,
    recommendations: result.recommendations
  };
  await setDoc(ref, {
    ...payload,
    syncStatus: "synced",
    ...auditCreate({ status: "active" })
  });

  await setDoc(doc(collection(db, "forecastHistory")), {
    snapshotId: ref.id,
    horizon: result.horizon,
    expectedRevenue: result.expectedRevenue,
    expectedOrders: result.expectedOrders,
    confidenceScore: result.confidenceScore,
    syncStatus: "synced",
    ...auditCreate({ status: "recorded" })
  });

  await logActivity({
    action: "forecast_snapshot",
    entityType: "forecastSnapshots",
    entityId: ref.id,
    message: `${result.horizon} ₹${result.expectedRevenue}`
  });

  if (result.risk === "high") {
    await emitNotification({
      title: "High forecast risk",
      body: result.riskReasons[0] || "Review sales forecast assumptions",
      kind: "info",
      priority: "high",
      link: "/forecast",
      entityType: "forecastSnapshots",
      entityId: ref.id,
      dedupeKey: `forecast-risk-${result.horizon}-${result.to}`
    });
  }

  return ref.id;
}

export async function recordForecastAccuracy(input: ForecastAccuracyDoc) {
  const ref = doc(collection(db, "forecastAccuracy"));
  await setDoc(ref, {
    ...input,
    syncStatus: "synced",
    ...auditCreate({ status: "scored" })
  });
  await logActivity({
    action: "forecast_accuracy",
    entityType: "forecastAccuracy",
    entityId: ref.id,
    message: `${input.date} err ${input.errorPct.toFixed(1)}%`
  });
  return ref.id;
}

export async function loadAccuracyBias(): Promise<number> {
  try {
    const q = query(collection(db, "forecastAccuracy"), orderBy("createdAt", "desc"), limit(60));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => d.data() as ForecastAccuracyDoc);
    return biasFromAccuracy(rows);
  } catch {
    return 1;
  }
}

/** Score yesterday's forecast day against actual revenue. */
export async function learnFromActual(args: {
  date: string;
  actualRevenue: number;
  forecastRevenue: number;
  horizon?: string;
  snapshotId?: string;
}) {
  if (!(args.forecastRevenue > 0)) return null;
  const errorPct = ((args.actualRevenue - args.forecastRevenue) / args.forecastRevenue) * 100;
  return recordForecastAccuracy({
    date: args.date,
    horizon: args.horizon || "tomorrow",
    forecast: args.forecastRevenue,
    actual: args.actualRevenue,
    errorPct,
    snapshotId: args.snapshotId
  });
}
