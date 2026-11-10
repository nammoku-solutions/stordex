import { afterEach, describe, expect, it, vi } from "vitest";
import { b2bCreditDraftEnabled } from "./b2b-credit-draft-feature";

afterEach(() => vi.unstubAllEnvs());
describe("CreditNote DRAFT UAT opt-in kill switch", () => {
  it("fails closed unless exact true and nonproduction", () => {
    for(const value of [undefined, "false", "TRUE", "1", ""]) {
      vi.stubEnv("STORDEX_B2B_CREDIT_DRAFT_ENABLED",value);
      vi.stubEnv("STORDEX_ENV","staging");
      expect(b2bCreditDraftEnabled()).toBe(false);
    }
    vi.stubEnv("STORDEX_B2B_CREDIT_DRAFT_ENABLED","true");
    vi.stubEnv("STORDEX_ENV","production");
    expect(b2bCreditDraftEnabled()).toBe(false);
  });
  it("can be turned on explicitly for Staging only",() => {
    vi.stubEnv("STORDEX_B2B_CREDIT_DRAFT_ENABLED","true");
    vi.stubEnv("STORDEX_ENV","staging");
    expect(b2bCreditDraftEnabled()).toBe(true);
  });
});
