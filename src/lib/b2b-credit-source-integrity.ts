/**
 * Read-only primitives for future CreditNote original Invoice provenance.
 *
 * IMPORTANT: callers must load invoice/orders/order lines using a trusted,
 * seller-scoped server transaction. Digest shape alone does NOT authenticate
 * uploaded documents or a client-supplied financial snapshot. This module
 * makes no DB writes and authorizes no credit, approval or payment.
 */
import { createHash, timingSafeEqual } from "node:crypto";

const LIMIT = 2_147_483_647;
const validAmount = (x: number): boolean =>
  Number.isSafeInteger(x) && x >= 0 && x <= LIMIT;
const validName = (x: string): boolean =>
  typeof x === "string" && x.trim().length > 0 && x.length <= 128;
const validRate = (n: number): boolean =>
  Number.isInteger(n) && n >= 0 && n <= 100;

export type OriginalInvoiceFinancialSource = Readonly<{
  invoiceId: string;
  sellerTenantId: string;
  invoiceNumber: string;
  issueDate: string;
  periodYear: number;
  periodMonth: number;
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
  taxPerOrder: boolean;
  orders: readonly Readonly<{
    orderId: string;
    sellerTenantId: string;
    subtotal: number;
    tax: number;
    total: number;
    taxRate: number;
    lines: readonly Readonly<{
      lineId: string;
      itemId: string;
      quantity: number;
      unitPrice: number;
      amount: number;
    }>[];
  }>[];
}>;

export type OriginalInvoiceSourceResult =
  | Readonly<{ ready: false; blocker:
      "INVALID_INVOICE" | "INVALID_LINE" | "INCOMPLETE_SOURCE" |
      "AMOUNT_MISMATCH" | "TAX_MISMATCH" }>
  | Readonly<{ ready: true; snapshotSha256: string; orderCount: number;
      lineCount: number; financialPostingAllowed: false }>;

const fail = (blocker: Extract<OriginalInvoiceSourceResult, {ready:false}>["blocker"]):
  OriginalInvoiceSourceResult => ({ready:false,blocker});

export function computeOriginalInvoiceFinancialFingerprint(
  source: OriginalInvoiceFinancialSource,
): OriginalInvoiceSourceResult {
  if (!validName(source.invoiceId) ||
      !validName(source.sellerTenantId) ||
      !validName(source.invoiceNumber) ||
      typeof source.issueDate !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(source.issueDate) ||
      !Number.isFinite(Date.parse(source.issueDate)) ||
      new Date(source.issueDate).toISOString() !== source.issueDate ||
      !Number.isSafeInteger(source.periodYear) ||
      source.periodYear < 2000 || source.periodYear > 2200 ||
      !Number.isInteger(source.periodMonth) ||
      source.periodMonth < 1 || source.periodMonth > 12 ||
      !validRate(source.taxRate) ||
      typeof source.taxPerOrder !== "boolean" ||
      !validAmount(source.subtotal) ||
      !validAmount(source.tax) ||
      !validAmount(source.total) ||
      source.subtotal + source.tax !== source.total) {
    return fail("INVALID_INVOICE");
  }
  if (!Array.isArray(source.orders) ||
      source.orders.length === 0 || source.orders.length > 200 ||
      source.orders.some(x => !x || !Array.isArray(x.lines) || x.lines.length === 0 ||
        x.lines.length > 500)) {
    return fail("INCOMPLETE_SOURCE");
  }

  let lineCount=0, subtotal=0, orderTax=0, sumGross=0;
  const orderIds=new Set<string>(), globalLineIds=new Set<string>();
  const canonical: unknown[][] = [];

  for(const order of source.orders) {
    if (!validName(order.orderId) || orderIds.has(order.orderId) ||
        order.sellerTenantId !== source.sellerTenantId ||
        !validAmount(order.subtotal) || !validAmount(order.tax) ||
        !validAmount(order.total) || !validRate(order.taxRate) ||
        order.subtotal+order.tax !== order.total) {
      return fail("INVALID_INVOICE");
    }
    orderIds.add(order.orderId);
    let lineSubtotal=0;
    const lines: unknown[][]=[];
    for(const item of order.lines) {
      if (!validName(item.lineId) || !validName(item.itemId) ||
          globalLineIds.has(item.lineId) ||
          !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
          !validAmount(item.unitPrice) || !validAmount(item.amount) ||
          item.quantity * item.unitPrice !== item.amount) {
        return fail("INVALID_LINE");
      }
      globalLineIds.add(item.lineId);
      lineSubtotal+=item.amount;
      lineCount++;
      lines.push([item.lineId,item.itemId,item.quantity,item.unitPrice,item.amount]);
    }
    if (lineSubtotal !== order.subtotal) return fail("AMOUNT_MISMATCH");
    if (source.taxPerOrder &&
        Math.floor(order.subtotal * order.taxRate/100) !== order.tax) {
      return fail("TAX_MISMATCH");
    }
    subtotal+=order.subtotal;
    orderTax+=order.tax;
    sumGross+=order.total;
    lines.sort((a,b) => {
      const left=String(a[0]),right=String(b[0]);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    canonical.push([
      order.orderId,order.sellerTenantId,order.subtotal,order.tax,
      order.total,order.taxRate,lines,
    ]);
  }
  if (subtotal !== source.subtotal) return fail("AMOUNT_MISMATCH");
  if (source.taxPerOrder) {
    if (orderTax!==source.tax || sumGross!==source.total) return fail("TAX_MISMATCH");
  } else if (Math.floor(source.subtotal*source.taxRate/100)!==source.tax) {
    return fail("TAX_MISMATCH");
  }
  canonical.sort((a,b) => {
    const left=String(a[0]),right=String(b[0]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const payload=JSON.stringify([
    "STORDEX_INVOICE_FINANCIAL_SOURCE_V1",
    source.invoiceId,source.sellerTenantId,source.invoiceNumber,
    source.issueDate,source.periodYear,source.periodMonth,
    source.subtotal,source.tax,source.total,
    source.taxRate,source.taxPerOrder,canonical,
  ]);
  return {
    ready:true,
    snapshotSha256:createHash("sha256").update(payload,"utf8").digest("hex"),
    orderCount:canonical.length,
    lineCount,
    financialPostingAllowed:false,
  };
}

/**
 * Verify downloaded original *bytes* against an independently stored trusted
 * sha256. Both the file-reference ownership and expected digest MUST come
 * from authenticated private storage; a request-provided digest is not proof.
 * Deliberately returns only a byte match, never "evidence approved".
 */
export function compareOriginalInvoiceBytesToTrustedDigest(
  bytes: Uint8Array,
  trustedSha256: string,
): boolean {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength===0 ||
      bytes.byteLength > 10*1024*1024 ||
      typeof trustedSha256!=="string" ||
      !/^[0-9a-f]{64}$/i.test(trustedSha256)) return false;
  const actual=createHash("sha256").update(bytes).digest();
  const expected=Buffer.from(trustedSha256,"hex");
  return expected.length===actual.length && timingSafeEqual(actual,expected);
}
