import { describe, expect, it } from "vitest";
import { assessB2BReturnReadiness } from "./b2b-return-readiness";

const basic = {
  buyerPOStatus: "RECEIVED" as const,
  companyStatus: "ACCEPTED" as const,
  sellerOrderStatus: "SHIPPED" as const,
  connectionStatus: "ACTIVE" as const,
  buyerLines: [
    { id: "buyer-l1", itemName: "紙", unit: "箱", quantity: 10, received: 7 },
    { id: "buyer-l2", itemName: "ペン", unit: "本", quantity: 2, received: 0 },
  ],
  companyLines: [
    { sourcePurchaseOrderItemId: "buyer-l2", unit: "本", quantity: 2 },
    { sourcePurchaseOrderItemId: "buyer-l1", unit: "箱", quantity: 10 },
  ],
};

describe("read-only post-shipment return planning", () => {
  it("reports only verified actual received lines, without claiming return eligibility", () => {
    const result = assessB2BReturnReadiness(basic);
    expect(result.status).toBe("RECEIPTS_RECORDED");
    expect(result.receivedLines).toEqual([
      { id: "buyer-l1", itemName: "紙", unit: "箱", received: 7 },
    ]);
    expect(result.message).toContain("返品可能数量");
    expect(result.message).toContain("保証しません");
  });
  it("blocks return planning before seller shipment or buyer receipt", () => {
    for (const sellerOrderStatus of [null, "DRAFT", "CONFIRMED", "CANCELLED"] as const) {
      expect(assessB2BReturnReadiness({ ...basic, sellerOrderStatus }).status)
        .toBe("NOT_READY");
    }
    for (const buyerPOStatus of ["DRAFT", "ORDERED", "CANCELLED"] as const) {
      expect(assessB2BReturnReadiness({ ...basic, buyerPOStatus }).status)
        .toBe("NOT_READY");
    }
  });
  it("blocks unaccepted, rejected, cancelled or pending enterprise orders", () => {
    for (const companyStatus of ["SENT", "REJECTED", "CANCELLED"] as const) {
      expect(assessB2BReturnReadiness({ ...basic, companyStatus }).status)
        .toBe("NOT_READY");
    }
  });
  it("requires manual review for revoked partner or broken quantity/identity mapping", () => {
    expect(assessB2BReturnReadiness({
      ...basic, connectionStatus: "REVOKED",
    }).status).toBe("REQUIRES_MANUAL_REVIEW");
    expect(assessB2BReturnReadiness({
      ...basic, buyerLines: [{ ...basic.buyerLines[0], received: 11 }, basic.buyerLines[1]],
    }).status).toBe("REQUIRES_MANUAL_REVIEW");
    expect(assessB2BReturnReadiness({
      ...basic, companyLines: [basic.companyLines[0], basic.companyLines[0]],
    }).status).toBe("REQUIRES_MANUAL_REVIEW");
    expect(assessB2BReturnReadiness({
      ...basic, companyLines: [{ ...basic.companyLines[0], unit: "箱" }, basic.companyLines[1]],
    }).status).toBe("REQUIRES_MANUAL_REVIEW");
    expect(assessB2BReturnReadiness({
      ...basic, companyLines: [],
    }).status).toBe("REQUIRES_MANUAL_REVIEW");
  });
  it("uses buyer/seller perspective for shipment and receipt messages", () => {
    const waitingSellerShipment = {
      ...basic, sellerOrderStatus: "CONFIRMED" as const,
    };
    expect(assessB2BReturnReadiness(waitingSellerShipment).message)
      .toContain("先方の出荷");
    expect(assessB2BReturnReadiness({
      ...waitingSellerShipment, viewer: "SELLER",
    }).message).toContain("自社の出荷");

    const waitingBuyerReceipt = {
      ...basic, buyerPOStatus: "ORDERED" as const,
    };
    expect(assessB2BReturnReadiness(waitingBuyerReceipt).message)
      .toContain("自社の入荷");
    expect(assessB2BReturnReadiness({
      ...waitingBuyerReceipt, viewer: "SELLER",
    }).message).toContain("発注元企業の入荷");
  });

  it("does not invent returnable stock for zero receipt and supports seller completion", () => {
    const empty = assessB2BReturnReadiness({
      ...basic, buyerLines: basic.buyerLines.map(l => ({ ...l, received: 0 })),
    });
    expect(empty.status).toBe("NOT_READY");
    const completed = assessB2BReturnReadiness({
      ...basic, sellerOrderStatus: "COMPLETED",
    });
    expect(completed.status).toBe("RECEIPTS_RECORDED");
  });
});
