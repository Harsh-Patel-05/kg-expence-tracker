import type { KitchenStatus, OrderStatus } from "@/features/pos/types";

/** Valid order status transitions — shared OMS / KDS / POS engine */
const TRANSITIONS: Record<string, OrderStatus[]> = {
  draft: ["pending", "confirmed", "held", "cancelled"],
  held: ["pending", "confirmed", "cancelled"],
  pending: ["confirmed", "accepted", "rejected", "cancelled"],
  confirmed: ["accepted", "preparing", "cancelled"],
  accepted: ["preparing", "cooking", "cancelled"],
  preparing: ["cooking", "ready", "cancelled"],
  cooking: ["ready", "packed", "cancelled"],
  ready: ["packed", "waiting_pickup", "served", "out_for_delivery", "completed"],
  packed: ["waiting_pickup", "out_for_delivery", "served", "completed"],
  waiting_pickup: ["served", "completed", "out_for_delivery"],
  out_for_delivery: ["delivered", "completed", "cancelled"],
  served: ["completed", "refunded"],
  delivered: ["completed", "refunded"],
  completed: ["refunded"],
  cancelled: [],
  rejected: [],
  refunded: []
};

const KITCHEN_TRANSITIONS: Record<string, KitchenStatus[]> = {
  new: ["accepted", "preparing", "ready"],
  accepted: ["preparing", "cooking", "ready", "new"],
  preparing: ["cooking", "plating", "ready", "accepted", "new"],
  cooking: ["plating", "ready", "preparing"],
  plating: ["ready", "packed", "preparing"],
  ready: ["packed", "served", "completed", "preparing"],
  packed: ["served", "completed", "ready"],
  served: ["completed"],
  completed: []
};

export function canTransition(from: string | undefined, to: OrderStatus): boolean {
  const key = String(from || "draft");
  if (key === to) return true;
  const allowed = TRANSITIONS[key] || TRANSITIONS.pending;
  return allowed.includes(to);
}

export function canKitchenTransition(from: string | undefined, to: KitchenStatus): boolean {
  const key = String(from || "new");
  if (key === to) return true;
  return (KITCHEN_TRANSITIONS[key] || []).includes(to);
}

export function mapOrderToKitchenStatus(status: OrderStatus): KitchenStatus {
  switch (status) {
    case "pending":
    case "confirmed":
      return "new";
    case "accepted":
      return "accepted";
    case "preparing":
      return "preparing";
    case "cooking":
      return "cooking";
    case "ready":
      return "ready";
    case "packed":
      return "packed";
    case "served":
    case "delivered":
      return "served";
    case "completed":
      return "completed";
    default:
      return "new";
  }
}

export function expectedPrepMinutes(orderType: string, itemCount: number): number {
  const t = String(orderType || "").toLowerCase();
  // Swiggy / Zomato: fixed 18 min reverse countdown (no item bump)
  if (t.includes("swiggy") || t.includes("zomato") || t === "express") return 18;
  const base = t === "bulk" || t === "catering" ? 90 : 25;
  return base + Math.max(0, itemCount - 3) * 2;
}

export const BOARD_COLUMNS: Array<{ id: OrderStatus; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "served", label: "Served" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" }
];

/** Full kitchen statuses (history / transitions). */
export const KDS_COLUMNS: Array<{ id: KitchenStatus; label: string }> = [
  { id: "new", label: "New" },
  { id: "accepted", label: "Accepted" },
  { id: "preparing", label: "Preparing" },
  { id: "cooking", label: "Cooking" },
  { id: "ready", label: "Ready" },
  { id: "packed", label: "Packed" }
];

/** Simplified kitchen board: Waiting + Preparing only. */
export const KDS_BOARD_LANES: Array<{ id: "waiting" | "preparing"; label: string }> = [
  { id: "waiting", label: "Waiting" },
  { id: "preparing", label: "Preparing" }
];

export const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
  swiggy: "Swiggy",
  zomato: "Zomato",
  magicpin: "Magicpin",
  dotpe: "DotPe",
  ondc: "ONDC",
  qr: "QR Order",
  phone: "Phone",
  whatsapp: "WhatsApp",
  scheduled: "Scheduled",
  bulk: "Bulk",
  catering: "Catering",
  online: "Online",
  direct: "Direct"
};
