import { describe, expect, it } from "vitest";
import { canTransitionOrder, requiresOutboundMovement, requiresReturnMovement } from "./order-transitions";
import type { OrderStatus } from "@/generated/prisma/client";

describe("sales Order transition matrix", () => {
  it("allows only the documented forward and draft/confirmed cancel paths", () => {
    const accepted: [OrderStatus, OrderStatus][] = [
      ["DRAFT", "CONFIRMED"], ["DRAFT", "CANCELLED"],
      ["CONFIRMED", "SHIPPED"], ["CONFIRMED", "CANCELLED"],
      ["SHIPPED", "COMPLETED"],
    ];
    const states: OrderStatus[] = ["DRAFT","CONFIRMED","SHIPPED","COMPLETED","CANCELLED"];
    for (const before of states) for (const after of states) {
      expect(canTransitionOrder(before, after)).toBe(
        accepted.some(([a,b]) => a === before && b === after)
      );
    }
  });
  it("decrements only once when confirming draft", () => {
    expect(requiresOutboundMovement("DRAFT", "CONFIRMED")).toBe(true);
    expect(requiresOutboundMovement("CONFIRMED", "SHIPPED")).toBe(false);
    expect(requiresOutboundMovement("SHIPPED", "COMPLETED")).toBe(false);
  });
  it("returns inventory on confirmed cancellation only", () => {
    expect(requiresReturnMovement("CONFIRMED", "CANCELLED")).toBe(true);
    expect(requiresReturnMovement("DRAFT", "CANCELLED")).toBe(false);
    expect(requiresReturnMovement("SHIPPED", "COMPLETED")).toBe(false);
  });
});
