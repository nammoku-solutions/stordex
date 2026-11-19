/** Shared seller-scoped, canonical invoice snapshot for intake, review and ledger recording. */
import type { Prisma } from "@/generated/prisma/client";
import { computeOriginalInvoiceFinancialFingerprint } from "./b2b-credit-source-integrity";

export const MAX_ORDERS = 200;
export const MAX_LINES_PER_ORDER = 500;

export type TrustedSource = Readonly<{
  actor: { id: string; tenantId: string; role: "OWNER" | "ADMIN" };
  invoice: { id: string; tenantId: string; status: "ISSUED" | "PAID"; invoiceNumber: string };
  snapshotSha256: string;
}>;

export async function loadTrustedOriginalInvoiceSource(
  tx: Prisma.TransactionClient,
  user: { id: string; tenantId: string },
  invoiceId: string,
) {
  // Do not trust a cached JWT role. Re-read current seller membership,
  // role and tenant status in the same snapshot as the invoice source.
  const actor = await tx.user.findFirst({
    where: { id: user.id, tenantId: user.tenantId, role: { in: ["OWNER", "ADMIN"] }, tenant: { status: "ACTIVE" } },
    select: { id: true, tenantId: true, role: true },
  });
  if (!actor || actor.id !== user.id || actor.tenantId !== user.tenantId ||
      (actor.role !== "OWNER" && actor.role !== "ADMIN")) {
    return { accepted: false, reason: "SOURCE_UNAVAILABLE" } as const;
  }

  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, tenantId: actor.tenantId, status: { in: ["ISSUED", "PAID"] } },
    select: {
      id: true, tenantId: true, status: true, invoiceNumber: true, issueDate: true,
      periodYear: true, periodMonth: true, subtotal: true, tax: true, total: true,
      taxRate: true, taxPerOrder: true,
      orders: {
        take: MAX_ORDERS + 1,
        select: { order: { select: {
          id: true, tenantId: true, subtotal: true, tax: true, total: true, taxRate: true,
          items: {
            take: MAX_LINES_PER_ORDER + 1,
            select: {
              id: true, itemId: true, quantity: true, unitPrice: true, amount: true,
              item: { select: { tenantId: true } },
            },
          },
        } } },
      },
    },
  });
  // Same refusal for a missing, out-of-scope, or non-issued invoice.
  if (!invoice || invoice.id !== invoiceId || invoice.tenantId !== actor.tenantId ||
      (invoice.status !== "ISSUED" && invoice.status !== "PAID")) {
    return { accepted: false, reason: "SOURCE_UNAVAILABLE" } as const;
  }
  if (invoice.orders.length > MAX_ORDERS || invoice.orders.some(({ order }) =>
    order.tenantId !== actor.tenantId || order.items.length > MAX_LINES_PER_ORDER ||
    order.items.some(line => line.item.tenantId !== actor.tenantId))) {
    return { accepted: false, reason: "SOURCE_INTEGRITY_FAILED" } as const;
  }

  const source = computeOriginalInvoiceFinancialFingerprint({
    invoiceId: invoice.id, sellerTenantId: invoice.tenantId,
    invoiceNumber: invoice.invoiceNumber, issueDate: invoice.issueDate.toISOString(),
    periodYear: invoice.periodYear, periodMonth: invoice.periodMonth,
    subtotal: invoice.subtotal, tax: invoice.tax, total: invoice.total,
    taxRate: invoice.taxRate, taxPerOrder: invoice.taxPerOrder,
    orders: invoice.orders.map(({ order }) => ({
      orderId: order.id, sellerTenantId: order.tenantId, subtotal: order.subtotal,
      tax: order.tax, total: order.total, taxRate: order.taxRate,
      lines: order.items.map(line => ({
        lineId: line.id, itemId: line.itemId, quantity: line.quantity,
        unitPrice: line.unitPrice, amount: line.amount,
      })),
    })),
  });
  if (!source.ready) return { accepted: false, reason: "SOURCE_INTEGRITY_FAILED" } as const;
  const trusted: TrustedSource = {
    actor: { ...actor, role: actor.role },
    invoice: { id: invoice.id, tenantId: invoice.tenantId, status: invoice.status, invoiceNumber: invoice.invoiceNumber },
    snapshotSha256: source.snapshotSha256,
  };
  return { accepted: true, source: trusted } as const;
}
