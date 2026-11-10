import { afterEach, describe, expect, it, vi } from "vitest";
import { b2bReturnStockEnabled } from "./b2b-return-stock-feature";

afterEach(() => vi.unstubAllEnvs());

describe("independent physical return stock kill switch", () => {
  it("is hard-off without BOTH flags", () => {
    for (const [forms, stock] of [
      [undefined, undefined], ["true", undefined],
      [undefined, "true"], ["false", "true"],
      ["true", "false"], ["true", "TRUE"], ["true", "1"],
    ]) {
      vi.stubEnv("STORDEX_B2B_RETURNS_ENABLED", forms);
      vi.stubEnv("STORDEX_B2B_RETURN_STOCK_ENABLED", stock);
      expect(b2bReturnStockEnabled()).toBe(false);
    }
  });
  it("requires both exact string true values", () => {
    vi.stubEnv("STORDEX_B2B_RETURNS_ENABLED", "true");
    vi.stubEnv("STORDEX_B2B_RETURN_STOCK_ENABLED", "true");
    expect(b2bReturnStockEnabled()).toBe(true);
  });
});
