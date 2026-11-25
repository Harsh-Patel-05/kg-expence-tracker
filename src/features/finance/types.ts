import type { AuditFields, SyncStatus } from "@/features/pos/types";

export type InvestmentKind = "capital_in" | "shop_purchase";
export type FinanceAccount = "cash" | "online" | "bank" | "personal";

/** Classic `investments` collection — capital into shop or shop asset purchase. */
export type InvestmentDoc = AuditFields & {
  date: string;
  amount: number;
  kind: InvestmentKind;
  account: FinanceAccount;
  title: string;
  notes?: string;
  syncStatus?: SyncStatus;
};

/** Classic `profit_withdrawals` — owner take-profit from cash/online. */
export type ProfitWithdrawalDoc = AuditFields & {
  date: string;
  amount: number;
  account: "cash" | "online" | "bank";
  notes?: string;
  syncStatus?: SyncStatus;
};

export type InvestmentTotals = {
  totalInvested: number;
  totalTaken: number;
  netCapital: number;
};
