/** Hard-off unless explicitly enabled by an approved release.
 * Staging return-request tables were already migrated under PR #139.
 * UI is not public: no environment flag changes are made by this PR.
 */
export function b2bReturnFormsEnabled(): boolean {
  return process.env.STORDEX_B2B_RETURNS_ENABLED === "true";
}
