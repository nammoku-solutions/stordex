import { afterEach, describe, expect, it, vi } from "vitest";
import {
  b2bCreditPreviewEnabled,
  hasManualJPYConfirmation,
  isSellerCreditPreviewManager,
} from "./b2b-credit-preview-feature";

afterEach(() => vi.unstubAllEnvs());

describe("seller-only read-only credit preview switch", () => {
  it("fails closed for missing settings, wrong case, wrong branch or production", () => {
    vi.stubEnv("STORDEX_B2B_CREDIT_PREVIEW_ENABLED", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "staging");
    expect(b2bCreditPreviewEnabled()).toBe(false);

    vi.stubEnv("STORDEX_B2B_CREDIT_PREVIEW_ENABLED", "TRUE");
    expect(b2bCreditPreviewEnabled()).toBe(false);

    vi.stubEnv("STORDEX_B2B_CREDIT_PREVIEW_ENABLED", "true");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    expect(b2bCreditPreviewEnabled()).toBe(false);

    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "staging");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(b2bCreditPreviewEnabled()).toBe(false);
  });

  it("permits only the exact Staging Preview branch", () => {
    vi.stubEnv("STORDEX_B2B_CREDIT_PREVIEW_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "staging");
    expect(b2bCreditPreviewEnabled()).toBe(true);
  });

  it("never allows buyer/STAFF or arbitrary currency confirmation", () => {
    expect(isSellerCreditPreviewManager("OWNER")).toBe(true);
    expect(isSellerCreditPreviewManager("ADMIN")).toBe(true);
    for (const role of ["STAFF", "BUYER", "", "owner"]) {
      expect(isSellerCreditPreviewManager(role)).toBe(false);
    }
    expect(hasManualJPYConfirmation(undefined)).toBe(false);
    expect(hasManualJPYConfirmation("")).toBe(false);
    expect(hasManualJPYConfirmation("jpy")).toBe(false);
    expect(hasManualJPYConfirmation("USD")).toBe(false);
    expect(hasManualJPYConfirmation(["JPY"])).toBe(false);
    expect(hasManualJPYConfirmation("JPY")).toBe(true);
  });
});
