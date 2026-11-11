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
      const { voidB2BCreditNoteDraft } = await import("./b2b-credit-note-void-service");
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
      // Physically inspected is not enough: formal INSPECTED signoff is mandatory.
      const premature = {
        sellerTenantId: seller.id, userId: sellerAdmin.id,
        originalInvoiceId: invoice.id, returnRequestId: request.id,
        currencyCode: "JPY", idempotencyKey: randomUUID(),
        lines: [{ returnItemId: line.id, creditedQuantity: 1 }],
      };
      await expect(createB2BCreditNoteDraft(premature))
        .rejects.toThrow("請求金額調整の前に");
      expect(await prisma.b2BCreditNote.count({ where: { sellerTenantId: seller.id } })).toBe(0);
      // The formal inspection workflow must finish before a draft can be prepared.
      await prisma.b2BReturnRequest.update({
        where: { id: request.id }, data: { status: "INSPECTED" },
      });
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
        ...data, currencyCode: "USD", idempotencyKey: randomUUID(),
      })).rejects.toThrow("通貨");
      await expect(createB2BCreditNoteDraft({
        ...data, originalInvoiceId: "nonexistent-invoice", idempotencyKey: randomUUID(),
      })).rejects.toThrow("元請求書");
      await expect(createB2BCreditNoteDraft({
        ...data, idempotencyKey: "not-a-uuid",
      })).rejects.toThrow("再送キー");
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
      // Audited VOID must preserve the original credit header and allocation
      // line but exclude its quantity from any future active allocation.
      const eventId=randomUUID();
      const voidRequest={
        sellerTenantId:seller.id,userId:sellerAdmin.id,
        creditNoteId:first.creditNoteId,eventId,
        reason:"検品時に別の請求調整方法が必要と判明したため取消",
      };
      await expect(voidB2BCreditNoteDraft({...voidRequest,userId:staff.id}))
        .rejects.toThrow("管理者権限");
      await expect(voidB2BCreditNoteDraft({...voidRequest,sellerTenantId:buyer.id,userId:buyerAdmin.id}))
        .rejects.toThrow();
      await expect(voidB2BCreditNoteDraft({...voidRequest,eventId:"not-a-uuid"}))
        .rejects.toThrow("イベントID");
      const voided=await voidB2BCreditNoteDraft(voidRequest);
      expect(voided).toEqual({creditNoteId:first.creditNoteId,voided:true});
      expect(await voidB2BCreditNoteDraft(voidRequest)).toEqual({
        creditNoteId:first.creditNoteId,voided:false,
      });
      await expect(voidB2BCreditNoteDraft({...voidRequest,eventId:randomUUID()}))
        .rejects.toThrow("取消済み");
      await expect(voidB2BCreditNoteDraft({...voidRequest,reason:"別の理由による再取消は不可です"}))
        .rejects.toThrow("取消済み");
      await expect(createB2BCreditNoteDraft(data))
        .rejects.toThrow("取消済みの下書き");

      const archived=await prisma.b2BCreditNote.findUniqueOrThrow({
        where:{id:first.creditNoteId},include:{voidEvent:true,lines:true},
      });
      expect(archived.status).toBe("VOID");
      expect(archived.voidEvent?.eventId).toBe(eventId.toLowerCase());
      expect(archived.voidEvent?.actorUserId).toBe(sellerAdmin.id);
      expect(archived.voidEvent?.reason).toBe(voidRequest.reason);
      expect(archived.voidedAt).not.toBeNull();
      expect(archived.lines).toHaveLength(1);
      expect(archived.lines[0].creditedQuantity).toBe(1);

      await expect(prisma.b2BCreditVoidEvent.delete({
        where:{creditNoteId:first.creditNoteId},
      })).rejects.toThrow();
      await expect(prisma.b2BCreditVoidEvent.update({
        where:{creditNoteId:first.creditNoteId},data:{reason:"履歴を消す"},
      })).rejects.toThrow();
      await expect(prisma.b2BCreditNoteLine.delete({
        where:{id:archived.lines[0].id},
      })).rejects.toThrow();
      await expect(prisma.b2BCreditNote.update({
        where:{id:first.creditNoteId},data:{status:"DRAFT"},
      })).rejects.toThrow();
      await expect(prisma.b2BCreditNote.update({
        where:{id:first.creditNoteId},data:{status:"ISSUED"},
      })).rejects.toThrow();

      // Released one unit is available to a DIFFERENT new draft; only
      // active DRAFT lines count toward the inspected-unit cap.
      const replacement=await createB2BCreditNoteDraft({
        ...data,idempotencyKey:randomUUID(),
        lines:[{returnItemId:line.id,creditedQuantity:1}],
      });
      expect(replacement.created).toBe(true);
      const active=await prisma.b2BCreditNoteLine.aggregate({
        where:{
          returnItemId:line.id,
          creditNote:{status:{not:"VOID"}},
        },
        _sum:{creditedQuantity:true},
      });
      expect(active._sum.creditedQuantity).toBe(2);
      const all=await prisma.b2BCreditNoteLine.aggregate({
        where:{returnItemId:line.id},_sum:{creditedQuantity:true},
      });
      expect(all._sum.creditedQuantity).toBe(3); // 1 VOID + 2 active
      await expect(createB2BCreditNoteDraft({
        ...data,idempotencyKey:randomUUID(),
        lines:[{returnItemId:line.id,creditedQuantity:1}],
      })).rejects.toThrow("実検品済みの未調整数量");

      expect(await prisma.b2BCreditVoidEvent.count({
        where:{creditNoteId:first.creditNoteId},
      })).toBe(1);
      expect((await prisma.invoice.findUniqueOrThrow({where:{id:invoice.id}})).total).toBe(550);
      expect(await prisma.inventoryMovement.count({where:{tenantId:seller.id}})).toBe(1);
    }, 60000,
  );
});
