import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv-export";
import { ITEM_MIGRATION_EXPORT_HEADERS, MOVEMENT_MIGRATION_EXPORT_HEADERS } from "./inventory-ledger-preflight";
import { createInventoryCutoverManifest } from "./inventory-cutover-manifest";

type CsvCell = string | number | boolean | null;
const item = {code:"STOCK-A", name:"検証商品", stock:15};
const noHistory = {code:"NO-HIST", name:"履歴のない商品", stock:9};
const first = {
  movementId:"src-1",createdAt:"2026-11-01T00:00:00.000Z",
  itemCode:"STOCK-A",itemName:"検証商品",type:"INBOUND",
  quantity:5,balance:15,
};
function bytes(headers:readonly string[], records:Record<string,CsvCell>[]) {
  const text=toCsv([...headers],records.map(data=>headers.map(k=>data[k]??"")));
  return new TextEncoder().encode(text);
}
function input(override:{
  a?:Record<string,CsvCell>[],
  b?:Record<string,CsvCell>[],
  tenant?:string,
}={}) {
  return {
    tenantId:override.tenant??"tenant-a",
    itemsCsv:bytes(ITEM_MIGRATION_EXPORT_HEADERS,override.a??[item,noHistory]),
    movementsCsv:bytes(MOVEMENT_MIGRATION_EXPORT_HEADERS,override.b??[first]),
    generatedAt:new Date("2026-11-03T00:00:00.000Z"),
  };
}
describe("cutover evidence manifest (no DB and not a signed cutover)",()=>{
  it("captures exact source checksums and differentiates reconciled/unknown-history stock",()=>{
    const {audit,manifest}=createInventoryCutoverManifest(input());
    expect(audit).toMatchObject({ok:true,itemCount:2,movementCount:1,sourceStockTotal:24,unverifiedItems:1});
    expect(manifest).toMatchObject({
      format:"stordex-inventory-cutover-v1",
      generatedAt:"2026-11-03T00:00:00.000Z",
      checks:{itemCount:2,movementCount:1,unverifiedItems:1,currentStockTotal:24,inferredHistoricalOpeningTotal:10},
      cutover:{status:"NOT_CONFIRMED",atomicSnapshotVerified:false,
        businessWritesPausedVerified:false,requiresManualCutoverApproval:true},
      items:[
        {code:"NO-HIST",cutoverStock:9,history:"CUTOVER_ONLY_NO_HISTORY",
          inferredHistoricalOpening:null,lastHistoricalBalance:null,movementCount:0},
        {code:"STOCK-A",cutoverStock:15,history:"RECONCILED_LEDGER",
          inferredHistoricalOpening:10,lastHistoricalBalance:15,movementCount:1},
      ],
    });
    expect(manifest?.manifestId).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest?.source.itemsCsvSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest?.source.movementsCsvSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest?.tenantFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(manifest)).not.toContain("tenant-a");
  });
  it("gives the same immutable id for identical source files even at a later report time",()=>{
    const a=createInventoryCutoverManifest(input()).manifest!;
    const b=createInventoryCutoverManifest({
      ...input(),generatedAt:new Date("2026-12-02T00:00:00.000Z"),
    }).manifest!;
    expect(a.manifestId).toBe(b.manifestId);
    expect(a.generatedAt).not.toBe(b.generatedAt);
    expect(a.source).toEqual(b.source);
  });
  it("changes id on any source content change or when another tenant uploads identical bytes",()=>{
    const baseline=createInventoryCutoverManifest(input()).manifest!;
    const changedItem=createInventoryCutoverManifest(input({
      a:[{...item,name:"商品名変更"},noHistory],
    })).manifest!;
    const changedMovement=createInventoryCutoverManifest(input({
      b:[{...first,note:"備考変更"}],
    })).manifest!;
    const otherTenant=createInventoryCutoverManifest(input({tenant:"tenant-b"})).manifest!;
    expect(new Set([baseline.manifestId,changedItem.manifestId,
      changedMovement.manifestId,otherTenant.manifestId]).size).toBe(4);
  });
  it("never creates a manifest when the two CSVs do not reconcile",()=>{
    const failed=createInventoryCutoverManifest(input({
      a:[{...item,stock:14},noHistory],
    }));
    expect(failed.audit.ok).toBe(false);
    expect(failed.manifest).toBeNull();
    expect(failed.audit.errors.some(e=>e.field==="stock")).toBe(true);
  });
  it("rejects blank tenant identity",()=>{
    expect(()=>createInventoryCutoverManifest(input({tenant:" "}))).toThrow("Tenant");
  });
});