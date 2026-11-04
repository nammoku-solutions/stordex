import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { toCsv, type CsvCell } from "@/lib/csv-export";
import {
  ITEM_MIGRATION_EXPORT_HEADERS,
  MOVEMENT_MIGRATION_EXPORT_HEADERS,
} from "./inventory-ledger-preflight";
import { PURCHASE_ORDER_EXPORT_HEADERS } from "./purchase-order-preflight";

const url = process.env.DATABASE_URL ?? "";
const isolated = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?schema=public)?$/.test(url);

function csvBytes(headers: readonly string[], rows: Record<string, CsvCell>[]) {
  return new TextEncoder().encode(
    toCsv([...headers], rows.map(row => headers.map(key => row[key] ?? ""))),
  );
}
const sourceItems = [
  {code:"HIST-SKU",name:"移行元在庫商品",stock:15},
  {code:"NO-HIST-SKU",name:"履歴なし商品",stock:9},
];
const sourcePurchaseOrders = [{
  poNumber: "SOURCE-PO-1", supplierCode: "S-1", supplierName: "Source Supplier",
  orderDate: "2026-11-03", pickupDate: "", status: "RECEIVED", note: "",
  taxRate: 10, subtotal: 500, tax: 50, total: 550,
  itemCode: "HIST-SKU", itemName: "移行元在庫商品", unit: "個",
  quantity: 5, unitPrice: 100, amount: 500, received: 5,
  packSize: "", packCount: "", packUnit: "",
  createdAt: "2026-11-03T00:00:00.000Z",
  updatedAt: "2026-11-03T00:01:00.000Z",
}];
const sourceMoves = [{
  movementId:"SOURCE-M-1",createdAt:"2026-11-03T00:00:00.000Z",
  itemCode:"HIST-SKU",itemName:"移行元在庫商品",
  type:"INBOUND",quantity:5,balance:15,
}];

describe("archive cutover data in independent immutable tables",()=>{
  it.runIf(isolated)("stores tenant-bound source snapshots once, never modifies operating inventory, and rejects tampering",async()=>{
    const {prisma}=await import("@/lib/db");
    const {createInventoryCutoverManifest}=await import("./inventory-cutover-manifest");
    const {archiveCutoverInDisposableCi}=await import("./archive-cutover-disposable");
    const suffix=randomUUID().slice(0,10);
    const tenant=await prisma.tenant.create({
      data:{slug:"ci-archive-"+suffix,name:"CI Historical Archive"},
    });
    const other=await prisma.tenant.create({
      data:{slug:"ci-other-"+suffix,name:"Other Tenant"},
    });
    // All test records remain within GitHub Actions disposable postgres, dropped
    // with the CI job. Archive immutability intentionally prohibits manual deletes.
    const item=await prisma.item.create({
      data:{tenantId:tenant.id,code:"HIST-SKU",name:"Existing Stock",stock:15},
    });
    await prisma.item.create({
      data:{tenantId:tenant.id,code:"NO-HIST-SKU",name:"No history",stock:9},
    });
    const otherItem=await prisma.item.create({
      data:{tenantId:other.id,code:"HIST-SKU",name:"Other Stock",stock:888},
    });
    const input={
      targetTenantId:tenant.id,
      sourceTenantId:"source-tenant-ci",
      itemsCsv:csvBytes(ITEM_MIGRATION_EXPORT_HEADERS,sourceItems),
      movementsCsv:csvBytes(MOVEMENT_MIGRATION_EXPORT_HEADERS,sourceMoves),
      purchaseOrdersCsv:csvBytes(PURCHASE_ORDER_EXPORT_HEADERS,sourcePurchaseOrders),
    };
    const {manifest}=createInventoryCutoverManifest({
      tenantId:input.sourceTenantId,itemsCsv:input.itemsCsv,
      movementsCsv:input.movementsCsv,
      generatedAt:new Date("2026-11-03T00:00:00.000Z"),
    });
    expect(manifest).not.toBeNull();
    const result=await archiveCutoverInDisposableCi({...input,manifest:manifest!});
    expect(result).toMatchObject({
      created:true,archivedItems:2,archivedMovements:1,
      archivedPurchaseOrders:1,purchaseOrderWarnings:0,status:"PREPARED",
      operationalItemWrites:0,operationalMovementWrites:0,operationalOrderWrites:0,
    });
    const batch=await prisma.migrationArchiveBatch.findUniqueOrThrow({
      where:{tenantId_manifestId:{
        tenantId:tenant.id,manifestId:manifest!.manifestId,
      }},
      include:{items:{orderBy:{itemCode:"asc"}}},
    });
    expect(batch.purchaseOrdersCsvSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(batch.items).toHaveLength(2);
    expect(batch.items[0]).toMatchObject({
      itemCode:"HIST-SKU",cutoverStock:15,historyKind:"RECONCILED_LEDGER",
      historicalOpening:10,lastHistoricalBalance:15,movementCount:1,
    });
    expect(batch.items[1]).toMatchObject({
      itemCode:"NO-HIST-SKU",cutoverStock:9,historyKind:"CUTOVER_ONLY_NO_HISTORY",
      historicalOpening:null,lastHistoricalBalance:null,movementCount:0,
    });
    const savedMovement=await prisma.migrationArchiveMovement.findFirstOrThrow({
      where:{tenantId:tenant.id,batchId:batch.id,sourceMovementId:"SOURCE-M-1"},
    });
    expect(savedMovement.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(savedMovement.snapshot).toMatchObject({
      movementId:"SOURCE-M-1",itemCode:"HIST-SKU",
      type:"INBOUND",quantity:"5",balance:"15",
    });
    const savedPO=await prisma.migrationArchivePurchaseOrder.findFirstOrThrow({
      where:{tenantId:tenant.id,batchId:batch.id,sourcePoNumber:"SOURCE-PO-1"},
    });
    expect(savedPO.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(savedPO.snapshot).toMatchObject({
      poNumber:"SOURCE-PO-1",supplierCode:"S-1",status:"RECEIVED",
      lines:[{itemCode:"HIST-SKU",quantity:5,received:5}],
    });
    const repeated=await archiveCutoverInDisposableCi({...input,manifest:manifest!});
    expect(repeated).toMatchObject({created:false,batchId:result.batchId,archivedItems:2,archivedMovements:1,archivedPurchaseOrders:1});
    expect(await prisma.migrationArchiveItem.count({where:{tenantId:tenant.id}})).toBe(2);
    expect(await prisma.migrationArchiveBatch.count({where:{tenantId:other.id}})).toBe(0);
    expect(await prisma.migrationArchivePurchaseOrder.count({where:{tenantId:tenant.id}})).toBe(1);
    expect(await prisma.migrationArchiveMovement.count({where:{tenantId:tenant.id}})).toBe(1);
    expect(await prisma.purchaseOrder.count({where:{tenantId:tenant.id}})).toBe(0);
    expect(await prisma.inventoryMovement.count({where:{tenantId:tenant.id}})).toBe(0);
    expect((await prisma.item.findUniqueOrThrow({where:{id:item.id}})).stock).toBe(15);
    expect((await prisma.item.findUniqueOrThrow({where:{id:otherItem.id}})).stock).toBe(888);

    const forged=JSON.parse(JSON.stringify(manifest)) as typeof manifest;
    forged!.items[0].cutoverStock=999;
    await expect(archiveCutoverInDisposableCi({...input,manifest:forged!}))
      .rejects.toThrow("一致しません");
    await expect(archiveCutoverInDisposableCi({
      ...input,sourceTenantId:"different-source",manifest:manifest!,
    })).rejects.toThrow("一致しません");
    expect(await prisma.migrationArchiveBatch.count({where:{tenantId:tenant.id}})).toBe(1);
    const changedPurchaseCsv=csvBytes(PURCHASE_ORDER_EXPORT_HEADERS,[
      {...sourcePurchaseOrders[0],note:"changed but still valid"},
    ]);
    await expect(archiveCutoverInDisposableCi({
      ...input,purchaseOrdersCsv:changedPurchaseCsv,manifest:manifest!,
    })).rejects.toThrow("内容不一致");
    // Adding PO source bytes after batch creation or silently dropping them
    // would break provenance, even if the inventory manifest is unchanged.
    await expect(archiveCutoverInDisposableCi({
      ...input,purchaseOrdersCsv:undefined,manifest:manifest!,
    })).rejects.toThrow("内容不一致");
    await expect(archiveCutoverInDisposableCi({
      ...input,purchaseOrdersCsv:csvBytes(PURCHASE_ORDER_EXPORT_HEADERS,[
        {...sourcePurchaseOrders[0],itemCode:"MISSING-SKU"},
      ]),manifest:manifest!,
    })).rejects.toThrow("商品マスタに存在しない");

    // The DB rejects linking a target-tenant archive row to another
    // tenant's batch, even through unchecked scalar foreign keys.
    await expect(prisma.migrationArchiveItem.create({
      data:{
        tenantId:other.id,batchId:batch.id,itemCode:"CROSS-TENANT",
        cutoverStock:1,historyKind:"CUTOVER_ONLY_NO_HISTORY",
        movementCount:0,
      },
    })).rejects.toThrow();
    // Even the parent batch's source identity/tenant cannot be rewritten.
    await expect(prisma.migrationArchiveBatch.update({
      where:{id:batch.id},data:{tenantId:other.id},
    })).rejects.toThrow();
    expect(await prisma.migrationArchiveBatch.count({where:{tenantId:tenant.id}})).toBe(1);

    await expect(prisma.migrationArchiveBatch.update({
      where:{id:batch.id},
      data:{purchaseOrdersCsvSha256:"f".repeat(64)},
    })).rejects.toThrow();

    // The movement archive is immutable and also tenant-isolated in the DB.
    await expect(prisma.migrationArchiveMovement.update({
      where:{id:savedMovement.id},data:{snapshot:{movementId:"tampered"}},
    })).rejects.toThrow();
    await expect(prisma.migrationArchiveMovement.delete({
      where:{id:savedMovement.id},
    })).rejects.toThrow();
    await expect(prisma.migrationArchiveMovement.create({
      data:{
        tenantId:other.id,batchId:batch.id,sourceMovementId:"OTHER-M-1",
        sourceSha256:"f".repeat(64),snapshot:{movementId:"OTHER-M-1"},
      },
    })).rejects.toThrow();
    expect(await prisma.migrationArchiveMovement.count({where:{tenantId:tenant.id}})).toBe(1);

    // A historical PO stays immutable; the composite foreign key rejects
    // attaching a different tenant's PO to this batch.
    await expect(prisma.migrationArchivePurchaseOrder.update({
      where:{id:savedPO.id},data:{snapshot:{poNumber:"changed"}},
    })).rejects.toThrow();
    await expect(prisma.migrationArchivePurchaseOrder.delete({
      where:{id:savedPO.id},
    })).rejects.toThrow();
    await expect(prisma.migrationArchivePurchaseOrder.create({
      data:{
        tenantId:other.id,batchId:batch.id,sourcePoNumber:"OTHER-PO",
        sourceSha256:"f".repeat(64),snapshot:{poNumber:"OTHER-PO"},
      },
    })).rejects.toThrow();
    expect(await prisma.migrationArchivePurchaseOrder.count({where:{tenantId:tenant.id}})).toBe(1);

    // Even a direct ORM attempt cannot rewrite an archived stock snapshot.
    await expect(prisma.migrationArchiveItem.update({
      where:{id:batch.items[0].id},data:{cutoverStock:12345},
    })).rejects.toThrow();
    await expect(prisma.migrationArchiveItem.delete({
      where:{id:batch.items[0].id},
    })).rejects.toThrow();
    expect((await prisma.migrationArchiveItem.findUniqueOrThrow({
      where:{id:batch.items[0].id},
    })).cutoverStock).toBe(15);

    const saved=process.env.APP_ENV;
    process.env.APP_ENV="staging";
    try {
      await expect(archiveCutoverInDisposableCi({...input,manifest:manifest!}))
        .rejects.toThrow("disabled outside disposable CI");
    } finally {
      process.env.APP_ENV=saved;
    }
  });
});