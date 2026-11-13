/**
 * Server-side, read-only source preparation for future invoice PDF custody.
 * Do not expose this as an action or endpoint. A candidate is not evidence,
 * storage authorization, currency verification, or permission to post money.
 */
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { prepareOriginalInvoiceForPrivateStorage } from "./b2b-credit-original-document-policy";
import { computeOriginalInvoiceFinancialFingerprint } from "./b2b-credit-source-integrity";

const ID = /^[A-Za-z0-9_-]{3,128}$/;
const isId = (value: unknown): value is string => typeof value === "string" && ID.test(value);
const MAX_ORDERS = 200;
const MAX_LINES_PER_ORDER = 500;

export async function prepareAuthenticatedOriginalInvoiceDocument(input: Readonly<{
  invoiceId: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}>) {
  const { user } = await requireSession();
  if (!isId(user.id) || !isId(user.tenantId) || !isId(input.invoiceId)) {
    return { accepted: false, reason: "SOURCE_UNAVAILABLE" } as const;
  }

  return prisma.$transaction(async tx => {
    // Do not trust a cached JWT role. Re-read current seller membership,
    // role and tenant status in the same snapshot as the invoice source.
    const actor = await tx.user.findFirst({
      where: { id: user.id, tenantId: user.tenantId, role: { in: ["OWNER", "ADMIN"] }, tenant: { status: "ACTIVE" } },
      select: { id: true, tenantId: true, role: true },
    });
    if (!actor) return { accepted: false, reason: "SOURCE_UNAVAILABLE" } as const;

    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, tenantId: actor.tenantId, status: { in: ["ISSUED", "PAID"] } },
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
    if (!invoice || invoice.tenantId !== actor.tenantId ||
        (invoice.status !== "ISSUED" && invoice.status !== "PAID")) {
      return { accepted: false, reason: "SOURCE_UNAVAILABLE" } as const;
    }
    if (invoice.orders.length > MAX_ORDERS || invoice.orders.some(({ order }) =>
      order.tenantId !== actor.tenantId || order.items.length > MAX_LINES_PER_ORDER ||
      order.items.some(line => line.item.tenantId !== actor.tenantId))) {
      return { accepted: false, reason: "SOURCE_INTEGRITY_FAILED" } as const;
    }

    const document = prepareOriginalInvoiceForPrivateStorage({
      filename: input.filename,
      mimeType: input.mimeType,
      bytes: input.bytes,
      context: {
        authenticatedUserId: actor.id,
        authenticatedTenantId: actor.tenantId,
        authenticatedRole: actor.role,
        tenantActive: true,
        trustedInvoiceId: invoice.id,
        trustedInvoiceSellerTenantId: invoice.tenantId,
        trustedInvoiceStatus: invoice.status,
      },
    });
    if (!document.accepted) return document;

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
    return { ...document, sourceSnapshotSha256: source.snapshotSha256 } as const;
  }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
}
