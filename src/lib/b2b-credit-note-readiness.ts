/**
 * Credit-note preflight only: no accounting journal, no issue/refund, and no
 * monetary allocation. Existing invoices may aggregate multiple orders and
 * calculate tax per order OR per invoice, so the original invoice must be
 * reconciled before a credit amount can be finalized.
 */
import { RETURN_INT_MAX } from "./b2b-return-quantity";

type InvoiceState = "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";
type LinkedInvoice = {
  id: string;
  status: InvoiceState;
  taxPerOrder: boolean;
  taxRate: number;
};
export class CreditNoteReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditNoteReadinessError";
  }
}
function units(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > RETURN_INT_MAX) {
    throw new CreditNoteReadinessError(name + "は0〜2,147,483,647の整数で入力してください");
  }
  return value;
}
export function assessB2BCreditNoteReadiness(input: {
  approved: number;
  dispatched: number;
  inspected: number;
  previouslyCreditedUnits: number;
  linkedInvoices: readonly LinkedInvoice[];
}): {
  status: "AWAITING_INSPECTION" | "NO_LINKED_INVOICE" | "MANUAL_RECONCILIATION_REQUIRED";
  inspectedUncreditedUnits: number;
  invoiceIds: string[];
  taxBasis: "NOT_APPLICABLE" | "MIXED_OR_INVOICE_SPECIFIC";
  paymentReviewRequired: boolean;
  message: string;
} {
  const approved = units("承認済み数量", input.approved);
  const dispatched = units("返送済み数量", input.dispatched);
  const inspected = units("検品済み数量", input.inspected);
  const credited = units("既存の金額調整済み数量", input.previouslyCreditedUnits);
  if (dispatched > approved || inspected > dispatched || credited > inspected) {
    throw new CreditNoteReadinessError("承認・返送・検品・金額調整の数量に矛盾があります");
  }
  const seen = new Set<string>();
  for (const invoice of input.linkedInvoices) {
    if (!invoice.id || seen.has(invoice.id) ||
        !Number.isSafeInteger(invoice.taxRate) ||
        invoice.taxRate < 0 || invoice.taxRate > 100 ||
        !["DRAFT", "ISSUED", "PAID", "CANCELLED"].includes(invoice.status)) {
      throw new CreditNoteReadinessError("元請求書の参照情報に不整合があります");
    }
    seen.add(invoice.id);
  }
  const ids = [...seen].sort();
  const uncredited = inspected - credited;
  const paymentReviewRequired = input.linkedInvoices.some(x => x.status === "PAID");
  if (inspected === 0 || uncredited === 0) {
    return {
      status: "AWAITING_INSPECTION",
      inspectedUncreditedUnits: uncredited,
      invoiceIds: ids,
      taxBasis: ids.length ? "MIXED_OR_INVOICE_SPECIFIC" : "NOT_APPLICABLE",
      paymentReviewRequired,
      message: inspected === 0
        ? "検品実績がないためクレジットノートの発行判断はできません。"
        : "検品済み数量に対する未調整分はありません。過去調整との照合が必要です。",
    };
  }
  if (ids.length === 0) {
    return {
      status: "NO_LINKED_INVOICE",
      inspectedUncreditedUnits: uncredited,
      invoiceIds: ids,
      taxBasis: "NOT_APPLICABLE",
      paymentReviewRequired: false,
      message: "元受注に紐づく請求書がありません。返金額を自動計算せず、売上・支払履歴を確認してください。",
    };
  }
  return {
    status: "MANUAL_RECONCILIATION_REQUIRED",
    inspectedUncreditedUnits: uncredited,
    invoiceIds: ids,
    taxBasis: "MIXED_OR_INVOICE_SPECIFIC",
    paymentReviewRequired,
    message: "元請求書の税計算方式・他伝票への配賦・入金状況・過去の金額調整を照合してからCreditNoteを作成してください。",
  };
}
