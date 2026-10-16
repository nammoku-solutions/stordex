import { describe, expect, it } from "vitest";
import { orderedTenantPair } from "./trading-connections";

describe("orderedTenantPair", () => {
  it("assigns the same pair in both request directions", () => {
    expect(orderedTenantPair("b", "a")).toEqual(["a", "b"]);
    expect(orderedTenantPair("a", "b")).toEqual(["a", "b"]);
  });

  it("rejects self-connections and blank tenant ids", () => {
    expect(() => orderedTenantPair("a", "a")).toThrow();
    expect(() => orderedTenantPair("", "b")).toThrow();
  });
});
