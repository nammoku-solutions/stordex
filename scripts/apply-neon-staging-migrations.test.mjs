import { describe, it, expect } from "vitest";
import { verifyBackupHash, verifyExistingData, classifyStagingMigrationState } from "./apply-neon-staging-migrations.mjs";
import { APPLIED_BASELINE, INVENTORY_MIGRATION } from "./rehearse-neon-inventory-migration.mjs";

describe("guarded Staging database migration", () => {
  const migrations = [...APPLIED_BASELINE, INVENTORY_MIGRATION];
  const checksums = Object.fromEntries(migrations.map(x=>[x,"a".repeat(64)]));
  const rows = migrations.map(name=>({
    migration_name:name, checksum:checksums[name], finished_at:new Date(), rolled_back_at:null,
  }));
  const noSchema = {item_columns:0,pack_columns:0,enums:0,index_count:0};
  const inventorySchema = {item_columns:2,pack_columns:3,enums:2,index_count:1};
  it("gates baseline and inventory to exact complete ledger state",()=>{
    expect(classifyStagingMigrationState({ledger:[],hasLedger:false,schema:noSchema,checksums})).toBe("UNBASELINED");
    expect(classifyStagingMigrationState({ledger:rows.slice(0,4),hasLedger:true,schema:noSchema,checksums})).toBe("BASELINED");
    expect(classifyStagingMigrationState({ledger:rows,hasLedger:true,schema:inventorySchema,checksums})).toBe("MIGRATED");
    expect(()=>classifyStagingMigrationState({ledger:rows.slice(0,3),hasLedger:true,schema:noSchema,checksums})).toThrow();
    expect(()=>classifyStagingMigrationState({ledger:rows.slice(0,4),hasLedger:true,schema:inventorySchema,checksums})).toThrow();
    expect(()=>classifyStagingMigrationState({ledger:rows.slice(0,3).concat(rows[4]),hasLedger:true,schema:noSchema,checksums})).toThrow();
    expect(()=>classifyStagingMigrationState({ledger:rows.map((x,i)=>i===2?{...x,checksum:"b".repeat(64)}:x),hasLedger:true,schema:inventorySchema,checksums})).toThrow();
  });
  it("requires the exact restore-tested archive digest",()=>{
    expect(()=>verifyBackupHash("a8ef4098f48b0384cd52d208c4959c6f0578744b179df15e904c169681076db9")).not.toThrow();
    expect(()=>verifyBackupHash("b".repeat(64))).toThrow();
  });
  it("checks restored data counts and both fingerprints",()=>{
    const data={tenants:2,items:8,stock:"1655",purchase_orders:5,purchase_lines:5,movements:14,
      item_fingerprint:"5e2f798f413fc90b89af0999b4290a5a",
      po_fingerprint:"8889fd4812acf85c9bc52dc1120a5ec6"};
    expect(()=>verifyExistingData(data)).not.toThrow();
    expect(()=>verifyExistingData({...data,stock:"1654"})).toThrow();
    expect(()=>verifyExistingData({...data,po_fingerprint:"changed"})).toThrow();
  });
});
