import { describe, expect, it } from "vitest";
import {
  MAX_INVENTORY_STOCK,
  parseManualInventoryInput,
} from "./manual-inventory-input";

const base = {
  itemId: "item-ci-1",
  type: "ADJUSTMENT",
  quantity: "0",
  reference: "",
  note: "",
};

describe("manual inventory movement input", () => {
  it("allows a legitimate zero physical count and preserves an integer zero", () => {
    expect(parseManualInventoryInput(base)).toEqual({
      itemId: "item-ci-1",
      type: "ADJUSTMENT",
      quantity: 0,
      reference: null,
      note: null,
    });
  });

  it("allows positive receipt, shipment and adjustment quantities", () => {
    for (const type of ["INBOUND", "OUTBOUND", "ADJUSTMENT"]) {
      expect(parseManualInventoryInput({ ...base, type, quantity: "7" }).quantity).toBe(7);
    }
  });

  it("rejects zero receipt/shipment, empty, fractional and negative quantities", () => {
    for (const type of ["INBOUND", "OUTBOUND"]) {
      expect(() => parseManualInventoryInput({ ...base, type }))
        .toThrow("1以上");
    }
    for (const quantity of ["", " ", "-1", "1.5", "NaN", "abc", "001", "2147483648"]) {
      expect(() => parseManualInventoryInput({ ...base, quantity })).toThrow();
    }
  });

  it("bounds the stock value and sanitizes optional strings", () => {
    expect(parseManualInventoryInput({
      ...base, quantity: String(MAX_INVENTORY_STOCK),
      reference: "  PO-1  ", note: "  counted  ",
    })).toMatchObject({
      quantity: MAX_INVENTORY_STOCK,
      reference: "PO-1",
      note: "counted",
    });
    expect(() => parseManualInventoryInput({ ...base, itemId: "" })).toThrow();
    expect(() => parseManualInventoryInput({ ...base, type: "UNKNOWN" })).toThrow();
    expect(() => parseManualInventoryInput({ ...base, note: "x".repeat(501) })).toThrow();
  });
});
