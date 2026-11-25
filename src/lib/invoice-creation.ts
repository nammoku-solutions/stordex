import { prisma } from "@/lib/db";

export type MonthlyInvoiceDraftInput = {
  tenantId: string;
  customerId: string;
  businessUnitId: string | null;
  periodYear: number;
  periodMonth: number;
  dueDate: Date | null;
  taxRate: number;
  taxPerOrder: boolean;
  note: string | null;
};

/**
 * The original read-before-write invoice creator could attach the same sales
 * order to two separate invoices when requests overlapped. InvoiceOrder has a
 * composite PK (invoiceId, orderId), not a unique orderId constraint.
 *
 * All invoice draft writers use this tenant-scoped transaction lock, which
 * covers both the unbilled-order query and monthly sequence allocation.
 * No schema migration or change to already-issued invoices is required.
 */
export async function createMonthlyInvoiceDraft(data: MonthlyInvoiceDraftInput) {
  const periodStart = new Date(data.periodYear, data.periodMonth - 1, 1);
  const periodEnd = new Date(data.periodYear, data.periodMonth, 1);
  const prefix = `I-${data.periodYear}${String(data.periodMonth).padStart(2, "0")}-`;

  return prisma.$transaction(async (tx) => {
    // Serialize all invoice creation within a tenant, including different
    // customers in the same month. This is held until the transaction commits.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(
      hashtext(${"stordex:invoice"}),
      hashtext(${data.tenantId})
    )::text AS lock_result`;

    // Read the exclusion list AFTER obtaining the lock. Otherwise, two
    // simultaneous requests can both include the same unbilled sales order.
    const billed = await tx.invoiceOrder.findMany({
      where: { invoice: { tenantId: data.tenantId, customerId: data.customerId } },
      select: { orderId: true },
    });
    const orders = await tx.order.findMany({
      where: {
        tenantId: data.tenantId,
        customerId: data.customerId,
        status: { in: ["CONFIRMED", "SHIPPED", "COMPLETED"] },
        id: { notIn: billed.map((record) => record.orderId) },
        OR: [
          { dueDate: { gte: periodStart, lt: periodEnd } },
          { dueDate: null, orderDate: { gte: periodStart, lt: periodEnd } },
        ],
      },
      select: { id: true, subtotal: true, tax: true, total: true },
    });
    if (orders.length === 0) {
      throw new Error("対象月に集計可能な受注がありません");
    }

    const subtotal = orders.reduce((sum, order) => sum + order.subtotal, 0);
    const tax = data.taxPerOrder
      ? orders.reduce((sum, order) => sum + order.tax, 0)
      : Math.floor((subtotal * data.taxRate) / 100);
    const total = data.taxPerOrder
      ? orders.reduce((sum, order) => sum + order.total, 0)
      : subtotal + tax;

    // The per-tenant advisory lock also protects this read-last numbering.
    const last = await tx.invoice.findFirst({
      where: { tenantId: data.tenantId, invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });
    const sequence = last ? Number(last.invoiceNumber.slice(prefix.length)) + 1 : 1;
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      throw new Error("請求番号を生成できません");
    }

    return tx.invoice.create({
      data: {
        tenantId: data.tenantId,
        invoiceNumber: `${prefix}${String(sequence).padStart(4, "0")}`,
        customerId: data.customerId,
        businessUnitId: data.businessUnitId,
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
        dueDate: data.dueDate,
        status: "DRAFT",
        subtotal,
        taxRate: data.taxRate,
        tax,
        total,
        taxPerOrder: data.taxPerOrder,
        note: data.note,
        orders: { create: orders.map((order) => ({ orderId: order.id })) },
      },
    });
  }, { maxWait: 15000, timeout: 15000 });
}
