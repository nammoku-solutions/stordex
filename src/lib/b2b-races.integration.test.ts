import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { orderedTenantPair } from "./trading-connections";

const url = process.env.DATABASE_URL ?? "";
const disposable =
  process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?|$)/.test(url);

describe("two-tenant company acceptance and cancellation races", () => {
  it.runIf(disposable)("serializes duplicate sends, duplicate accepts, buyer cancel vs send and cancel vs acceptance", async () => {
    const { prisma } = await import("./db");
    const { sendOrderToCompany } = await import("./b2b-send");
    const { acceptCompanyPurchaseOrder } = await import("./b2b-accept");
    const { applyPurchaseOrderStatus } = await import("./purchase-order-status");
    const uid = randomUUID().slice(0, 12);
    const buyer = await prisma.tenant.create({
      data: { name: "B2B race buyer", slug: "ci-b2b-buyer-" + uid },
    });
    const seller = await prisma.tenant.create({
      data: { name: "B2B race seller", slug: "ci-b2b-seller-" + uid },
    });
    try {
      const buyerItem = await prisma.item.create({
        data: { tenantId:buyer.id, code:"B-PAPER", name:"A4コピー用紙", stock:12, unit:"箱" },
      });
      const sellerItem = await prisma.item.create({
        data: { tenantId:seller.id, code:"S-PAPER", name:"A4コピー用紙", stock:100, unit:"箱" },
      });
      const supplier = await prisma.supplier.create({
        data: { tenantId:buyer.id, code:"S-PARTNER", name:"相手会社" },
      });
      const customer = await prisma.customer.create({
        data: { tenantId:seller.id, code:"C-PARTNER", name:"発注元会社" },
      });
      const [tenantAId, tenantBId] = orderedTenantPair(buyer.id,seller.id);
      const connection = await prisma.tradingConnection.create({
        data: { tenantAId,tenantBId,requestedByTenantId:buyer.id,status:"ACTIVE" },
      });
      const makePO = (n:string) => prisma.purchaseOrder.create({
        data: {
          tenantId:buyer.id,poNumber:"CI-RACE-"+uid+"-"+n,
          supplierId:supplier.id,status:"ORDERED",
          orderDate:new Date("2026-10-17T00:00:00Z"),
          subtotal:1000,taxRate:10,tax:100,total:1100,
          items:{create:[{
            itemId:buyerItem.id,itemName:buyerItem.name,unit:"箱",
            quantity:2,unitPrice:500,amount:1000,received:0,
          }]},
        },
      });
      const send = (poId:string) =>
        sendOrderToCompany({tenantId:buyer.id,partnerId:seller.id,purchaseOrderId:poId});
      const cancel = (poId:string) =>
        applyPurchaseOrderStatus({
          tenantId:buyer.id,userId:"ci-buyer",id:poId,status:"CANCELLED",
        });
      const form = (inboundId:string, lineId:string) => {
        const fd = new FormData();
        fd.set("inboundId",inboundId);
        fd.set("customerId",customer.id);
        fd.set("item_"+lineId,sellerItem.id);
        return fd;
      };
      const incomingFor = (poId:string) => prisma.intercompanyOrder.findUniqueOrThrow({
        where:{purchaseOrderId:poId},include:{items:true},
      });
      const acceptedOrderCount = () => prisma.order.count({where:{tenantId:seller.id}});

      // Two clicks to SEND must create exactly one incoming document and one line.
      const po1 = await makePO("double-send");
      const sends = await Promise.allSettled([send(po1.id),send(po1.id)]);
      expect(sends.filter(x=>x.status==="fulfilled")).toHaveLength(1);
      const incoming1 = await incomingFor(po1.id);
      expect(incoming1.items).toHaveLength(1);
      expect(incoming1.status).toBe("SENT");
      expect(await prisma.intercompanyOrder.count({where:{purchaseOrderId:po1.id}})).toBe(1);

      // Seller accepts same inbound order twice concurrently: one DRAFT order only.
      const form1 = () => form(incoming1.id,incoming1.items[0].id);
      const accepts = await Promise.allSettled([
        acceptCompanyPurchaseOrder({tenantId:seller.id,formData:form1()}),
        acceptCompanyPurchaseOrder({tenantId:seller.id,formData:form1()}),
      ]);
      expect(accepts.filter(x=>x.status==="fulfilled")).toHaveLength(1);
      expect(await acceptedOrderCount()).toBe(1);
      const accepted = await incomingFor(po1.id);
      expect(accepted.status).toBe("ACCEPTED");
      expect(accepted.sellerOrderId).toBeTruthy();
      await expect(cancel(po1.id)).rejects.toThrow(/承認/);
      expect((await prisma.purchaseOrder.findUniqueOrThrow({where:{id:po1.id}})).status).toBe("ORDERED");

      // Buyer cancellation and seller acceptance contend for same incoming status.
      const po2=await makePO("cancel-accept");
      await send(po2.id);
      const incoming2=await incomingFor(po2.id);
      const race = await Promise.allSettled([
        cancel(po2.id),
        acceptCompanyPurchaseOrder({tenantId:seller.id,formData:form(incoming2.id,incoming2.items[0].id)}),
      ]);
      expect(race.filter(x=>x.status==="fulfilled")).toHaveLength(1);
      const buyerResult=await prisma.purchaseOrder.findUniqueOrThrow({where:{id:po2.id}});
      const companyResult=await incomingFor(po2.id);
      if (buyerResult.status==="CANCELLED") {
        expect(companyResult.status).toBe("CANCELLED");
        expect(companyResult.sellerOrderId).toBeNull();
      } else {
        expect(buyerResult.status).toBe("ORDERED");
        expect(companyResult.status).toBe("ACCEPTED");
        expect(companyResult.sellerOrderId).toBeTruthy();
      }

      // Buyer cancellation cannot occur unseen between checking ORDERED and sending.
      const po3=await makePO("send-cancel");
      const race2=await Promise.allSettled([cancel(po3.id),send(po3.id)]);
      expect(race2.filter(x=>x.status==="fulfilled")).toHaveLength(1);
      const po3After=await prisma.purchaseOrder.findUniqueOrThrow({where:{id:po3.id}});
      const company3=await prisma.intercompanyOrder.findUnique({where:{purchaseOrderId:po3.id}});
      if (po3After.status==="CANCELLED") {
        expect(company3).toBeNull();
      } else {
        expect(po3After.status).toBe("ORDERED");
        expect(company3?.status).toBe("SENT");
      }

      // Tenant isolation and stock must be unaffected throughout draft acceptance.
      await expect(sendOrderToCompany({
        tenantId:seller.id,partnerId:buyer.id,purchaseOrderId:po1.id,
      })).rejects.toThrow();
      expect((await prisma.item.findUniqueOrThrow({where:{id:buyerItem.id}})).stock).toBe(12);
      expect((await prisma.item.findUniqueOrThrow({where:{id:sellerItem.id}})).stock).toBe(100);
      expect(await prisma.inventoryMovement.count({
        where:{tenantId:{in:[buyer.id,seller.id]}},
      })).toBe(0);
      expect(await prisma.tradingConnection.count({where:{id:connection.id}})).toBe(1);
    } finally {
      await prisma.intercompanyOrder.deleteMany({where:{buyerTenantId:buyer.id}});
      await prisma.order.deleteMany({where:{tenantId:seller.id}});
      await prisma.purchaseOrder.deleteMany({where:{tenantId:buyer.id}});
      await prisma.item.deleteMany({where:{tenantId:{in:[buyer.id,seller.id]}}});
      await prisma.customer.deleteMany({where:{tenantId:seller.id}});
      await prisma.supplier.deleteMany({where:{tenantId:buyer.id}});
      await prisma.tradingConnection.deleteMany({where:{
        OR:[{tenantAId:buyer.id},{tenantBId:buyer.id}],
      }});
      await prisma.tenant.deleteMany({where:{id:{in:[buyer.id,seller.id]}}});
    }
  },60000);
});
