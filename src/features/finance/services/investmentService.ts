import { collection, deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, logActivity } from "@/features/pos/services/posFirestore";
import type { FinanceAccount, InvestmentDoc, InvestmentKind, InvestmentTotals, ProfitWithdrawalDoc } from "../types";

export function investmentTotals(
  investments: Array<{ amount?: number }>,
  withdrawals: Array<{ amount?: number }>
): InvestmentTotals {
  const totalInvested = investments.reduce((s, r) => s + num(r.amount), 0);
  const totalTaken = withdrawals.reduce((s, r) => s + num(r.amount), 0);
  return { totalInvested, totalTaken, netCapital: totalInvested - totalTaken };
}

export function kindLabel(kind?: string) {
  const k = String(kind || "");
  if (k === "capital_in") return "Capital added";
  if (k === "shop_purchase") return "Shop purchase";
  return k || "—";
}

export function accountLabel(a?: string) {
  const x = String(a || "").toLowerCase();
  if (x === "cash") return "Cash";
  if (x === "online" || x === "bank") return "Online";
  if (x === "personal") return "Personal";
  return a || "—";
}

export async function createInvestment(input: {
  date?: string;
  amount: number;
  kind: InvestmentKind;
  account: FinanceAccount;
  title: string;
  notes?: string;
}) {
  const amount = num(input.amount);
  const title = String(input.title || "").trim();
  if (!(amount > 0)) throw new Error("Enter investment amount");
  if (!title) throw new Error("Enter item / description");
  if (input.kind === "capital_in" && input.account === "personal") {
    throw new Error("Capital in must go to Cash or Online");
  }
  const ref = doc(collection(db, "investments"));
  const payload: InvestmentDoc = {
    date: String(input.date || isoDate()).slice(0, 10),
    amount,
    kind: input.kind,
    account: input.account,
    title,
    notes: String(input.notes || "").trim(),
    syncStatus: "synced",
    ...auditCreate({ status: "posted" })
  };
  await setDoc(ref, payload);
  await logActivity({
    action: "investment_created",
    entityType: "investments",
    entityId: ref.id,
    message: `${input.kind} ${title} ${amount}`
  });
  return ref.id;
}

export async function removeInvestment(id: string) {
  await deleteDoc(doc(db, "investments", id));
  await logActivity({
    action: "investment_deleted",
    entityType: "investments",
    entityId: id,
    message: "Investment deleted"
  });
}

export async function createProfitWithdrawal(input: {
  date?: string;
  amount: number;
  account: "cash" | "online" | "bank";
  notes?: string;
}) {
  const amount = num(input.amount);
  if (!(amount > 0)) throw new Error("Enter profit amount");
  const ref = doc(collection(db, "profit_withdrawals"));
  const payload: ProfitWithdrawalDoc = {
    date: String(input.date || isoDate()).slice(0, 10),
    amount,
    account: input.account === "bank" ? "online" : input.account,
    notes: String(input.notes || "").trim(),
    syncStatus: "synced",
    ...auditCreate({ status: "posted" })
  };
  await setDoc(ref, payload);
  await logActivity({
    action: "profit_withdrawal_created",
    entityType: "profit_withdrawals",
    entityId: ref.id,
    message: `${payload.account} ${amount}`
  });
  return ref.id;
}

export async function removeProfitWithdrawal(id: string) {
  await deleteDoc(doc(db, "profit_withdrawals", id));
  await logActivity({
    action: "profit_withdrawal_deleted",
    entityType: "profit_withdrawals",
    entityId: id,
    message: "Withdrawal deleted"
  });
}

/** Re-export classic balanceMath — single source of truth. */
export { applyInvestmentsAndWithdrawals } from "@/lib/balanceMath";
