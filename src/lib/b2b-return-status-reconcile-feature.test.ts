import { afterEach, describe, expect, it, vi } from "vitest";
import { b2bReturnStatusReconcileEnabled } from "./b2b-return-status-reconcile-feature";

afterEach(() => vi.unstubAllEnvs());

describe("independent formal return status reconcile kill switch", () => {
  it("fails closed without both exact true values", () => {
    for (const [forms, reconcile] of [
      [undefined, undefined], ["true", undefined],
      [undefined, "true"], ["false", "true"],
      ["true", "false"], ["true", "TRUE"], ["true", "1"],
    ]) {
      vi.stubEnv("STORDEX_B2B_RETURNS_ENABLED", forms);
      vi.stubEnv("STORDEX_B2B_RETURN_STATUS_RECONCILE_ENABLED", reconcile);
      expect(b2bReturnStatusReconcileEnabled()).toBe(false);
    }
  });
  it("enables only if both flags are exact true", () => {
    vi.stubEnv("STORDEX_B2B_RETURNS_ENABLED", "true");
    vi.stubEnv("STORDEX_B2B_RETURN_STATUS_RECONCILE_ENABLED", "true");
    expect(b2bReturnStatusReconcileEnabled()).toBe(true);
  });
});
