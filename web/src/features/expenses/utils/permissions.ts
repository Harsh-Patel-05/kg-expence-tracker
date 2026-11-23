import type { PosRole } from "@/features/pos/types";
import { isFullAdmin } from "@/features/pos/utils/permissions";

const MANAGERS: PosRole[] = ["owner", "manager", "admin"];
const FINANCE: PosRole[] = ["owner", "manager", "admin", "accountant"];

function allow(role: PosRole, check: boolean) {
  if (isFullAdmin(role)) return true;
  return check;
}

export function canManageTasks(role: PosRole) {
  return true;
}

export function canOverrideTaskProgress(role: PosRole) {
  return allow(role, MANAGERS.includes(role));
}

export function canAccessExpenses(role: PosRole) {
  return allow(role, FINANCE.includes(role) || role === "cashier" || role === "captain");
}

export function canCreateExpense(role: PosRole) {
  return allow(role, FINANCE.includes(role) || role === "cashier" || role === "manager");
}

export function canApproveExpense(role: PosRole) {
  return allow(role, MANAGERS.includes(role));
}

export function canPayExpense(role: PosRole) {
  return allow(role, FINANCE.includes(role));
}

export function canManageRecurringExpenses(role: PosRole) {
  return allow(role, FINANCE.includes(role));
}
