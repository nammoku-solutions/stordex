import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const disposable = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?schema=public)?$/
    .test(process.env.DATABASE_URL ?? "");

describe("B2B credit draft service on disposable PostgreSQL only", () => {
  it.runIf(disposable)(
    "requires seller admin, supports exact retries, and never overallocates inspected goods",
    async () => {
      const { prisma } = await import("@/lib/db");
      const { createB2BCreditNoteDraft } = await import("./b2b-credit-note-draft-service");
      const { recordIndependentCreditReviewEvidence } = await import("./b2b-credit-review-evidence-service");
      const tag = randomUUID().slice(0, 10);
      const buyer = await prisma.tenant.create({
        data: { name: "Credit service buyer", slug: "ci-cs-b-" + tag },
      });
      const seller = await prisma.tenant.create({
        data: { name: "Credit service seller", slug: "ci-cs-s-" + tag },
      });
      const buyerAdmin = await prisma.user.create({ data: {
        tenantId: buyer.id, email: "cs-b-" + tag + "@example.test",
        name: "Buyer", role: "OWNER", passwordHash: "ci-only",
      } });
      const sellerAdmin = await prisma.user.create({ data: {
        tenantId: seller.id, email: "cs-s-" + tag + "@example.test",
        name: "Seller", role: "ADMIN", passwordHash: "ci-only",
      } });
      const staff = await prisma.user.create({ data: {
        tenantId: seller.id, email: "cs-staff-" + tag + "@example.test",
        name: "Staff", role: "STAFF", passwordHash: "ci-only",
      } });
      const [tenantAId, tenantBId] = [buyer.id, seller.id].sort();
      const connection = await prisma.tradingConnection.create({ data: {
        tenantAId, tenantBId, requestedByTenantId: buyer.id, status: "ACTIVE",
      } });
      const supplier = await prisma.supplier.create({ data: {
        tenantId: buyer.id, code: "SUP", name: "Seller",
      } });
      const customer = await prisma.customer.create({ data: {
        tenantId: seller.id, code: "BUY", name: "Buyer",
      } });
      const buyerItem = await prisma.item.create({ data: {
        tenantId: buyer.id, code: "RETURN-B", name: "Buyer stock", stock: 5,
      } });
      const sellerItem = await prisma.item.create({ data: {
        tenantId: seller.id, code: "RETURN-S", name: "Seller stock", stock: 5,
      } });
      const po = await prisma.purchaseOrder.create({
        data: {
          tenantId: buyer.id, supplierId: supplier.id,
          poNumber: "PO-CS-" + tag, status: "RECEIVED",
          items: { create: [{
            itemId: buyerItem.id, itemName: "Buyer stock",
            quantity: 5, received: 5, unit: "個",
            unitPrice: 100, amount: 500,
          }] },
        }, include: { items: true },
      });
      const order = await prisma.order.create({
        data: {
          tenantId: seller.id, customerId: customer.id,
          orderNumber: "SO-CS-" + tag, status: "SHIPPED",
          subtotal: 500, taxRate: 10, tax: 50, total: 550,
          items: { create: [{
            itemId: sellerItem.id, itemName: "Seller stock",
            quantity: 5, unit: "個", unitPrice: 100, amount: 500,
          }] },
        }, include: { items: true },
      });
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: seller.id, customerId: customer.id,
          invoiceNumber: "INV-CS-" + tag, periodYear: 2026,
          periodMonth: 11, status: "ISSUED", subtotal: 500,
          taxRate: 10, tax: 50, total: 550, taxPerOrder: true,
          orders: { create: [{ orderId: order.id }] },
        },
      });
      const company = await prisma.intercompanyOrder.create({
        data: {
          connectionId: connection.id,
          buyerTenantId: buyer.id, sellerTenantId: seller.id,
          purchaseOrderId: po.id, sellerOrderId: order.id,
          poNumber: po.poNumber, orderDate: new Date(), status: "ACCEPTED",
          subtotal: 500, taxRate: 10, tax: 50, total: 550,
          items: { create: [{
            sourcePurchaseOrderItemId: po.items[0].id,
            sellerOrderItemId: order.items[0].id,
            buyerItemCode: buyerItem.code, itemName: "Buyer stock",
            quantity: 5, unit: "個", unitPrice: 100, amount: 500,
          }] },
        }, include: { items: true },
      });
      const request = await prisma.b2BReturnRequest.create({ data: {
        buyerTenantId: buyer.id, sellerTenantId: seller.id,
        intercompanyOrderId: company.id,
        requestNumber: "RETURN-CS-" + tag,
        requestedByUserId: buyerAdmin.id, status: "APPROVED",
      } });
      const line = await prisma.b2BReturnItem.create({ data: {
        returnRequestId: request.id, intercompanyOrderId: company.id,
        sourceLineId: company.items[0].id, reason: "DAMAGED",
        requestedQuantity: 2, approvedQuantity: 2,
      } });
      const outbound = await prisma.inventoryMovement.create({ data: {
        tenantId: buyer.id, itemId: buyerItem.id,
        type: "OUTBOUND", quantity: 2, balance: 3,
        createdBy: buyerAdmin.id,
      } });
      await prisma.b2BReturnStockEvent.create({ data: {
        returnItemId: line.id, tenantId: buyer.id,
        phase: "DISPATCH", eventId: randomUUID(),
        payloadHash: "a".repeat(64), quantity: 2,
        movementId: outbound.id, createdByUserId: buyerAdmin.id,
      } });
      const inbound = await prisma.inventoryMovement.create({ data: {
        tenantId: seller.id, itemId: sellerItem.id,
        type: "INBOUND", quantity: 2, balance: 7,
        createdBy: sellerAdmin.id,
      } });
      await prisma.b2BReturnStockEvent.create({ data: {
        returnItemId: line.id, tenantId: seller.id,
        phase: "INSPECTION", eventId: randomUUID(),
        payloadHash: "b".repeat(64), quantity: 2,
        saleable: 2, unsaleable: 0,
        movementId: inbound.id, createdByUserId: sellerAdmin.id,
      } });
      const data = {
        sellerTenantId: seller.id, userId: sellerAdmin.id,
        originalInvoiceId: invoice.id, returnRequestId: request.id,
        currencyCode: "JPY", idempotencyKey: randomUUID(),
        lines: [{ returnItemId: line.id, creditedQuantity: 1 }],
      };
      await expect(createB2BCreditNoteDraft({
        ...data, userId: staff.id,
      })).rejects.toThrow("管理者権限");
      await expect(createB2BCreditNoteDraft({
        ...data, sellerTenantId: buyer.id,
      })).rejects.toThrow();

      const first = await createB2BCreditNoteDraft(data);
      expect(first.created).toBe(true);
      expect(await createB2BCreditNoteDraft(data)).toEqual({
        creditNoteId: first.creditNoteId, created: false,
      });
      await expect(createB2BCreditNoteDraft({
        ...data, lines: [{ returnItemId: line.id, creditedQuantity: 2 }],
      })).rejects.toThrow("異なるクレジットノート");
      const recorded = await prisma.b2BCreditNote.findUniqueOrThrow({
        where: { id: first.creditNoteId }, include: { lines: true },
      });
      expect(recorded.status).toBe("DRAFT");
      expect(recorded.proposedSubtotal).toBeNull();
      expect(recorded.proposedTotal).toBeNull();
      expect(recorded.lines).toHaveLength(1);
      expect(recorded.lines[0].creditedQuantity).toBe(1);

      // Independent REVIEW EVIDENCE only. The note stays DRAFT and this
      // audit never issues a CreditNote or settles money.
      const reviewer = await prisma.user.create({ data: {
        tenantId: seller.id, email: "cs-independent-" + tag + "@example.test",
        name: "Independent reviewer", role: "OWNER", passwordHash: "ci-only",
      } });
      const reviewEventId = randomUUID();
      const reviewData = {
        creditNoteId: first.creditNoteId,
        sellerTenantId: seller.id,
        eventId: reviewEventId,
        action: "CHECKS_RECORDED" as const,
        reviewerUserId: reviewer.id,
        reviewNote: "Invoice and physical source checked; not issued",
        sourceSnapshotHash: "f".repeat(64),
      };
      const audit = await prisma.b2BCreditReviewAudit.create({
        data: reviewData,
      });
      expect(audit.action).toBe("CHECKS_RECORDED");
      await expect(prisma.b2BCreditReviewAudit.create({
        data: { ...reviewData, reviewerUserId: sellerAdmin.id,
          eventId: randomUUID() },
      })).rejects.toThrow("Independent active seller administrator");
      await expect(prisma.b2BCreditReviewAudit.create({
        data: { ...reviewData, reviewerUserId: staff.id,
          eventId: randomUUID() },
      })).rejects.toThrow("Independent active seller administrator");
      await expect(prisma.b2BCreditReviewAudit.create({
        data: { ...reviewData, reviewerUserId: buyerAdmin.id,
          eventId: randomUUID() },
      })).rejects.toThrow("Independent active seller administrator");
      await expect(prisma.b2BCreditReviewAudit.create({
        data: { ...reviewData, sellerTenantId: buyer.id,
          eventId: randomUUID() },
      })).rejects.toThrow("seller DRAFT");
      await expect(prisma.b2BCreditReviewAudit.create({
        data: { ...reviewData },
      })).rejects.toThrow();
      await expect(prisma.b2BCreditReviewAudit.create({
        data: { ...reviewData, eventId: randomUUID(),
          sourceSnapshotHash: "unverified" },
      })).rejects.toThrow();
      await expect(prisma.b2BCreditReviewAudit.update({
        where: { id: audit.id }, data: { reviewNote: "overwrite" },
      })).rejects.toThrow("append-only");
      await expect(prisma.b2BCreditReviewAudit.delete({
        where: { id: audit.id },
      })).rejects.toThrow("append-only");
      expect((await prisma.b2BCreditNote.findUniqueOrThrow({
        where: { id: first.creditNoteId },
      })).status).toBe("DRAFT");

      const serviceReview = {
        sellerTenantId:seller.id,
        creditNoteId:first.creditNoteId,
        reviewerUserId:reviewer.id,
        eventId:randomUUID(),
        action:"NEEDS_REVISION" as const,
        reviewNote:"税額配賦と元の入金証憑が未記載です",
      };
      const reviewResult = await recordIndependentCreditReviewEvidence(serviceReview);
      expect(reviewResult).toMatchObject({
        created:true,action:"NEEDS_REVISION",
        status:"REVIEW_EVIDENCE_RECORDED_NOT_APPROVED",
      });
      expect(await recordIndependentCreditReviewEvidence(serviceReview)).toEqual({
        auditEventId:reviewResult.auditEventId,
        created:false,action:"NEEDS_REVISION",
        status:"REVIEW_EVIDENCE_RECORDED_NOT_APPROVED",
      });
      await expect(recordIndependentCreditReviewEvidence({
        ...serviceReview,reviewNote:"再利用で説明書きを変更する",
      })).rejects.toThrow("異なるレビュー内容");
      await expect(recordIndependentCreditReviewEvidence({
        ...serviceReview,reviewerUserId:sellerAdmin.id,
        eventId:randomUUID(),
      })).rejects.toThrow("作成者本人");
      await expect(recordIndependentCreditReviewEvidence({
        ...serviceReview,reviewerUserId:staff.id,eventId:randomUUID(),
      })).rejects.toThrow("有効な管理者");
      await expect(recordIndependentCreditReviewEvidence({
        ...serviceReview,sellerTenantId:buyer.id,eventId:randomUUID(),
      })).rejects.toThrow();
      await expect(recordIndependentCreditReviewEvidence({
        ...serviceReview,action:"CHECKS_RECORDED",eventId:randomUUID(),
      })).rejects.toThrow("未入力");

      // Only proposed monetary fields are editable; source invoice, status,
      // reviewer and refund history remain unchanged. Basic checks recorded
      // are NOT approval/issuance or a guarantee of tax-law compliance.
      await prisma.b2BCreditNoteLine.update({
        where:{id:recorded.lines[0].id},
        data:{proposedSubtotal:100,proposedTax:10,proposedTotal:110},
      });
      await prisma.b2BCreditNote.update({
        where:{id:first.creditNoteId},
        data:{
          proposedSubtotal:100,proposedTax:10,proposedTotal:110,
          taxAllocationExplanation:"元請求書の税計算単位と暫定端数配賦を記録",
        },
      });
      const recordedChecks=await recordIndependentCreditReviewEvidence({
        ...serviceReview,action:"CHECKS_RECORDED",eventId:randomUUID(),
        reviewNote:"下書き額と元伝票・現品検品数の機械的整合を確認",
      });
      expect(recordedChecks.action).toBe("CHECKS_RECORDED");
      const sourceReview=await prisma.b2BCreditReviewAudit.findUniqueOrThrow({
        where:{id:recordedChecks.auditEventId},
      });
      expect(sourceReview.sourceSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
      expect(sourceReview.sourceSnapshotHash).not.toBe(
        (await prisma.b2BCreditReviewAudit.findUniqueOrThrow({
          where:{id:reviewResult.auditEventId},
        })).sourceSnapshotHash,
      );
      expect((await prisma.b2BCreditNote.findUniqueOrThrow({
        where:{id:first.creditNoteId},
      })).status).toBe("DRAFT");
      expect((await prisma.invoice.findUniqueOrThrow({
        where:{id:invoice.id},
      })).total).toBe(550);

      // Two independent clients race for the remaining ONE inspected unit.
      const [raceA, raceB] = await Promise.allSettled([
        createB2BCreditNoteDraft({ ...data, idempotencyKey: randomUUID() }),
        createB2BCreditNoteDraft({ ...data, idempotencyKey: randomUUID() }),
      ]);
      expect([raceA, raceB].filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect([raceA, raceB].filter(r => r.status === "rejected")).toHaveLength(1);
      const committed = await prisma.b2BCreditNoteLine.aggregate({
        where: { returnItemId: line.id }, _sum: { creditedQuantity: true },
      });
      expect(committed._sum.creditedQuantity).toBe(2);
      expect(await prisma.b2BCreditNote.count({
        where: { sellerTenantId: seller.id },
      })).toBe(2);
      expect((await prisma.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
      })).total).toBe(550);
      expect(await prisma.inventoryMovement.count({
        where: { tenantId: seller.id },
      })).toBe(1);
    }, 60000,
  );
});
