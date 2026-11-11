/**
 * Isolated, explicitly approved Staging UAT switch.
 * Does NOT depend on the existing return/stock/status mutation switches.
 * No default-on: missing value, casing variants and production are all OFF.
 */
export function b2bCreditDraftEnabled(): boolean {
  return process.env.STORDEX_B2B_CREDIT_DRAFT_ENABLED === "true" &&
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "staging";
}
