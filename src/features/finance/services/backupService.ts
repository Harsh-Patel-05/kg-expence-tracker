import { doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { listAll } from "@/features/pos/hooks/useRestaurantCollection";

/** Classic JSON keys ↔ Firestore collection paths */
const COLLECTION_MAP: Array<{ exportKey: string; path: string; importAliases?: string[] }> = [
  { exportKey: "sales", path: "sales" },
  { exportKey: "expenses", path: "expenses" },
  { exportKey: "purchases", path: "purchases" },
  { exportKey: "staff", path: "staff" },
  { exportKey: "attendance", path: "attendance" },
  { exportKey: "advances", path: "advances" },
  { exportKey: "salaries", path: "salaries" },
  { exportKey: "fixedSalaries", path: "fixedSalaries" },
  { exportKey: "suppliers", path: "suppliers" },
  { exportKey: "supplierPayments", path: "supplierPayments" },
  { exportKey: "investments", path: "investments" },
  {
    exportKey: "profitWithdrawals",
    path: "profit_withdrawals",
    importAliases: ["profit_withdrawals", "profitWithdrawals"]
  },
  {
    exportKey: "balanceTransfers",
    path: "balance_transfers",
    importAliases: ["balance_transfers", "balanceTransfers"]
  },
  { exportKey: "reminders", path: "reminders" },
  { exportKey: "documents", path: "documents" },
  { exportKey: "menuItems", path: "menuItems", importAliases: ["menuItems", "menu_items"] },
  { exportKey: "inventory", path: "inventory" },
  { exportKey: "supplierBills", path: "supplierBills" }
];

export type RestaurantBackup = {
  version: number;
  exportedAt: string;
  data: Record<string, Array<Record<string, unknown> & { id?: string }>>;
};

export async function exportRestaurantBackup(): Promise<RestaurantBackup> {
  const data: RestaurantBackup["data"] = {};
  await Promise.all(
    COLLECTION_MAP.map(async ({ exportKey, path }) => {
      const rows = await listAll<Record<string, unknown>>(path);
      data[exportKey] = rows.map(({ id, ...rest }) => ({ id, ...rest }));
    })
  );
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    data
  };
}

function rowsFromImportPayload(payload: Record<string, unknown>, spec: (typeof COLLECTION_MAP)[number]): Array<Record<string, unknown> & { id: string }> {
  const keys = [spec.exportKey, ...(spec.importAliases || [])];
  for (const k of keys) {
    const raw = payload[k];
    if (Array.isArray(raw) && raw.length > 0) {
      return raw
        .map((row, i) => {
          const r = row as Record<string, unknown> & { id?: string };
          const id = String(r.id || "").trim() || `import_${k}_${i}_${Date.now()}`;
          return { ...r, id };
        })
        .filter((r) => r && typeof r === "object");
    }
  }
  return [];
}

export async function importRestaurantBackup(parsed: unknown): Promise<{ written: number; collections: string[] }> {
  const root = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const data =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;

  let written = 0;
  const collections: string[] = [];
  let batch = writeBatch(db);
  let ops = 0;

  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  for (const spec of COLLECTION_MAP) {
    const rows = rowsFromImportPayload(data, spec);
    if (!rows.length) continue;
    collections.push(spec.path);

    for (const row of rows) {
      const { id, ...body } = row;
      const docId = String(id);
      if (!docId) continue;
      batch.set(doc(db, spec.path, docId), body, { merge: false });
      ops += 1;
      written += 1;
      if (ops >= 450) await flush();
    }
  }

  await flush();
  return { written, collections };
}

export function downloadBackupJson(backup: RestaurantBackup, filename = "restaurant-backup.json") {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}