import { b2bReturnFormsEnabled } from "./b2b-return-feature";

/**
 * A distinct, staging-scoped kill switch for formal return status writes.
 * Physical inventory posts remain independently gated and disabled.
 */
export function b2bReturnStatusReconcileEnabled(): boolean {
  return b2bReturnFormsEnabled() &&
    process.env.STORDEX_B2B_RETURN_STATUS_RECONCILE_ENABLED === "true";
}
