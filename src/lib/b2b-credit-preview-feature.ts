/**
 * Independent Staging-only read-only CreditNote amount preview.
 * Default-OFF. Does not enable draft/void or financial writes.
 */
export function b2bCreditPreviewEnabled(): boolean {
  return process.env.STORDEX_B2B_CREDIT_PREVIEW_ENABLED === "true" &&
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "staging";
}

/** A temporary human attestation for read-only illustration, NOT currency provenance. */
export function hasManualJPYConfirmation(value: unknown): boolean {
  return value === "JPY";
}

export function isSellerCreditPreviewManager(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}
