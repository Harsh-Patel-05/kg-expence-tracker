import { collection, deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, logActivity } from "@/features/pos/services/posFirestore";
import type { AuditFields, SyncStatus } from "@/features/pos/types";

export type BalanceTransferDoc = AuditFields & {
  date: string;
  fromAccount: "cash" | "bank";
  toAccount: "cash" | "bank";
  amount: number;
  notes?: string;
  syncStatus?: SyncStatus;
};

/** Re-export classic balanceMath — single source of truth. */
export { applyBalanceTransfers } from "@/lib/balanceMath";

export async function createBalanceTransfer(input: {
  date?: string;
  fromAccount: "cash" | "bank";
  toAccount: "cash" | "bank";
  amount: number;
  notes?: string;
}) {
  const amount = num(input.amount);
  if (!(amount > 0)) throw new Error("Amount must be greater than zero");
  if (input.fromAccount === input.toAccount) throw new Error("Cannot transfer to the same account");
  const ref = doc(collection(db, "balance_transfers"));
  const payload: BalanceTransferDoc = {
    date: String(input.date || isoDate()).slice(0, 10),
    fromAccount: input.fromAccount,
    toAccount: input.toAccount,
    amount,
    notes: String(input.notes || "").trim(),
    syncStatus: "synced",
    ...auditCreate({ status: "posted" })
  };
  await setDoc(ref, payload);
  await logActivity({
    action: "balance_transfer_created",
    entityType: "balance_transfers",
    entityId: ref.id,
    message: `${input.fromAccount}→${input.toAccount} ${amount}`
  });
  return ref.id;
}

export async function removeBalanceTransfer(id: string) {
  await deleteDoc(doc(db, "balance_transfers", id));
  await logActivity({
    action: "balance_transfer_deleted",
    entityType: "balance_transfers",
    entityId: id,
    message: "Transfer deleted"
  });
}
