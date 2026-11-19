/** Default-off activation policy for the private, single-host Staging UAT. */
export const evidenceUatOrigin = "https://staging.stordex.jp";

export function evidenceUatEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  // Vercel cannot host this filesystem checkpoint and Unix scanner. A future
  // worker deployment must use an explicitly configured persistent volume.
  return env.APP_ENV === "staging" && env.STORDEX_B2B_EVIDENCE_UAT_ENABLED === "true" &&
    !env.VERCEL && !env.VERCEL_ENV;
}
