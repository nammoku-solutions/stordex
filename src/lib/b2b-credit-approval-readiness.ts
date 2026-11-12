/**
 * Pure maker/checker preflight for a hypothetical CreditNote amount approval.
 *
 * This is DESIGN VALIDATION ONLY. There are no current approval records,
 * currency-evidence tables, financial writer or issue endpoint. It never
 * authorizes credit issuance, settlement, refund, offset or DB mutation.
 */
import {
  assessInvoiceCurrencyEvidence,
  type InvoiceCurrencyEvidenceInput,
  type CurrencyEvidenceBlocker,
} from "./b2b-credit-currency-evidence-policy";

const MAX_YEN = 2_147_483_647;
const validYen = (n: number): boolean => Number.isSafeInteger(n) && n >= 0 && n <= MAX_YEN;
const admin = (role: string): boolean => role === "OWNER" || role === "ADMIN";
const nonBlank = (s: string): boolean => typeof s === "string" && s.length > 0 && s.length <= 128;
const sha256 = (s: string): boolean => /^[a-f0-9]{64}$/i.test(s);

export type CreditApprovalBlocker =
  | "INVALID_IDENTITIES"
  | "INVALID_CREDIT_STATE"
  | "NOT_SELLER_MANAGER"
  | "SAME_MAKER_AND_CHECKER"
  | "WRONG_SELLER_CHECKER"
  | "UNVERIFIED_SOURCE_CURRENCY"
  | "AMOUNT_NOT_RECOMPUTED"
  | "TAX_SIGNOFF_MISSING"
  | "ACTIVE_OR_POSTED_CREDIT_EXISTS"
  | "INVOICE_CAP_EXCEEDED"
  | "INVOICE_SNAPSHOT_MISMATCH";

export type CreditApprovalDraft = Readonly<{
  creditNoteId: string;
  status: string;
  sellerTenantId: string;
  invoiceId: string;
  createdByUserId: string;
  invoiceSnapshotSha256: string;
  /** Trusted, server-side recomputation checksum for the full amount payload. */
  computedAmountsSha256: string;
  proposedSubtotal: number;
  proposedTax: number;
  proposedTotal: number;
}>;

export type CreditApprovalActor = Readonly<{
  userId: string;
  tenantId: string;
  role: string;
  active: boolean;
}>;

export type CreditAccountingSignoff = Readonly<{
  signerUserId: string;
  sellerTenantId: string;
  signerRole: string;
  signerActive: boolean;
  signedAmountHashSha256: string;
  sourceInvoiceHashSha256: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}>;

export type CreditApprovalReadinessInput = Readonly<{
  draft: CreditApprovalDraft;
  maker: CreditApprovalActor;
  checker: CreditApprovalActor;
  originalInvoice: Readonly<{
    id: string;
    sellerTenantId: string;
    status: string;
    total: number;
    /** Independent server-side original Invoice snapshot checksum. */
    trustedInvoiceSnapshotSha256: string;
  }>;
  currencyEvidence: InvoiceCurrencyEvidenceInput;
  accountingSignoff: CreditAccountingSignoff | null;
  /** Includes other active drafts and historical issued credits, not VOID. */
  competingOpenOrPostedCreditCount: number;
}>;

export type CreditApprovalReadiness =
  | Readonly<{ readyForFutureApprovalDesign: false; blocker: CreditApprovalBlocker; currencyBlocker?: CurrencyEvidenceBlocker }>
  | Readonly<{
      readyForFutureApprovalDesign: true;
      checkedGross: number;
      currencyCode: "JPY";
      makerUserId: string;
      checkerUserId: string;
      /** Always false. A financial issue/reconcile workflow is NOT implemented. */
      financialPostingAllowed: false;
      stateChangeAllowed: false;
    }>;

const fail = (blocker: CreditApprovalBlocker, currencyBlocker?: CurrencyEvidenceBlocker): CreditApprovalReadiness =>
  currencyBlocker ? { readyForFutureApprovalDesign: false, blocker, currencyBlocker } :
    { readyForFutureApprovalDesign: false, blocker };

export function assessCreditApprovalReadiness(
  input: CreditApprovalReadinessInput,
): CreditApprovalReadiness {
  const { draft, maker, checker, originalInvoice: invoice, currencyEvidence: currency, accountingSignoff: signoff } = input;
  if (![draft.creditNoteId, draft.sellerTenantId, draft.invoiceId,
        draft.createdByUserId, maker.userId, maker.tenantId, checker.userId,
        checker.tenantId, invoice.id, invoice.sellerTenantId].every(nonBlank)) {
    return fail("INVALID_IDENTITIES");
  }
  if (draft.status !== "DRAFT" || !["ISSUED", "PAID"].includes(invoice.status) ||
      draft.invoiceId !== invoice.id || draft.sellerTenantId !== invoice.sellerTenantId ||
      draft.createdByUserId !== maker.userId) {
    return fail("INVALID_CREDIT_STATE");
  }
  if (!maker.active || !admin(maker.role) || maker.tenantId !== draft.sellerTenantId) {
    return fail("NOT_SELLER_MANAGER");
  }
  if (checker.userId === maker.userId) {
    return fail("SAME_MAKER_AND_CHECKER");
  }
  if (!checker.active || !admin(checker.role) || checker.tenantId !== draft.sellerTenantId) {
    return fail("WRONG_SELLER_CHECKER");
  }
  if (!sha256(draft.invoiceSnapshotSha256) ||
      !sha256(invoice.trustedInvoiceSnapshotSha256) ||
      draft.invoiceSnapshotSha256.toLowerCase() !==
        invoice.trustedInvoiceSnapshotSha256.toLowerCase()) {
    return fail("INVOICE_SNAPSHOT_MISMATCH");
  }
  if (currency.invoiceId !== invoice.id ||
      currency.sellerTenantId !== invoice.sellerTenantId ||
      currency.invoiceStatus !== invoice.status ||
      !sha256(currency.trustedInvoiceSnapshotSha256) ||
      currency.trustedInvoiceSnapshotSha256.toLowerCase() !==
        invoice.trustedInvoiceSnapshotSha256.toLowerCase()) {
    return fail("INVOICE_SNAPSHOT_MISMATCH");
  }
  const currencyResult = assessInvoiceCurrencyEvidence(currency);
  if (!currencyResult.currencyVerified) {
    return fail("UNVERIFIED_SOURCE_CURRENCY", currencyResult.blocker);
  }
  if (!validYen(draft.proposedSubtotal) || !validYen(draft.proposedTax) ||
      !validYen(draft.proposedTotal) ||
      draft.proposedSubtotal + draft.proposedTax !== draft.proposedTotal ||
      !sha256(draft.computedAmountsSha256)) {
    return fail("AMOUNT_NOT_RECOMPUTED");
  }
  if (!validYen(invoice.total) || draft.proposedTotal > invoice.total) {
    return fail("INVOICE_CAP_EXCEEDED");
  }
  if (!Number.isSafeInteger(input.competingOpenOrPostedCreditCount) ||
      input.competingOpenOrPostedCreditCount !== 0) {
    return fail("ACTIVE_OR_POSTED_CREDIT_EXISTS");
  }
  if (!signoff || signoff.status !== "APPROVED" ||
      signoff.sellerTenantId !== draft.sellerTenantId ||
      !signoff.signerActive || !admin(signoff.signerRole) ||
      !nonBlank(signoff.signerUserId) ||
      signoff.signerUserId === maker.userId ||
      !sha256(signoff.signedAmountHashSha256) ||
      !sha256(signoff.sourceInvoiceHashSha256) ||
      signoff.signedAmountHashSha256.toLowerCase() !==
        draft.computedAmountsSha256.toLowerCase() ||
      signoff.sourceInvoiceHashSha256.toLowerCase() !==
        invoice.trustedInvoiceSnapshotSha256.toLowerCase()) {
    return fail("TAX_SIGNOFF_MISSING");
  }
  return {
    readyForFutureApprovalDesign: true,
    checkedGross: draft.proposedTotal,
    currencyCode: "JPY",
    makerUserId: maker.userId,
    checkerUserId: checker.userId,
    financialPostingAllowed: false,
    stateChangeAllowed: false,
  };
}
