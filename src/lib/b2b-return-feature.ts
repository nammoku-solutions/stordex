/** Hard-off by default, including production and Staging. The new return schema
 * must be migrated and tested before this flag is ever explicitly enabled. */
export function b2bReturnFormsEnabled(): boolean {
  return process.env.STORDEX_B2B_RETURNS_ENABLED === "true";
}
