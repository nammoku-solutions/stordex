import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL ?? "";
const disposable = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?|$)/.test(url);

describe("actual counted purchase receipt", () => {
  it.runIf(disposable)("records over/short goods once, rejects missing reasons, blocks cross-tenant and duplicate claims", async () => {
    const { prisma } = await import("./db");
    const { applyPurchaseOrderStatus } = await import("./purchase-order-status");
    const uuid = randomUUID().slice(0, 10);
    const tenant = await prisma.tenant.create({
      data: { slug:"ci-receive-"+uuid,name:"CI counted receipt" },
    });
    const intruder = await prisma.tenant.create({
      data: { slug:"ci-intruder-"+uuid,name:"Another Tenant" },
    });
    try {
      const supplier=await prisma.supplier.create({
        data:{tenantId:tenant.id,code:"PACK-S",name:"Supplier"},
      });
      const item=await prisma.item.create({
        data:{
          tenantId:tenant.id,code:"ON-DEMAND",name:"On demand item",
          unit:"個",stock:0,stockPolicy:"ON_DEMAND",
          purchaseMode:"UNIT",costPrice:90,
        },
      });
      let poCount=0;
      const makePO=async (qty:number) => {
        const po=await prisma.purchaseOrder.create({
          data:{
            tenantId:tenant.id,supplierId:supplier.id,
            poNumber:"CI-RECEIVE-"+uuid+"-"+(++poCount),status:"ORDERED",
            subtotal:qty*90,total:qty*99,tax:qty*9,
            items:{create:[{
              itemId:item.id,itemName:item.name,unit:"個",
              quantity:qty,unitPrice:90,amount:qty*90,

            }]},
          },
          include:{items:true},
        });
        return {po,line:po.items[0]};
      };
      const receipt=(poId:string,lineId:string,n:number,reason?:string,tenantId=tenant.id)=>
        applyPurchaseOrderStatus({
          tenantId,userId:"ci-receiver",id:poId,status:"RECEIVED",
          actualReceipts:{[lineId]:n},discrepancyReason:reason,
        });
      const nine=await makePO(9);
      // Generic status mutations must not bypass the mandatory stock count.
      await expect(applyPurchaseOrderStatus({
        tenantId:tenant.id,userId:"ci-receiver",id:nine.po.id,status:"RECEIVED",
      })).rejects.toThrow(/実入荷数量/);
      expect((await prisma.item.findUniqueOrThrow({where:{id:item.id}})).stock).toBe(0);
      await expect(receipt(nine.po.id,nine.line.id,10)).rejects.toThrow(/理由/);
      expect((await prisma.item.findUniqueOrThrow({where:{id:item.id}})).stock).toBe(0);
      await expect(receipt(nine.po.id,nine.line.id,10,"多く納品",intruder.id))
        .rejects.toThrow(/発注が見つかりません/);
      await receipt(nine.po.id,nine.line.id,10,"実物を検数：1個多い");
      expect((await prisma.item.findUniqueOrThrow({where:{id:item.id}})).stock).toBe(10);
      const updatedNine=await prisma.purchaseOrder.findUniqueOrThrow({
        where:{id:nine.po.id},include:{items:true},
      });
      expect(updatedNine.status).toBe("RECEIVED");
      expect(updatedNine.items[0]).toMatchObject({quantity:9,received:10});
      expect(updatedNine.note).toContain("発注9→実入荷10");
      await receipt(nine.po.id,nine.line.id,10,"再送信");
      expect(await prisma.inventoryMovement.count({
        where:{tenantId:tenant.id,reference:nine.po.poNumber},
      })).toBe(1);
      const firstLedger=await prisma.inventoryMovement.findFirstOrThrow({
        where:{reference:nine.po.poNumber},
      });
      expect(firstLedger).toMatchObject({type:"INBOUND",quantity:10,balance:10});
      expect(firstLedger.note).toContain("実入荷10");

      const short=await makePO(9);
      await expect(receipt(short.po.id,short.line.id,0,"")).rejects.toThrow(/1個以上/);
      await expect(receipt(short.po.id,short.line.id,8,"")).rejects.toThrow(/理由/);
      await receipt(short.po.id,short.line.id,8,"1個不足（別発注で対応）");
      expect((await prisma.item.findUniqueOrThrow({where:{id:item.id}})).stock).toBe(18);
      expect((await prisma.purchaseOrderItem.findUniqueOrThrow({where:{id:short.line.id}})).received).toBe(8);

      // A whole supplier PACK can deliver an extra base unit. This remains a
      // count discrepancy, not a fractional-pack order or automatic repricing.
      const packItem=await prisma.item.create({
        data:{
          tenantId:tenant.id,code:"ON-DEMAND-PACK",name:"Pack of ten",
          unit:"個",stock:0,stockPolicy:"ON_DEMAND",purchaseMode:"PACK",
          caseQty:10,orderUnit:"箱",costPrice:100,
        },
      });
      const packPO=await prisma.purchaseOrder.create({
        data:{
          tenantId:tenant.id,supplierId:supplier.id,
          poNumber:"CI-PACK-"+uuid,status:"ORDERED",
          subtotal:1000,tax:100,total:1100,
          items:{create:[{
            itemId:packItem.id,itemName:packItem.name,unit:"個",
            quantity:10,unitPrice:100,amount:1000,
            packSize:10,packUnit:"箱",packCount:1,
          }]},
        },
        include:{items:true},
      });
      await prisma.item.update({where:{id:packItem.id},data:{caseQty:12}});
      await receipt(packPO.id,packPO.items[0].id,11,"1箱10個のはずが11個入荷");
      const recorded=await prisma.purchaseOrderItem.findUniqueOrThrow({
        where:{id:packPO.items[0].id},
      });
      expect(recorded).toMatchObject({
        quantity:10,received:11,packSize:10,packCount:1,packUnit:"箱",
      });
      expect((await prisma.item.findUniqueOrThrow({where:{id:packItem.id}})).stock).toBe(11);
      expect((await prisma.inventoryMovement.findFirstOrThrow({
        where:{tenantId:tenant.id,reference:packPO.poNumber},
      })).quantity).toBe(11);

      const duplicate=await makePO(10);
      const concurrent=await Promise.allSettled([
        receipt(duplicate.po.id,duplicate.line.id,10),
        receipt(duplicate.po.id,duplicate.line.id,11,"余剰1個を検収"),
      ]);
      expect(concurrent.some(x=>x.status==="fulfilled")).toBe(true);
      const completed=await prisma.purchaseOrder.findUniqueOrThrow({
        where:{id:duplicate.po.id},include:{items:true},
      });
      const counted=completed.items[0].received;
      expect([10,11]).toContain(counted);
      expect((await prisma.item.findUniqueOrThrow({where:{id:item.id}})).stock).toBe(18+counted);
      expect(await prisma.inventoryMovement.count({
        where:{tenantId:tenant.id,reference:duplicate.po.poNumber},
      })).toBe(1);
    } finally {
      await prisma.inventoryMovement.deleteMany({where:{tenantId:tenant.id}});
      await prisma.purchaseOrder.deleteMany({where:{tenantId:tenant.id}});
      await prisma.item.deleteMany({where:{tenantId:tenant.id}});
      await prisma.supplier.deleteMany({where:{tenantId:tenant.id}});
      await prisma.tenant.deleteMany({where:{id:{in:[tenant.id,intruder.id]}}});
    }
  }, 60000);
});
