import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const disposable = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?schema=public)?$/
    .test(process.env.DATABASE_URL ?? "");

describe("draft physical B2B return event schema (disposable PostgreSQL only)", () => {
  it.runIf(disposable)("keeps dispatch, inspection, immutable movements and tenant scope consistent", async () => {
    const { prisma } = await import("@/lib/db");
    const tag = randomUUID().slice(0, 10);
    const buyer = await prisma.tenant.create({
      data: { name: "event buyer", slug: "ci-event-b-" + tag },
    });
    const seller = await prisma.tenant.create({
      data: { name: "event seller", slug: "ci-event-s-" + tag },
    });
    // This entire test database is disposable; the immutable event trigger
    // deliberately disallows manual cleanup and event deletion.
    const [buyerAdmin, sellerAdmin, sellerStaff] = await Promise.all([
      prisma.user.create({ data: {
        tenantId: buyer.id, email: "buyer-" + tag + "@example.test",
        name: "Buyer", role: "OWNER", passwordHash: "ci-only",
      }}),
      prisma.user.create({ data: {
        tenantId: seller.id, email: "seller-" + tag + "@example.test",
        name: "Seller", role: "ADMIN", passwordHash: "ci-only",
      }}),
      prisma.user.create({ data: {
        tenantId: seller.id, email: "seller-staff-" + tag + "@example.test",
        name: "Staff", role: "STAFF", passwordHash: "ci-only",
      }}),
    ]);
    const [tenantAId, tenantBId] = [buyer.id, seller.id].sort();
    const connection = await prisma.tradingConnection.create({
      data: {
        tenantAId, tenantBId, requestedByTenantId: buyer.id, status: "ACTIVE",
      },
    });
    const supplier = await prisma.supplier.create({data: {
      tenantId: buyer.id, code: "event-sup", name: "Seller",
    }});
    const customer = await prisma.customer.create({data: {
      tenantId: seller.id, code: "event-cust", name: "Buyer",
    }});
    const buyerItem = await prisma.item.create({data: {
      tenantId: buyer.id, code: "B-RET", name: "buyer return", stock: 10,
    }});
    const sellerItem = await prisma.item.create({data: {
      tenantId: seller.id, code: "S-RET", name: "seller return", stock: 10,
    }});
    const po = await prisma.purchaseOrder.create({
      data: {
        tenantId: buyer.id, supplierId: supplier.id,
        poNumber: "CI-RET-PO-" + tag, status: "RECEIVED",
        items: {create: [{
          itemId: buyerItem.id, itemName: "Buyer item",
          quantity: 5, received: 5, unit: "個", unitPrice: 100, amount: 500,
        }]},
      },
      include: {items:true},
    });
    const so = await prisma.order.create({
      data: {
        tenantId: seller.id, customerId: customer.id,
        orderNumber: "CI-RET-SO-" + tag, status: "SHIPPED",
        items: {create: [{
          itemId: sellerItem.id, itemName: "Seller item",
          quantity: 5, unit: "個", unitPrice: 100, amount: 500,
        }]},
      },
      include: {items:true},
    });
    const company = await prisma.intercompanyOrder.create({
      data: {
        connectionId: connection.id, buyerTenantId: buyer.id,
        sellerTenantId: seller.id, purchaseOrderId: po.id,
        sellerOrderId: so.id, poNumber: po.poNumber, orderDate: new Date(),
        status: "ACCEPTED", subtotal: 500, taxRate: 10, tax: 50, total: 550,
        items: {create: [{
          sourcePurchaseOrderItemId: po.items[0].id,
          sellerOrderItemId: so.items[0].id,
          buyerItemCode: buyerItem.code, itemName: "Buyer item",
          unit: "個", quantity: 5, unitPrice: 100, amount: 500,
        }]},
      },
      include: {items:true},
    });
    const request = await prisma.b2BReturnRequest.create({
      data: {
        intercompanyOrderId: company.id,
        buyerTenantId: buyer.id, sellerTenantId: seller.id,
        requestNumber: "CI-RETURN-" + tag, requestedByUserId: buyerAdmin.id,
        status: "APPROVED",
      },
    });
    const line = await prisma.b2BReturnItem.create({
      data: {
        intercompanyOrderId: company.id, returnRequestId: request.id,
        sourceLineId: company.items[0].id, requestedQuantity: 3,
        approvedQuantity: 3, reason: "DAMAGED",
      },
    });
    const makeEvent = (data: {
      tenantId: string; phase: "DISPATCH" | "INSPECTION";
      eventId?: string; movementId?: string | null;
      quantity: number; saleable?: number; unsaleable?: number;
      createdByUserId: string; returnItemId?: string;
    }) => ({
      returnItemId: data.returnItemId ?? line.id,
      tenantId: data.tenantId, phase: data.phase,
      eventId: data.eventId ?? randomUUID(),
      payloadHash: "a".repeat(64),
      quantity: data.quantity, saleable: data.saleable ?? 0,
      unsaleable: data.unsaleable ?? 0, movementId: data.movementId ?? null,
      createdByUserId: data.createdByUserId,
    });
    const dispatch = await prisma.$transaction(async tx => {
      const stock = await tx.item.update({
        where: {id:buyerItem.id,tenantId:buyer.id},
        data: {stock: {decrement: 2}}, select: {stock:true},
      });
      const movement = await tx.inventoryMovement.create({data: {
        tenantId:buyer.id,itemId:buyerItem.id,type:"OUTBOUND",
        quantity:2,balance:stock.stock,createdBy:buyerAdmin.id,
      }});
      return tx.b2BReturnStockEvent.create({data: makeEvent({
        tenantId:buyer.id,phase:"DISPATCH",
        quantity:2,movementId:movement.id,createdByUserId:buyerAdmin.id,
      })});
    });
    expect(dispatch.phase).toBe("DISPATCH");
    expect((await prisma.item.findUniqueOrThrow({
      where:{id:buyerItem.id},
    })).stock).toBe(8);

    await expect(prisma.b2BReturnStockEvent.create({data: makeEvent({
      tenantId:seller.id,phase:"DISPATCH",
      quantity:1,movementId:dispatch.movementId,createdByUserId:sellerAdmin.id,
    })})).rejects.toThrow();

    await expect(prisma.b2BReturnStockEvent.create({data: makeEvent({
      tenantId:buyer.id,phase:"DISPATCH",
      eventId:dispatch.eventId,
      quantity:1,movementId:dispatch.movementId,createdByUserId:buyerAdmin.id,
    })})).rejects.toThrow();

    await expect(prisma.$transaction(async tx => {
      const fake = await tx.inventoryMovement.create({data: {
        tenantId:buyer.id,itemId:buyerItem.id,type:"OUTBOUND",
        quantity:2,balance:6,createdBy:buyerAdmin.id,
      }});
      await tx.b2BReturnStockEvent.create({data:makeEvent({
        tenantId:buyer.id,phase:"DISPATCH",
        quantity:2,movementId:fake.id,createdByUserId:buyerAdmin.id,
      })});
    })).rejects.toThrow("exceeds approved");

    const inspected = await prisma.$transaction(async tx => {
      const stock = await tx.item.update({
        where: {id:sellerItem.id,tenantId:seller.id},
        data: {stock: {increment:1}}, select:{stock:true},
      });
      const movement = await tx.inventoryMovement.create({data:{
        tenantId:seller.id,itemId:sellerItem.id,type:"INBOUND",
        quantity:1,balance:stock.stock,createdBy:sellerAdmin.id,
      }});
      return tx.b2BReturnStockEvent.create({data: makeEvent({
        tenantId:seller.id,phase:"INSPECTION",
        quantity:2,saleable:1,unsaleable:1,
        movementId:movement.id,createdByUserId:sellerAdmin.id,
      })});
    });
    expect(inspected.saleable).toBe(1);
    expect(inspected.unsaleable).toBe(1);
    expect((await prisma.item.findUniqueOrThrow({
      where:{id:sellerItem.id},
    })).stock).toBe(11);

    await expect(prisma.b2BReturnStockEvent.update({
      where:{id:inspected.id},data:{saleable:2},
    })).rejects.toThrow("immutable");
    await expect(prisma.b2BReturnStockEvent.delete({
      where:{id:inspected.id},
    })).rejects.toThrow("immutable");
    await expect(prisma.inventoryMovement.delete({
      where:{id:inspected.movementId!},
    })).rejects.toThrow();

    await expect(prisma.b2BReturnStockEvent.create({data: makeEvent({
      tenantId:seller.id,phase:"INSPECTION",
      quantity:1,unsaleable:1,createdByUserId:sellerStaff.id,
    })})).rejects.toThrow("administrator");
    await expect(prisma.b2BReturnStockEvent.create({data: makeEvent({
      tenantId:seller.id,phase:"INSPECTION",
      quantity:1,unsaleable:1,createdByUserId:sellerAdmin.id,
    })})).rejects.toThrow("exceeds dispatched");

    expect(await prisma.b2BReturnStockEvent.count({
      where:{returnItemId:line.id},
    })).toBe(2);
    expect(await prisma.inventoryMovement.count({
      where:{tenantId:buyer.id},
    })).toBe(1);
    expect(await prisma.inventoryMovement.count({
      where:{tenantId:seller.id},
    })).toBe(1);
  }, 60000);
});
