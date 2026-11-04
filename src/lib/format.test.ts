import { describe, expect, it } from "vitest";
import { formatMovementQuantity } from "./format";

describe("signed stock movement quantity formatting", () => {
  it("renders negative adjustment from stocktake 10 to 0 as -10", () => {
    expect(formatMovementQuantity("ADJUSTMENT", -10)).toBe("-10");
  });
  it("shows positive adjustments and normal inbound as plus", () => {
    expect(formatMovementQuantity("ADJUSTMENT", 5)).toBe("+5");
    expect(formatMovementQuantity("INBOUND", 12)).toBe("+12");
  });
  it("shows outbound as negative despite positive stored quantity", () => {
    expect(formatMovementQuantity("OUTBOUND", 3)).toBe("-3");
  });
  it("shows a zero adjustment without an erroneous plus sign", () => {
    expect(formatMovementQuantity("ADJUSTMENT", 0)).toBe("0");
  });
});
