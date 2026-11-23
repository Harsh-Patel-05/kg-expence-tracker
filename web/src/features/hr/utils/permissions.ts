import type { PosRole } from "@/features/pos/types";
import { isFullAdmin } from "@/features/pos/utils/permissions";

const HR_ROLES: PosRole[] = ["owner", "manager", "admin"];
const MANAGERISH: PosRole[] = ["owner", "manager", "admin", "captain"];

function allow(role: PosRole, check: boolean) {
  if (isFullAdmin(role)) return true;
  return check;
}

export function canAccessHr(role: PosRole): boolean {
  return allow(role, HR_ROLES.includes(role) || role === "accountant");
}

export function canEditEmployees(role: PosRole): boolean {
  return allow(role, HR_ROLES.includes(role));
}

export function canApproveLeave(role: PosRole): boolean {
  return allow(role, MANAGERISH.includes(role));
}

export function canRunPayroll(role: PosRole): boolean {
  return allow(role, HR_ROLES.includes(role) || role === "accountant");
}

export function canManageTasks(role: PosRole): boolean {
  return true;
}

export function canAccessReminders(role: PosRole): boolean {
  return true;
}
