import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { planBuyerReturnDispatch, planSellerReturnInspection } from "./b2b-return-event-plans";

const id = randomUUID();
const dispatch = {
  eventId: id, tenantId: "buyer-1", returnLineId: "return-line-1",
  buyerItemId: "buyer-item-1", approved: 7, alreadyDispatched: 2,
  dispatch: 3, currentBuyerStock: 5,
};
const inspection = {
  eventId: randomUUID(), tenantId: "seller-1", returnLineId: "return-line-1",
  sellerItemId: "seller-item-1", dispatched: 5, alreadyInspected: 1,
  receivedNow: 3, saleable: 1, unsaleable: 2, currentSellerStock: 12,
};
describe("B2B return event posting plans (pure, no database writes)", () => {
  it("plans dispatch as one positive OUTBOUND movement with nonnegative buyer stock", () => {
    const p = planBuyerReturnDispatch(dispatch);
    expect(p).toMatchObject({
      phase: "DISPATCH", movementType: "OUTBOUND", tenantId: "buyer-1",
      itemId: "buyer-item-1", quantity: 3, newStock: 2, remainingApproved: 2,
    });
    expect(p.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(planBuyerReturnDispatch(dispatch).payloadHash).toBe(p.payloadHash);
  });
  it("plans seller inspection to restock saleable only", () => {
    const p = planSellerReturnInspection(inspection);
    expect(p).toMatchObject({
      phase: "INSPECTION", movementType: "INBOUND", tenantId: "seller-1",
      quantity: 1, quarantine: 2, remainingInTransit: 1, newStock: 13,
    });
  });
  it("records damaged-only inspection without inventing a zero-quantity movement", () => {
    const p = planSellerReturnInspection({
      ...inspection, saleable: 0, unsaleable: 3,
    });
    expect(p).toMatchObject({
      phase: "INSPECTION", movementType: null, quantity: 0,
      quarantine: 3, newStock: 12,
    });
  });
  it("blocks insufficient buyer stock, excess dispatch, inspection overcount and overflow", () => {
    expect(() => planBuyerReturnDispatch({
      ...dispatch, currentBuyerStock: 2,
    })).toThrow("現在庫");
    expect(() => planBuyerReturnDispatch({
      ...dispatch, dispatch: 6,
    })).toThrow("承認済み");
    expect(() => planSellerReturnInspection({
      ...inspection, receivedNow: 5, saleable: 3, unsaleable: 2,
    })).toThrow("超えて");
    expect(() => planSellerReturnInspection({
      ...inspection, currentSellerStock: 2147483647,
    })).toThrow("範囲外");
    expect(() => planSellerReturnInspection({
      ...inspection, saleable: 2, unsaleable: 2,
    })).toThrow("一致");
  });
  it("rejects invalid event IDs and unsafe ID payloads", () => {
    expect(() => planBuyerReturnDispatch({
      ...dispatch, eventId: "not-a-uuid",
    })).toThrow("UUID");
    expect(() => planBuyerReturnDispatch({
      ...dispatch, tenantId: "../tenant-b",
    })).toThrow("企業ID");
    expect(() => planSellerReturnInspection({
      ...inspection, returnLineId: "<script>",
    })).toThrow("返品明細ID");
  });
  it("fingerprints payload differences to detect reused idempotency key", () => {
    const first = planBuyerReturnDispatch(dispatch);
    expect(planBuyerReturnDispatch({
      ...dispatch, dispatch: 2,
    }).payloadHash).not.toBe(first.payloadHash);
    expect(planBuyerReturnDispatch({
      ...dispatch, buyerItemId: "buyer-item-2",
    }).payloadHash).not.toBe(first.payloadHash);
    expect(planBuyerReturnDispatch({
      ...dispatch, eventId: randomUUID(),
    }).payloadHash).not.toBe(first.payloadHash);
  });
});
