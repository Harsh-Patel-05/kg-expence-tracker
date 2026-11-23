import type { PosRole } from "@/features/pos/types";
import { isFullAdmin } from "@/features/pos/utils/permissions";

const MANAGERS: PosRole[] = ["owner", "manager", "admin"];
const FINANCE: PosRole[] = ["owner", "manager", "admin", "accountant"];

function allow(role: PosRole, check: boolean) {
  if (isFullAdmin(role)) return true;
  return check;
}

export function canAccessSuppliers(role: PosRole) {
  return allow(role, FINANCE.includes(role) || role === "cashier" || MANAGERS.includes(role));
}

export function canEditSuppliers(role: PosRole) {
  return allow(role, FINANCE.includes(role) || MANAGERS.includes(role));
}

export function canPaySuppliers(role: PosRole) {
  return allow(role, FINANCE.includes(role));
}

export function canAccessReports(role: PosRole) {
  return allow(role, FINANCE.includes(role) || MANAGERS.includes(role) || role === "cashier");
}

export function canExportReports(role: PosRole) {
  return allow(role, FINANCE.includes(role) || MANAGERS.includes(role));
}

export function canViewSalaryReports(role: PosRole) {
  return allow(role, FINANCE.includes(role) || role === "owner" || role === "admin");
}
