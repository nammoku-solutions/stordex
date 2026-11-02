import { describe, it, expect } from "vitest";
import { verifyBackupHash, verifyBackupArchiveMetadata, verifyExistingData, classifyStagingMigrationState, safeFailureDetails, expectedStagingApprovalToken } from "./apply-neon-staging-migrations.mjs";
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
    expect(()=>verifyBackupHash("e768bf09ad96312af7d69d698ac384799422105466c6e87ebfa9d0df1d4591bd")).not.toThrow();
    expect(()=>verifyBackupHash("25e423f4d206cdd6c92a37821d1328393324f9e09fd2de3f2283666bbb5ab782")).toThrow();
    expect(()=>verifyBackupHash("b".repeat(64))).toThrow();
    expect(()=>verifyBackupHash("a8ef4098f48b0384cd52d208c4959c6f0578744b179df15e904c169681076db9")).toThrow();
  });
  it("requires the exact new restored archive basename and byte size",()=>{
    const file={isFile:()=>true,size:69078};
    expect(()=>verifyBackupArchiveMetadata("stordex-staging-baselined-2026-11-02T11-52-58-977Z-28c36970.dump",file)).not.toThrow();
    expect(()=>verifyBackupArchiveMetadata("stordex-staging-2026-11-02T03-40-46-770Z-d904d805.dump",file)).toThrow();
    expect(()=>verifyBackupArchiveMetadata("stordex-staging-baselined-2026-11-02T11-52-58-977Z-28c36970.dump",{...file,size:67396})).toThrow();
    expect(()=>verifyBackupArchiveMetadata("stordex-staging-baselined-2026-11-02T11-52-58-977Z-28c36970.dump",{isFile:()=>false,size:69078})).toThrow();
    expect(()=>verifyBackupArchiveMetadata("stordex-staging-baselined-2026-11-02T11-52-58-977Z-28c36970.dump.tmp",file)).toThrow();
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


describe("Staging failure diagnostics (no secret exposure)", () => {
  it("retains nested network errors when AggregateError.message is empty", () => {
    const inner = Object.assign(new Error("connect ETIMEDOUT 10.0.0.1:5432"), { code: "ETIMEDOUT" });
    const outer = new AggregateError([inner], "");
    const detail = safeFailureDetails(outer, "staging_preflight_connect_and_validate");
    expect(detail.phase).toBe("staging_preflight_connect_and_validate");
    expect(detail.message).toBe("(empty error message)");
    expect(detail.nested[0].code).toBe("ETIMEDOUT");
  });
  it("redacts passwords, full database URLs and PostgreSQL URI fragments", () => {
    const url = "postgresql://neondb_owner:secret123@ep-abc.neon.tech/neondb?sslmode=require";
    const error = Object.assign(
      new Error("Failed connecting " + url + " password secret123"),
      {code:"ECONNREFUSED"},
    );
    const detail = JSON.stringify(safeFailureDetails(error, "staging_preflight_connect_and_validate", {
      DATABASE_URL: url,
    }));
    expect(detail).toContain("ECONNREFUSED");
    expect(detail).not.toContain("secret123");
    expect(detail).not.toContain("postgresql://");
  });
});

describe("Staging write authorization token regression", () => {
  it("correctly strips the CLI flag prefix for baseline only", () => {
    expect(expectedStagingApprovalToken("--baseline")).toBe("baseline-on-br-sparkling-boat-ao9nrctp");
    expect(expectedStagingApprovalToken("--baseline")).not.toBe("--baseline-on-br-sparkling-boat-ao9nrctp");
  });
  it("keeps inventory approval entirely separate and refuses check/unknown modes", () => {
    expect(expectedStagingApprovalToken("--inventory")).toBe("inventory-on-br-sparkling-boat-ao9nrctp");
    expect(expectedStagingApprovalToken("--inventory")).not.toBe(expectedStagingApprovalToken("--baseline"));
    expect(() => expectedStagingApprovalToken("--check")).toThrow();
    expect(() => expectedStagingApprovalToken("baseline")).toThrow();
    expect(() => expectedStagingApprovalToken("--baseline-on-br-sparkling-boat-ao9nrctp")).toThrow();
  });
});
