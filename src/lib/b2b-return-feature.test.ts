import { afterEach, describe, expect, it, vi } from "vitest";
import { b2bReturnFormsEnabled } from "./b2b-return-feature";

afterEach(() => vi.unstubAllEnvs());

describe("B2B return feature kill switch", () => {
  it("defaults to disabled when no explicit server-side activation exists", () => {
    vi.stubEnv("STORDEX_B2B_RETURNS_ENABLED", undefined);
    expect(b2bReturnFormsEnabled()).toBe(false);
  });
  it("only accepts the explicit string true", () => {
    for (const value of ["false", "TRUE", "1", "yes", ""]) {
      vi.stubEnv("STORDEX_B2B_RETURNS_ENABLED", value);
      expect(b2bReturnFormsEnabled()).toBe(false);
    }
    vi.stubEnv("STORDEX_B2B_RETURNS_ENABLED", "true");
    expect(b2bReturnFormsEnabled()).toBe(true);
  });
});
