import { b2bReturnFormsEnabled } from "./b2b-return-feature";

/**
 * Independent, hard-off guard for stock-mutating physical returns.
 * Existing request/review flag alone MUST NOT allow inventory mutations.
 */
export function b2bReturnStockEnabled(): boolean {
  return b2bReturnFormsEnabled() &&
    process.env.STORDEX_B2B_RETURN_STOCK_ENABLED === "true";
}
