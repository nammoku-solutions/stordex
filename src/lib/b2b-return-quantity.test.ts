import { describe, expect, it } from "vitest";
import {
  planB2BReturnQuantity,
  validateB2BReturnDispatch,
  validateB2BReturnInspection,
  RETURN_INT_MAX,
} from "./b2b-return-quantity";

const normal = {
  sellerOrderItemId: "seller-line-1",
  originalOrdered: 10,
  sellerShipped: 10,
  buyerReceived: 7,
  alreadyCommitted: 2,
  requested: 3,
};

describe("B2B returns quantity-only guards (no DB writes)", () => {
  it("bounds multiple partial requests by actual physical receipt minus prior commitments", () => {
    expect(planB2BReturnQuantity(normal)).toEqual({
      sourceLimit: 7, available: 5, afterRequest: 2,
    });
    expect(() => planB2BReturnQuantity({
      ...normal, requested: 6,
    })).toThrow("残数量");
    expect(() => planB2BReturnQuantity({
      ...normal, alreadyCommitted: 8,
    })).toThrow("超えています");
  });

  it("requires a verified seller OrderItem ID and never guesses historical mappings", () => {
    for (const sellerOrderItemId of [null, "", " "]) {
      expect(() => planB2BReturnQuantity({
        ...normal, sellerOrderItemId,
      })).toThrow("紐付け");
    }
  });

  it("fails closed for source overreceipt or overshipment", () => {
    for (const data of [
      { buyerReceived: 11 }, { sellerShipped: 11 },
      { buyerReceived: -1 }, { alreadyCommitted: -1 },
      { requested: 0 }, { requested: 0.1 },
      { originalOrdered: RETURN_INT_MAX + 1 },
    ]) {
      expect(() => planB2BReturnQuantity({ ...normal, ...data })).toThrow();
    }
  });

  it("never dispatches beyond approval or physically available buyer stock", () => {
    const data = { approved: 6, alreadyDispatched: 2, dispatch: 3, currentBuyerStock: 5 };
    expect(validateB2BReturnDispatch(data)).toEqual({
      remainingApproved: 1, newBuyerStock: 2,
    });
    expect(() => validateB2BReturnDispatch({
      ...data, dispatch: 5,
    })).toThrow("承認済み");
    expect(() => validateB2BReturnDispatch({
      ...data, dispatch: 4, currentBuyerStock: 3,
    })).toThrow("在庫");
    expect(() => validateB2BReturnDispatch({
      ...data, alreadyDispatched: 7,
    })).toThrow();
  });

  it("replenishes seller stock only for inspected saleable goods", () => {
    const result = validateB2BReturnInspection({
      dispatched: 8, alreadyInspected: 3,
      receivedNow: 4, saleable: 1, unsaleable: 3,
    });
    expect(result).toEqual({
      remainingInTransit: 1, sellerRestock: 1, quarantine: 3,
    });
  });

  it("rejects inspection over receipt, missing damaged count and negative units", () => {
    const data = {
      dispatched: 8, alreadyInspected: 3, receivedNow: 4,
      saleable: 1, unsaleable: 3,
    };
    expect(() => validateB2BReturnInspection({
      ...data, saleable: 2,
    })).toThrow("一致");
    expect(() => validateB2BReturnInspection({
      ...data, receivedNow: 6, saleable: 4, unsaleable: 2,
    })).toThrow("超えて");
    expect(() => validateB2BReturnInspection({
      ...data, unsaleable: -1,
    })).toThrow();
    expect(() => validateB2BReturnInspection({
      ...data, receivedNow: 0, saleable: 0, unsaleable: 0,
    })).toThrow();
  });
});
