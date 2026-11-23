import type { PosRole } from "../types";

/** Full-access roles for The Kilogram / RestaurantPilot owners */
export const FULL_ACCESS_ROLES: PosRole[] = ["owner", "admin"];

const MANAGER_ROLES: PosRole[] = ["owner", "manager", "admin"];
const CASHIER_ROLES: PosRole[] = ["owner", "manager", "admin", "cashier", "captain"];
const KITCHEN_ROLES: PosRole[] = ["owner", "manager", "admin", "kitchen", "chef", "captain"];
const DELIVERY_ROLES: PosRole[] = ["owner", "manager", "admin", "delivery", "captain"];

export function isFullAdmin(role: PosRole): boolean {
  return FULL_ACCESS_ROLES.includes(role);
}

export function normalizePosRole(role: unknown): PosRole {
  const r = String(role || "admin").toLowerCase().trim() as PosRole;
  const allowed: PosRole[] = [
    "owner",
    "manager",
    "admin",
    "cashier",
    "captain",
    "kitchen",
    "chef",
    "delivery",
    "accountant",
    "employee"
  ];
  return allowed.includes(r) ? r : "admin";
}

/** Admin / owner always true — used to unlock every module for you. */
function allow(role: PosRole, check: boolean): boolean {
  if (isFullAdmin(role)) return true;
  return check;
}

export function canAccessPos(role: PosRole): boolean {
  return allow(role, role !== "accountant");
}

export function canAccessOrders(role: PosRole): boolean {
  return allow(role, role !== "accountant");
}

export function canAccessKds(role: PosRole): boolean {
  return allow(role, KITCHEN_ROLES.includes(role) || MANAGER_ROLES.includes(role));
}

export function canChangeOrderStatus(role: PosRole): boolean {
  return canAccessOrders(role);
}

export function canAssignChef(role: PosRole): boolean {
  return allow(role, MANAGER_ROLES.includes(role) || role === "captain" || role === "kitchen");
}

export function canAssignDriver(role: PosRole): boolean {
  return allow(role, DELIVERY_ROLES.includes(role) || MANAGER_ROLES.includes(role));
}

export function canApplyDiscount(role: PosRole, pct: number, maxPct: number): boolean {
  if (isFullAdmin(role) || MANAGER_ROLES.includes(role)) return true;
  if (!CASHIER_ROLES.includes(role)) return false;
  return pct <= maxPct;
}

export function canManualPrice(role: PosRole): boolean {
  return allow(role, MANAGER_ROLES.includes(role));
}

export function canComplimentary(role: PosRole): boolean {
  return allow(role, MANAGER_ROLES.includes(role));
}

export function canCancelPaid(role: PosRole): boolean {
  return allow(role, MANAGER_ROLES.includes(role));
}

export function canRefund(role: PosRole): boolean {
  return allow(role, MANAGER_ROLES.includes(role));
}

export function canOpenCashDrawer(role: PosRole): boolean {
  return allow(role, CASHIER_ROLES.includes(role) || MANAGER_ROLES.includes(role));
}
