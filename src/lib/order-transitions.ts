import type { OrderStatus } from "@/generated/prisma/client";

/** Keep this state machine authoritative on both server and UI. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionOrder(current: OrderStatus, next: OrderStatus): boolean {
  return ORDER_TRANSITIONS[current]?.includes(next) ?? false;
}

export function requiresOutboundMovement(current: OrderStatus, next: OrderStatus): boolean {
  return current === "DRAFT" && next === "CONFIRMED";
}

export function requiresReturnMovement(current: OrderStatus, next: OrderStatus): boolean {
  return current === "CONFIRMED" && next === "CANCELLED";
}
