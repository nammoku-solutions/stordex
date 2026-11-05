/**
 * Issue #82 — proposed settlement calculation ONLY, no payment/offset.
 *
 * The current credit-note DB migration explicitly allows DRAFT only. These
 * guards are preparatory for a separately reviewed ISSUE+SETTLE workflow.
 * Passing the guards is NOT authority to send a refund, issue a document,
 * decrease an invoice or mark a credit note APPLIED.
 */
import { createHash } from "node:crypto";

export type B2BSettlementKind = "REFUND" | "INVOICE_OFFSET";
const MAX = 2_147_483_647;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const CURRENCY = /^[A-Z]{3}$/;

export class B2BSettlementPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "B2BSettlementPlanError";
  }
}
function money(n: number, name: string): number {
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX) {
    throw new B2BSettlementPlanError(name + "は0以上の整数で指定してください");
  }
  return n;
}
export function planB2BCreditSettlement(input: {
  sellerTenantId: string;
  creditNoteId: string;
  /** Target is a ledger payment ID for REFUND; a receivable invoice ID
   * for INVOICE_OFFSET. Future writer MUST resolve its tenant/ownership. */
  targetReferenceId: string;
  idempotencyKey: string;
  currencyCode: string;
  method: B2BSettlementKind;
  creditStatus: "DRAFT" | "RECONCILED" | "ISSUED" | "APPLIED" | "VOID";
  originalInvoiceStatus: "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";
  issuedCreditTotalMinor: number;
  previouslySettledMinor: number;
  requestedMinor: number;
  /** Independently verified accounting ledger, never guessed from status. */
  eligiblePaidAmountMinor: number;
  eligibleOpenReceivableMinor: number;
  /** All flags must be determined by a future authorized server transaction. */
  sourceInvoiceAndTenantVerified: boolean;
  originalTaxAllocationReviewed: boolean;
  currencyMinorUnitVerified: boolean;
  paymentOrReceivableLedgerReconciled: boolean;
}): {
  status: "MANUAL_SETTLEMENT_REVIEW_REQUIRED";
  method: B2BSettlementKind;
  requestedMinor: number;
  remainingCreditMinor: number;
  /** Claim key guards event replay, fingerprint detects same key/new payload.
   * Neither has any effect until stored with a unique DB constraint. */
  claimKey: string;
  payloadHash: string;
  message: string;
} {
  if (!ID.test(input.sellerTenantId) || !ID.test(input.creditNoteId) ||
      !ID.test(input.targetReferenceId) || !UUID.test(input.idempotencyKey)) {
    throw new B2BSettlementPlanError("対象企業・CreditNote・参照先・再送キーが不正です");
  }
  if (!CURRENCY.test(input.currencyCode) ||
      !["REFUND", "INVOICE_OFFSET"].includes(input.method)) {
    throw new B2BSettlementPlanError("通貨または精算方法を確認してください");
  }
  if (input.creditStatus !== "ISSUED" ||
      !["ISSUED", "PAID"].includes(input.originalInvoiceStatus)) {
    throw new B2BSettlementPlanError(
      "正式発行済みのCreditNoteと有効な元請求書が必要です",
    );
  }
  if (!input.sourceInvoiceAndTenantVerified ||
      !input.originalTaxAllocationReviewed ||
      !input.currencyMinorUnitVerified ||
      !input.paymentOrReceivableLedgerReconciled) {
    throw new B2BSettlementPlanError(
      "税額・通貨単位・企業・元請求書・会計台帳の照合が完了していません",
    );
  }
  const issuedTotal = money(input.issuedCreditTotalMinor, "発行済みCreditNote総額");
  const settled = money(input.previouslySettledMinor, "精算済み金額");
  const requested = money(input.requestedMinor, "今回の精算額");
  const paid = money(input.eligiblePaidAmountMinor, "返金可能な受領額");
  const openReceivable = money(input.eligibleOpenReceivableMinor, "相殺可能な未回収額");
  if (issuedTotal === 0 || settled > issuedTotal ||
      requested === 0 || requested > issuedTotal - settled) {
    throw new B2BSettlementPlanError("今回の精算額が未精算CreditNote残高を超えています");
  }
  if (input.method === "REFUND" && (input.originalInvoiceStatus !== "PAID" ||
       requested > paid)) {
    throw new B2BSettlementPlanError(
      "返金前に入金済み金額と返金可能残高を確認してください",
    );
  }
  if (input.method === "INVOICE_OFFSET" && requested > openReceivable) {
    throw new B2BSettlementPlanError(
      "相殺額が未回収請求残高を超えています",
    );
  }
  const scope = ["b2b-credit-settlement-v1", input.sellerTenantId,
    input.idempotencyKey.toLowerCase()].join(":");
  const claimKey = createHash("sha256").update(scope).digest("hex");
  const payloadHash = createHash("sha256").update(JSON.stringify([
    scope, input.creditNoteId, input.targetReferenceId, input.currencyCode,
    input.method, requested,
  ])).digest("hex");
  return {
    status: "MANUAL_SETTLEMENT_REVIEW_REQUIRED",
    method: input.method,
    requestedMinor: requested,
    remainingCreditMinor: issuedTotal - settled - requested,
    claimKey, payloadHash,
    message: "候補金額の上限のみ検証しました。返金実行・請求相殺・CreditNote適用は別途承認・監査・台帳更新が必要です。",
  };
}
