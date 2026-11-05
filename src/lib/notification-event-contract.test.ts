import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ORDER_EMAIL_EVENT_CATALOG,
  planOrderEmailEvent,
  type OrderEmailEventKind,
} from "./notification-event-contract";

const buyer = "buyer-tenant-1";
const seller = "seller-tenant-1";
const sourceEventId = randomUUID();
const basic = {
  sourceEventId, sellerTenantId: seller, buyerTenantId: buyer,
  sellerOrderId: "seller-order-1",
  buyerPurchaseOrderId: "buyer-po-1",
};

describe("Issue #110 order notification contract, no sending", () => {
  it("routes newly received B2B orders only to the seller inbox", () => {
    expect(planOrderEmailEvent({ ...basic, kind: "NEW_B2B_ORDER" })).toMatchObject({
      recipientTenantId: seller,
      relativeUrl: "/orders/inbox",
      eventKind: "NEW_B2B_ORDER",
    });
  });
  it("routes acceptance, rejection and seller shipment only to buyer PO", () => {
    for (const kind of [
      "B2B_ORDER_ACCEPTED", "B2B_ORDER_REJECTED", "B2B_SELLER_ORDER_SHIPPED",
    ] as const) {
      const plan = planOrderEmailEvent({ ...basic, kind });
      expect(plan.recipientTenantId).toBe(buyer);
      expect(plan.relativeUrl).toBe("/purchase-orders/buyer-po-1");
    }
  });
  it("routes buyer receipt acknowledgement to seller order and local order to owner", () => {
    const received = planOrderEmailEvent({
      ...basic, kind: "B2B_BUYER_PO_RECEIVED",
    });
    expect(received.recipientTenantId).toBe(seller);
    expect(received.relativeUrl).toBe("/orders/seller-order-1");
    const local = planOrderEmailEvent({
      kind: "NEW_LOCAL_ORDER", sourceEventId, sellerTenantId: seller,
      sellerOrderId: "local-order-1",
    });
    expect(local.recipientTenantId).toBe(seller);
    expect(local.relativeUrl).toBe("/orders/local-order-1");
  });
  it("deduplicates the same committed event/tenant, but not another event", () => {
    const e = planOrderEmailEvent({ ...basic, kind: "B2B_ORDER_ACCEPTED" });
    const repeat = planOrderEmailEvent({ ...basic, kind: "B2B_ORDER_ACCEPTED" });
    expect(e.dedupeKey).toBe(repeat.dedupeKey);
    expect(e.dedupeKey).toMatch(/^[a-f0-9]{64}$/);
    expect(e.dedupeKey).not.toBe(planOrderEmailEvent({
      ...basic, sourceEventId: randomUUID(), kind: "B2B_ORDER_ACCEPTED",
    }).dedupeKey);
    expect(e.dedupeKey).not.toBe(planOrderEmailEvent({
      ...basic, kind: "B2B_ORDER_REJECTED",
    }).dedupeKey);
  });
  it("never puts customer, product, email, price or tenant names in the message", () => {
    const values = Object.values(ORDER_EMAIL_EVENT_CATALOG);
    expect(values).toHaveLength(6);
    for (const def of values) {
      expect(def.title).toContain("Stordex");
      expect(def.title).not.toContain("@");
      expect(def.preview).not.toContain("@");
      expect(def.title.length).toBeLessThan(110);
    }
  });
  it("fails closed on forged tenant scope and unsafe link IDs", () => {
    expect(() => planOrderEmailEvent({
      ...basic, kind: "B2B_ORDER_ACCEPTED", buyerTenantId: seller,
    })).toThrow("双方の企業");
    expect(() => planOrderEmailEvent({
      ...basic, kind: "B2B_ORDER_ACCEPTED", buyerTenantId: undefined,
    })).toThrow("双方の企業");
    expect(() => planOrderEmailEvent({
      ...basic, kind: "B2B_ORDER_ACCEPTED", buyerPurchaseOrderId: "../admin",
    })).toThrow("参照先");
    expect(() => planOrderEmailEvent({
      ...basic, kind: "NEW_B2B_ORDER", sellerTenantId: "<script>",
    })).toThrow("受注企業");
    expect(() => planOrderEmailEvent({
      ...basic, kind: "B2B_BUYER_PO_RECEIVED", sellerOrderId: "",
    })).toThrow("参照先");
    expect(() => planOrderEmailEvent({
      ...basic, kind: "NEW_LOCAL_ORDER", sourceEventId: "not-an-event",
    })).toThrow("イベントID");
    expect(() => planOrderEmailEvent({
      ...basic, kind: "FORGED_KIND" as OrderEmailEventKind,
    })).toThrow("通知種別");
  });
});
