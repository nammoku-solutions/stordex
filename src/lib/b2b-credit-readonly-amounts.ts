/**
 * Read-only JPY CreditNote arithmetic. NEVER writes proposed amounts, invoice
 * status, inventory, refund, payment, or tax journal. No Server Action caller.
 *
 * It recalculates the original invoice/affected order AFTER hypothetical
 * returns and uses the tax DIFFERENCE. This avoids accumulating per-line
 * floor/rounding losses on partial returns.
 *
 * Callers must supply full seller-scoped original snapshots, all invoice
 * orders and their lines, independently verified inspection/allocations,
 * and explicit JPY provenance. This pure function does NOT authorize money.
 */
const MAX_YEN = 2_147_483_647;
const MAX_LINES = 500;
const MAX_ORDERS = 500;

export type CreditPreviewBlocker =
  | "JPY_PROVENANCE_UNCONFIRMED"
  | "INVOICE_NOT_ISSUED"
  | "ALREADY_ACTIVE_CREDIT_NOTE"
  | "INVALID_SOURCE"
  | "INVOICE_ORDERS_INCOMPLETE"
  | "ORIGINAL_TOTALS_MISMATCH"
  | "CREDIT_LINE_NOT_IN_INVOICE"
  | "INVALID_INSPECTED_QUANTITY"
  | "CREDIT_EXCEEDS_ORIGINAL";

export type CreditSourceOrderLine = Readonly<{
  id: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}>;

export type CreditSourceOrder = Readonly<{
  id: string;
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
  lines: readonly CreditSourceOrderLine[];
}>;

export type CreditSourceInvoice = Readonly<{
  id: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
  taxPerOrder: boolean;
  /** All Order IDs from InvoiceOrder, not just the returned seller order. */
  orderIds: readonly string[];
}>;

export type CreditInspectedAllocation = Readonly<{
  orderId: string;
  orderLineId: string;
  creditedQuantity: number;
  approvedQuantity: number;
  inspectedQuantity: number;
  otherActiveAllocatedQuantity: number;
}>;

export type CreditPreviewInput = Readonly<{
  invoice: CreditSourceInvoice;
  orders: readonly CreditSourceOrder[];
  allocations: readonly CreditInspectedAllocation[];
  /** Invoice currently lacks a currency field. Must be explicitly confirmed. */
  sellerConfirmedOriginalInvoiceJPY: boolean;
  /** Exclude VOID historical records; include all other Drafts/Credits. */
  otherActiveCreditNoteCount: number;
}>;

export type CreditPreviewResult =
  | Readonly<{ ready: false; blocker: CreditPreviewBlocker }>
  | Readonly<{
      ready: true;
      currencyCode: "JPY";
      taxMode: "INVOICE_DIFFERENCE" | "PER_ORDER_DIFFERENCE";
      creditedSubtotal: number;
      creditedTax: number;
      creditedTotal: number;
      remainingInvoiceSubtotal: number;
      remainingInvoiceTax: number;
      remainingInvoiceTotal: number;
      sourceInvoiceTotal: number;
      /** Order-level tax is undefined for invoice-wide tax calculation. */
      orderProposals: readonly Readonly<{
        orderId: string;
        creditedSubtotal: number;
        creditedTax: number | null;
      }>[];
      financialPostingAllowed: false;
    }>;

const deny = (blocker: CreditPreviewBlocker): CreditPreviewResult =>
  ({ ready: false, blocker });

const yen = (v: number): boolean =>
  Number.isSafeInteger(v) && v >= 0 && v <= MAX_YEN;

const positive = (v: number): boolean =>
  yen(v) && v > 0;

const taxRateValid = (v: number): boolean =>
  Number.isSafeInteger(v) && v >= 0 && v <= 100;

const originalTax = (subtotal: number, taxRate: number): number =>
  Math.floor((subtotal * taxRate) / 100);

function checkedSum(values: readonly number[]): number | null {
  let sum = 0;
  for (const value of values) {
    if (!yen(value)) return null;
    sum += value;
    if (!yen(sum)) return null;
  }
  return sum;
}

/**
 * Preview only, without any persistence or financial side effects.
 * A blocked preview is NOT a valid zero-yen credit.
 */
export function previewB2BCreditAmounts(input: CreditPreviewInput): CreditPreviewResult {
  if (!input.sellerConfirmedOriginalInvoiceJPY) {
    return deny("JPY_PROVENANCE_UNCONFIRMED");
  }
  const invoice = input.invoice;
  if (invoice.status !== "ISSUED" && invoice.status !== "PAID") {
    return deny("INVOICE_NOT_ISSUED");
  }
  if (!Number.isSafeInteger(input.otherActiveCreditNoteCount) ||
      input.otherActiveCreditNoteCount < 0) {
    return deny("INVALID_SOURCE");
  }
  if (input.otherActiveCreditNoteCount > 0) {
    return deny("ALREADY_ACTIVE_CREDIT_NOTE");
  }
  if (!invoice.id || !taxRateValid(invoice.taxRate) ||
      !yen(invoice.subtotal) || !yen(invoice.tax) || !yen(invoice.total) ||
      typeof invoice.taxPerOrder !== "boolean" ||
      invoice.orderIds.length === 0 || invoice.orderIds.length > MAX_ORDERS ||
      input.orders.length === 0 || input.orders.length > MAX_ORDERS ||
      input.allocations.length === 0 || input.allocations.length > MAX_LINES) {
    return deny("INVALID_SOURCE");
  }
  if (invoice.total !== invoice.subtotal + invoice.tax) {
    return deny("ORIGINAL_TOTALS_MISMATCH");
  }
  const expectedOrders = new Set(invoice.orderIds);
  if (expectedOrders.size !== invoice.orderIds.length ||
      input.orders.length !== expectedOrders.size) {
    return deny("INVOICE_ORDERS_INCOMPLETE");
  }

  const orderLookup = new Map<string, CreditSourceOrder>();
  const lineLookup = new Map<string, CreditSourceOrderLine>();
  const allAmounts: number[] = [];
  const orderTaxes: number[] = [];
  for (const order of input.orders) {
    if (!order.id || !expectedOrders.has(order.id) || orderLookup.has(order.id) ||
        !taxRateValid(order.taxRate) ||
        !yen(order.subtotal) || !yen(order.tax) || !yen(order.total) ||
        order.total !== order.subtotal + order.tax ||
        order.tax !== originalTax(order.subtotal, order.taxRate) ||
        order.lines.length === 0 || order.lines.length > MAX_LINES) {
      return deny("ORIGINAL_TOTALS_MISMATCH");
    }
    orderLookup.set(order.id, order);
    const lineAmounts: number[] = [];
    for (const line of order.lines) {
      const key = order.id + ":" + line.id;
      if (!line.id || lineLookup.has(key) || !positive(line.quantity) ||
          !yen(line.unitPrice) || !yen(line.amount) ||
          line.quantity * line.unitPrice !== line.amount) {
        return deny("ORIGINAL_TOTALS_MISMATCH");
      }
      lineLookup.set(key, line);
      lineAmounts.push(line.amount);
    }
    if (checkedSum(lineAmounts) !== order.subtotal) {
      return deny("ORIGINAL_TOTALS_MISMATCH");
    }
    allAmounts.push(order.subtotal);
    orderTaxes.push(order.tax);
  }
  if (checkedSum(allAmounts) !== invoice.subtotal ||
      (invoice.taxPerOrder
        ? checkedSum(orderTaxes) !== invoice.tax
        : originalTax(invoice.subtotal, invoice.taxRate) !== invoice.tax)) {
    return deny("ORIGINAL_TOTALS_MISMATCH");
  }

  const creditByOrder = new Map<string, number>();
  const used = new Set<string>();
  for (const row of input.allocations) {
    const key = row.orderId + ":" + row.orderLineId;
    const original = lineLookup.get(key);
    const order = orderLookup.get(row.orderId);
    if (!order || !original || used.has(key)) {
      return deny("CREDIT_LINE_NOT_IN_INVOICE");
    }
    used.add(key);
    if (!positive(row.creditedQuantity) || !positive(row.approvedQuantity) ||
        !positive(row.inspectedQuantity) ||
        !yen(row.otherActiveAllocatedQuantity) ||
        row.approvedQuantity > original.quantity ||
        row.inspectedQuantity > row.approvedQuantity ||
        row.otherActiveAllocatedQuantity > row.inspectedQuantity ||
        row.creditedQuantity >
          row.inspectedQuantity - row.otherActiveAllocatedQuantity) {
      return deny("INVALID_INSPECTED_QUANTITY");
    }
    const lineCredit = row.creditedQuantity * original.unitPrice;
    const sum = (creditByOrder.get(row.orderId) ?? 0) + lineCredit;
    if (!yen(lineCredit) || !yen(sum) || sum > order.subtotal) {
      return deny("CREDIT_EXCEEDS_ORIGINAL");
    }
    creditByOrder.set(row.orderId, sum);
  }
  const creditedSubtotal = checkedSum([...creditByOrder.values()]);
  if (creditedSubtotal === null || creditedSubtotal > invoice.subtotal) {
    return deny("CREDIT_EXCEEDS_ORIGINAL");
  }
  const remainingInvoiceSubtotal = invoice.subtotal - creditedSubtotal;
  let creditedTax: number;
  const orderProposals: {
    orderId: string;
    creditedSubtotal: number;
    creditedTax: number | null;
  }[] = [];

  if (invoice.taxPerOrder) {
    const creditedTaxes: number[] = [];
    for (const order of input.orders) {
      const orderCredit = creditByOrder.get(order.id) ?? 0;
      const newTax = originalTax(order.subtotal - orderCredit, order.taxRate);
      const taxDelta = order.tax - newTax;
      if (!yen(taxDelta)) return deny("ORIGINAL_TOTALS_MISMATCH");
      creditedTaxes.push(taxDelta);
      orderProposals.push({
        orderId: order.id, creditedSubtotal: orderCredit, creditedTax: taxDelta,
      });
    }
    const sumTax = checkedSum(creditedTaxes);
    if (sumTax === null) return deny("CREDIT_EXCEEDS_ORIGINAL");
    creditedTax = sumTax;
  } else {
    creditedTax = invoice.tax -
      originalTax(remainingInvoiceSubtotal, invoice.taxRate);
    for (const order of input.orders) {
      orderProposals.push({
        orderId: order.id,
        creditedSubtotal: creditByOrder.get(order.id) ?? 0,
        creditedTax: null,
      });
    }
  }
  if (!yen(creditedTax) || creditedTax > invoice.tax) {
    return deny("ORIGINAL_TOTALS_MISMATCH");
  }
  const creditedTotal = creditedSubtotal + creditedTax;
  if (!yen(creditedTotal) || creditedTotal > invoice.total) {
    return deny("CREDIT_EXCEEDS_ORIGINAL");
  }
  return {
    ready: true,
    currencyCode: "JPY",
    taxMode: invoice.taxPerOrder
      ? "PER_ORDER_DIFFERENCE" : "INVOICE_DIFFERENCE",
    creditedSubtotal,
    creditedTax,
    creditedTotal,
    remainingInvoiceSubtotal,
    remainingInvoiceTax: invoice.tax - creditedTax,
    remainingInvoiceTotal: invoice.total - creditedTotal,
    sourceInvoiceTotal: invoice.total,
    orderProposals,
    financialPostingAllowed: false,
  };
}
