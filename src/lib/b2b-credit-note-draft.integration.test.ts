import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const disposable = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?schema=public)?$/
    .test(process.env.DATABASE_URL ?? "");

describe("B2B credit note drafts: invoice/return/tenant integrity (disposable PostgreSQL)", () => {
  it.runIf(disposable)(
    "permits only accurate draft allocations against physically inspected returns",
    async () => {
      const { prisma } = await import("@/lib/db");
      const token = randomUUID().slice(0, 10);
      const buyer = await prisma.tenant.create({
        data: { name: "Credit buyer", slug: "ci-credit-b-" + token },
      });
      const seller = await prisma.tenant.create({
        data: { name: "Credit seller", slug: "ci-credit-s-" + token },
      });
      // Everything is created on the isolated CI PostgreSQL database and
      // intentionally left for database teardown because credit events and
      // draft provenance are immutable.
      const buyerUser = await prisma.user.create({ data: {
        tenantId: buyer.id, email: "credit-b-" + token + "@example.test",
        name: "Buyer", role: "OWNER", passwordHash: "ci-only",
      } });
      const sellerAdmin = await prisma.user.create({ data: {
        tenantId: seller.id, email: "credit-s-" + token + "@example.test",
        name: "Seller", role: "ADMIN", passwordHash: "ci-only",
      } });
      const sellerStaff = await prisma.user.create({ data: {
        tenantId: seller.id, email: "credit-staff-" + token + "@example.test",
        name: "Staff", role: "STAFF", passwordHash: "ci-only",
      } });
      const [tenantAId, tenantBId] = [buyer.id, seller.id].sort();
      const connection = await prisma.tradingConnection.create({ data: {
        tenantAId, tenantBId, requestedByTenantId: buyer.id, status: "ACTIVE",
      } });
      const supplier = await prisma.supplier.create({ data: {
        tenantId: buyer.id, code: "supplier", name: "Seller",
      } });
      const customer = await prisma.customer.create({ data: {
        tenantId: seller.id, code: "customer", name: "Buyer",
      } });
      const buyerItem = await prisma.item.create({ data: {
        tenantId: buyer.id, code: "CREDIT-B", name: "Buyer stock", stock: 5,
      } });
      const sellerItem = await prisma.item.create({ data: {
        tenantId: seller.id, code: "CREDIT-S", name: "Seller stock", stock: 3,
      } });
      const po = await prisma.purchaseOrder.create({
        data: {
          tenantId: buyer.id, supplierId: supplier.id,
          poNumber: "CREDIT-PO-" + token, status: "RECEIVED",
          items: { create: [{
            itemId: buyerItem.id, itemName: buyerItem.name,
            unit: "個", quantity: 5, received: 5, unitPrice: 100,
            amount: 500,
          }] },
        }, include: { items: true },
      });
      const so = await prisma.order.create({
        data: {
          tenantId: seller.id, customerId: customer.id,
          orderNumber: "CREDIT-SO-" + token, status: "SHIPPED",
          subtotal: 500, taxRate: 10, tax: 50, total: 550,
          items: { create: [{
            itemId: sellerItem.id, itemName: sellerItem.name,
            unit: "個", quantity: 5, unitPrice: 100, amount: 500,
          }] },
        }, include: { items: true },
      });
      const original = await prisma.invoice.create({
        data: {
          tenantId: seller.id, customerId: customer.id,
          invoiceNumber: "CREDIT-I-" + token,
          periodYear: 2026, periodMonth: 11,
          status: "ISSUED", subtotal: 500, taxRate: 10, tax: 50,
          total: 550, taxPerOrder: true,
          orders: { create: [{ orderId: so.id }] },
        },
      });
      const company = await prisma.intercompanyOrder.create({
        data: {
          connectionId: connection.id, buyerTenantId: buyer.id,
          sellerTenantId: seller.id, purchaseOrderId: po.id,
          sellerOrderId: so.id, poNumber: po.poNumber,
          orderDate: new Date(), status: "ACCEPTED",
          subtotal: 500, taxRate: 10, tax: 50, total: 550,
          items: { create: [{
            sourcePurchaseOrderItemId: po.items[0].id,
            sellerOrderItemId: so.items[0].id,
            buyerItemCode: buyerItem.code, itemName: "Buyer item",
            unit: "個", quantity: 5, unitPrice: 100, amount: 500,
          }] },
        }, include: { items: true },
      });
      const request = await prisma.b2BReturnRequest.create({ data: {
        intercompanyOrderId: company.id, buyerTenantId: buyer.id,
        sellerTenantId: seller.id, requestNumber: "RETURN-" + token,
        status: "APPROVED", requestedByUserId: buyerUser.id,
      } });
      const sourceLine = await prisma.b2BReturnItem.create({ data: {
        returnRequestId: request.id, intercompanyOrderId: company.id,
        sourceLineId: company.items[0].id,
        requestedQuantity: 3, approvedQuantity: 3, reason: "DAMAGED",
      } });

      const buyerMove = await prisma.inventoryMovement.create({ data: {
        tenantId: buyer.id, itemId: buyerItem.id,
        type: "OUTBOUND", quantity: 2, balance: 3,
        createdBy: buyerUser.id,
      } });
      await prisma.b2BReturnStockEvent.create({ data: {
        tenantId: buyer.id, returnItemId: sourceLine.id,
        phase: "DISPATCH", eventId: randomUUID(),
        payloadHash: "a".repeat(64), quantity: 2,
        movementId: buyerMove.id, createdByUserId: buyerUser.id,
      } });
      const sellerMove = await prisma.inventoryMovement.create({ data: {
        tenantId: seller.id, itemId: sellerItem.id,
        type: "INBOUND", quantity: 1, balance: 4,
        createdBy: sellerAdmin.id,
      } });
      await prisma.b2BReturnStockEvent.create({ data: {
        tenantId: seller.id, returnItemId: sourceLine.id,
        phase: "INSPECTION", eventId: randomUUID(),
        payloadHash: "b".repeat(64), quantity: 2,
        saleable: 1, unsaleable: 1,
        movementId: sellerMove.id, createdByUserId: sellerAdmin.id,
      } });
      const header = {
        sellerTenantId: seller.id,
        originalInvoiceId: original.id,
        sellerOrderId: so.id,
        returnRequestId: request.id,
        creditNoteNumber: "CN-" + token,
        currencyCode: "JPY",
        originalInvoiceSubtotal: 500,
        originalInvoiceTax: 50,
        originalInvoiceTotal: 550,
        originalInvoiceTaxRate: 10,
        originalInvoiceTaxPerOrder: true,
        createdByUserId: sellerAdmin.id,
      };
      const draft = await prisma.b2BCreditNote.create({
        data: { ...header },
      });
      const line = await prisma.b2BCreditNoteLine.create({
        data: {
          creditNoteId: draft.id,
          returnRequestId: request.id,
          returnItemId: sourceLine.id,
          creditedQuantity: 2,
        },
      });
      expect(draft.status).toBe("DRAFT");
      expect(draft.proposedTotal).toBeNull();
      expect(line.creditedQuantity).toBe(2);
      expect(line.proposedTotal).toBeNull();

      await expect(prisma.b2BCreditNote.create({
        data: { ...header, sellerTenantId: buyer.id,
          creditNoteNumber: "CROSS-" + token },
      })).rejects.toThrow();

      await expect(prisma.b2BCreditNote.create({
        data: { ...header, originalInvoiceTax: 51,
          creditNoteNumber: "WRONG-TAX-" + token },
      })).rejects.toThrow("snapshot");

      await expect(prisma.b2BCreditNote.create({
        data: { ...header, createdByUserId: sellerStaff.id,
          creditNoteNumber: "STAFF-" + token },
      })).rejects.toThrow("administrator");

      await expect(prisma.b2BCreditNote.create({
        data: { ...header, status: "ISSUED",
          creditNoteNumber: "FORGED-ISSUE-" + token },
      })).rejects.toThrow();

      await expect(prisma.b2BCreditNote.update({
        where: { id: draft.id }, data: { status: "ISSUED" },
      })).rejects.toThrow();

      await expect(prisma.b2BCreditNote.update({
        where: { id: draft.id }, data: {
          originalInvoiceTotal: 549,
        },
      })).rejects.toThrow();

      await expect(prisma.b2BCreditNoteLine.update({
        where: { id: line.id }, data: { creditedQuantity: 1 },
      })).rejects.toThrow("immutable");

      await expect(prisma.b2BCreditNoteLine.delete({
        where: { id: line.id },
      })).rejects.toThrow();

      await expect(prisma.b2BCreditNoteLine.create({ data: {
        creditNoteId: draft.id, returnRequestId: request.id,
        returnItemId: sourceLine.id, creditedQuantity: 1,
      } })).rejects.toThrow();

      const secondDraft = await prisma.b2BCreditNote.create({
        data: { ...header, creditNoteNumber: "CN-SECOND-" + token },
      });
      await expect(prisma.b2BCreditNoteLine.create({ data: {
        creditNoteId: secondDraft.id, returnRequestId: request.id,
        returnItemId: sourceLine.id, creditedQuantity: 1,
      } })).rejects.toThrow("inspected");

      // On the draft-only code path there is no posting, refund or change
      // to the original financial document.
      const unchanged = await prisma.invoice.findUniqueOrThrow({
        where: { id: original.id },
      });
      expect(unchanged).toMatchObject({
        status: "ISSUED", subtotal: 500, tax: 50, total: 550,
      });
      expect(await prisma.b2BCreditNoteLine.count({
        where: { returnItemId: sourceLine.id },
      })).toBe(1);
    }, 60000,
  );
});
