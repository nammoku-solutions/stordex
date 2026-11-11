import { b2bCreditDraftEnabled } from "./b2b-credit-draft-feature";

/** Independent, hard-off VOID button until migration, restore and approval. */
export function b2bCreditVoidEnabled():boolean {
  return b2bCreditDraftEnabled() &&
    process.env.STORDEX_B2B_CREDIT_VOID_ENABLED==="true";
}
