import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const disposable = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?schema=public)?$/
    .test(process.env.DATABASE_URL ?? "");

describe("physical return status audit service (isolated PG only)", () => {
  it.runIf(disposable)(
    "audits buyer dispatch and seller inspection transitions, rejects bad replay and concurrency",
    async () => {
      const { prisma } = await import("@/lib/db");
      const {
        postBuyerReturnDispatch, postSellerReturnInspection,
      } = await import("./b2b-return-stock-posting");
      const { recordPhysicalReturnStatus } = await import("./b2b-return-status-service");
      const token = randomUUID().slice(0, 10);
      const buyer = await prisma.tenant.create({
        data: { name: "return buyer", slug: "test-ret-post-b-" + token },
      });
      const seller = await prisma.tenant.create({
        data: { name: "return seller", slug: "test-ret-post-s-" + token },
      });
      const buyerUser = await prisma.user.create({data:{
        tenantId:buyer.id,email:"b-"+token+"@example.test",name:"Buyer",
        role:"OWNER",passwordHash:"ci-only",
      }});
      const sellerUser = await prisma.user.create({data:{
        tenantId:seller.id,email:"s-"+token+"@example.test",name:"Seller",
        role:"ADMIN",passwordHash:"ci-only",
      }});
      const staff = await prisma.user.create({data:{
        tenantId:seller.id,email:"staff-"+token+"@example.test",name:"Staff",
        role:"STAFF",passwordHash:"ci-only",
      }});
      const [tenantAId,tenantBId]=[buyer.id,seller.id].sort();
      const connection = await prisma.tradingConnection.create({data:{
        tenantAId,tenantBId,requestedByTenantId:buyer.id,status:"ACTIVE",
      }});
      const supplier = await prisma.supplier.create({data:{
        tenantId:buyer.id,code:"supplier",name:"Seller",
      }});
      const customer = await prisma.customer.create({data:{
        tenantId:seller.id,code:"customer",name:"Buyer",
      }});
      const buyerItem = await prisma.item.create({data:{
        tenantId:buyer.id,code:"post-return-b",name:"Buyer stock",stock:5,
      }});
      const sellerItem = await prisma.item.create({data:{
        tenantId:seller.id,code:"post-return-s",name:"Seller stock",stock:5,
      }});
      const po = await prisma.purchaseOrder.create({
        data:{
          tenantId:buyer.id,supplierId:supplier.id,
          poNumber:"RET-BUY-"+token,status:"RECEIVED",
          items:{create:[{
            itemId:buyerItem.id,itemName:buyerItem.name,unit:"個",
            quantity:5,received:5,unitPrice:100,amount:500,
          }]},
        },include:{items:true},
      });
      const so = await prisma.order.create({
        data:{
          tenantId:seller.id,customerId:customer.id,
          orderNumber:"RET-SELL-"+token,status:"SHIPPED",
          items:{create:[{
            itemId:sellerItem.id,itemName:sellerItem.name,unit:"個",
            quantity:5,unitPrice:100,amount:500,
          }]},
        },include:{items:true},
      });
      const co = await prisma.intercompanyOrder.create({
        data:{
          connectionId:connection.id,buyerTenantId:buyer.id,
          sellerTenantId:seller.id,purchaseOrderId:po.id,sellerOrderId:so.id,
          poNumber:po.poNumber,orderDate:new Date(),status:"ACCEPTED",
          subtotal:500,taxRate:10,tax:50,total:550,
          items:{create:[{
            sourcePurchaseOrderItemId:po.items[0].id,
            sellerOrderItemId:so.items[0].id,buyerItemCode:buyerItem.code,
            itemName:"Buyer stock",unit:"個",quantity:5,
            unitPrice:100,amount:500,
          }]},
        },include:{items:true},
      });
      const request=await prisma.b2BReturnRequest.create({data:{
        intercompanyOrderId:co.id,buyerTenantId:buyer.id,
        sellerTenantId:seller.id,requestNumber:"RET-"+token,
        requestedByUserId:buyerUser.id,status:"PARTIALLY_APPROVED",
      }});
      const line=await prisma.b2BReturnItem.create({data:{
        returnRequestId:request.id,intercompanyOrderId:co.id,
        sourceLineId:co.items[0].id,reason:"DAMAGED",
        requestedQuantity:4,approvedQuantity:3,
      }});

      const firstEventId=randomUUID();
      const buyerArgs={
        tenantId:buyer.id,userId:buyerUser.id,returnItemId:line.id,
        eventId:firstEventId,quantity:2,
      };
      const first=await postBuyerReturnDispatch(buyerArgs);
      expect(first.created).toBe(true);
      expect(await postBuyerReturnDispatch(buyerArgs))
        .toEqual({stockEventId:first.stockEventId,created:false});
      expect((await prisma.item.findUniqueOrThrow({
        where:{id:buyerItem.id},
      })).stock).toBe(3);
      expect(await prisma.inventoryMovement.count({
        where:{tenantId:buyer.id},
      })).toBe(1);
      const dispatchCmd = {
        tenantId: buyer.id, userId: buyerUser.id, returnRequestId: request.id,
        eventId: randomUUID(), expectedStatus: "PARTIALLY_APPROVED" as const,
        targetStatus: "DISPATCHED" as const,
      };
      const initialStatus=await recordPhysicalReturnStatus(dispatchCmd);
      expect(initialStatus).toMatchObject({created:true,status:"DISPATCHED"});
      expect(await recordPhysicalReturnStatus(dispatchCmd))
        .toEqual({eventRecordId:initialStatus.eventRecordId,created:false,status:"DISPATCHED"});
      await expect(recordPhysicalReturnStatus({
        ...dispatchCmd,expectedStatus:"APPROVED",
      })).rejects.toThrow("異なるステータス");
      await expect(recordPhysicalReturnStatus({
        ...dispatchCmd,eventId:randomUUID(),userId:staff.id,
      })).rejects.toThrow();
      await expect(recordPhysicalReturnStatus({
        ...dispatchCmd,eventId:randomUUID(),
      })).rejects.toThrow("変更されました");
      expect((await prisma.b2BReturnRequest.findUniqueOrThrow({
        where:{id:request.id},
      })).status).toBe("DISPATCHED");

      await expect(postBuyerReturnDispatch({
        ...buyerArgs,quantity:1,
      })).rejects.toThrow("異なる返品データ");
      await expect(postBuyerReturnDispatch({
        ...buyerArgs,tenantId:seller.id,eventId:randomUUID(),
      })).rejects.toThrow();
      const second=await postBuyerReturnDispatch({
        ...buyerArgs,eventId:randomUUID(),quantity:1,
      });
      expect(second.created).toBe(true);
      await expect(postBuyerReturnDispatch({
        ...buyerArgs,eventId:randomUUID(),quantity:1,
      })).rejects.toThrow("承認済み");
      expect((await prisma.item.findUniqueOrThrow({
        where:{id:buyerItem.id},
      })).stock).toBe(2);

      const inspectArgs={
        tenantId:seller.id,userId:sellerUser.id,returnItemId:line.id,
        eventId:randomUUID(),receivedNow:2,saleable:1,unsaleable:1,
      };
      const inspected=await postSellerReturnInspection(inspectArgs);
      expect(inspected.created).toBe(true);
      expect(await postSellerReturnInspection(inspectArgs)).toEqual({
        stockEventId:inspected.stockEventId,created:false,
      });
      expect((await prisma.item.findUniqueOrThrow({
        where:{id:sellerItem.id},
      })).stock).toBe(6);
      const partialStatus=await recordPhysicalReturnStatus({
        tenantId:seller.id,userId:sellerUser.id,returnRequestId:request.id,
        eventId:randomUUID(),expectedStatus:"DISPATCHED",
        targetStatus:"PARTIALLY_INSPECTED",
      });
      expect(partialStatus).toMatchObject({created:true,status:"PARTIALLY_INSPECTED"});
      await expect(recordPhysicalReturnStatus({
        tenantId:buyer.id,userId:buyerUser.id,returnRequestId:request.id,
        eventId:randomUUID(),expectedStatus:"PARTIALLY_INSPECTED",
        targetStatus:"INSPECTED",
      })).rejects.toThrow();
      const allBad=await postSellerReturnInspection({
        ...inspectArgs,eventId:randomUUID(),receivedNow:1,
        saleable:0,unsaleable:1,
      });
      expect(allBad.created).toBe(true);
      const badEvent=await prisma.b2BReturnStockEvent.findUniqueOrThrow({
        where:{id:allBad.stockEventId},
      });
      expect(badEvent.movementId).toBeNull();
      await expect(recordPhysicalReturnStatus({
        tenantId:seller.id,userId:staff.id,returnRequestId:request.id,
        eventId:randomUUID(),expectedStatus:"PARTIALLY_INSPECTED",
        targetStatus:"INSPECTED",
      })).rejects.toThrow("管理者権限");
      const inspectedStatus=await recordPhysicalReturnStatus({
        tenantId:seller.id,userId:sellerUser.id,returnRequestId:request.id,
        eventId:randomUUID(),expectedStatus:"PARTIALLY_INSPECTED",
        targetStatus:"INSPECTED",
      });
      expect(inspectedStatus).toMatchObject({created:true,status:"INSPECTED"});
      const auditRow=await prisma.b2BReturnStatusEvent.findUniqueOrThrow({
        where:{id:inspectedStatus.eventRecordId},
      });
      expect(auditRow.sourceTotalsHash).toMatch(/^[a-f0-9]{64}$/);
      await expect(prisma.b2BReturnStatusEvent.update({
        where:{id:auditRow.id},data:{sourceTotalsHash:"e".repeat(64)},
      })).rejects.toThrow("append-only");
      await expect(prisma.b2BReturnStatusEvent.delete({
        where:{id:auditRow.id},
      })).rejects.toThrow("append-only");
      expect(await prisma.b2BReturnStatusEvent.count({
        where:{returnRequestId:request.id},
      })).toBe(3);
      expect((await prisma.b2BReturnRequest.findUniqueOrThrow({
        where:{id:request.id},
      })).status).toBe("INSPECTED");
      // Once the audited request reaches INSPECTED, all further physical
      // writes are blocked by status, before quantity-budget validation.
      await expect(postSellerReturnInspection({
        ...inspectArgs,eventId:randomUUID(),receivedNow:1,
        saleable:0,unsaleable:1,
      })).rejects.toThrow("承認済みの返品");
      await expect(postSellerReturnInspection({
        ...inspectArgs,userId:staff.id,eventId:randomUUID(),
      })).rejects.toThrow("管理者権限");

      // Two distinct concurrent dispatches compete for ONE approved unit.
      // At most one can be committed; a serialization error may require the
      // client to retry but must never create a second movement.
      const raceRequest = await prisma.b2BReturnRequest.create({data:{
        intercompanyOrderId:co.id,buyerTenantId:buyer.id,sellerTenantId:seller.id,
        requestNumber:"RET-RACE-"+token,requestedByUserId:buyerUser.id,
        status:"APPROVED",
      }});
      const raceLine = await prisma.b2BReturnItem.create({data:{
        returnRequestId:raceRequest.id,intercompanyOrderId:co.id,
        sourceLineId:co.items[0].id,reason:"DAMAGED",
        requestedQuantity:1,approvedQuantity:1,
      }});
      const results = await Promise.allSettled([
        postBuyerReturnDispatch({
          tenantId:buyer.id,userId:buyerUser.id,returnItemId:raceLine.id,
          eventId:randomUUID(),quantity:1,
        }),
        postBuyerReturnDispatch({
          tenantId:buyer.id,userId:buyerUser.id,returnItemId:raceLine.id,
          eventId:randomUUID(),quantity:1,
        }),
      ]);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
      expect(await prisma.b2BReturnStockEvent.count({
        where:{returnItemId:raceLine.id,phase:"DISPATCH"},
      })).toBe(1);
      const competing = await Promise.allSettled([
        recordPhysicalReturnStatus({
          tenantId:buyer.id,userId:buyerUser.id,returnRequestId:raceRequest.id,
          eventId:randomUUID(),expectedStatus:"APPROVED",targetStatus:"DISPATCHED",
        }),
        recordPhysicalReturnStatus({
          tenantId:buyer.id,userId:buyerUser.id,returnRequestId:raceRequest.id,
          eventId:randomUUID(),expectedStatus:"APPROVED",targetStatus:"DISPATCHED",
        }),
      ]);
      expect(competing.filter(x=>x.status==="fulfilled")).toHaveLength(1);
      expect(competing.filter(x=>x.status==="rejected")).toHaveLength(1);
      expect(await prisma.b2BReturnStatusEvent.count({
        where:{returnRequestId:raceRequest.id},
      })).toBe(1);
      expect((await prisma.item.findUniqueOrThrow({
        where:{id:buyerItem.id},
      })).stock).toBe(1);

      expect(await prisma.inventoryMovement.count({
        where:{tenantId:seller.id},
      })).toBe(1);
      expect(await prisma.b2BReturnStockEvent.count({
        where:{returnItemId:line.id,phase:"DISPATCH"},
      })).toBe(2);
      expect(await prisma.b2BReturnStockEvent.count({
        where:{returnItemId:line.id,phase:"INSPECTION"},
      })).toBe(2);
    }, 60000,
  );
});
