import { describe, it, expect } from "vitest";
import {
  validateBackupDirectory,
  parseClientVersion,
  assertBaselinedBackupState,
  assertBaselinedBackupToc,
} from "./backup-neon-staging-baselined.mjs";
import { APPLIED_BASELINE, INVENTORY_MIGRATION } from "./rehearse-neon-inventory-migration.mjs";

describe("post-baseline private Staging backup safety", () => {
  it("refuses relative/repository-local backup paths", () => {
    expect(() => validateBackupDirectory("backups")).toThrow();
    expect(() => validateBackupDirectory(process.cwd())).toThrow();
    expect(() => validateBackupDirectory(process.cwd() + "/backups")).toThrow();
    expect(validateBackupDirectory("/tmp/stordex-staging-baselined-test"))
      .toBe("/tmp/stordex-staging-baselined-test");
  });
  it("requires a modern pg_dump client", () => {
    expect(parseClientVersion("pg_dump (PostgreSQL) 16.15")).toBe(16);
    expect(parseClientVersion("pg_dump (PostgreSQL) 18.1")).toBe(18);
    expect(parseClientVersion("pg_restore (PostgreSQL) 16.15")).toBe(null);
  });
  it("allows exactly the four completed Prisma migration names and no fifth", () => {
    const valid = {state: "BASELINED", migrations: APPLIED_BASELINE};
    expect(assertBaselinedBackupState(valid)).toBe(valid);
    expect(() => assertBaselinedBackupState({...valid,state:"UNBASELINED"})).toThrow();
    expect(() => assertBaselinedBackupState({...valid,state:"MIGRATED"})).toThrow();
    expect(() => assertBaselinedBackupState({...valid,migrations:APPLIED_BASELINE.slice(0,3)})).toThrow();
    expect(() => assertBaselinedBackupState({...valid,migrations:[...APPLIED_BASELINE,INVENTORY_MIGRATION]})).toThrow();
    expect(() => assertBaselinedBackupState({...valid,migrations:[...APPLIED_BASELINE].reverse()})).toThrow();
  });
  it("requires table schemas AND table data for the Prisma ledger and app tables", () => {
    const tables = ["Tenant", "Item", "PurchaseOrder", "_prisma_migrations"];
    const toc = tables.flatMap((name,i)=>[
      (100+i) + "; 1259 200 TABLE public " + name + " owner",
      (200+i) + "; 0 200 TABLE DATA public " + name + " owner",
    ]).join("\n");
    expect(() => assertBaselinedBackupToc(toc)).not.toThrow();
    expect(() => assertBaselinedBackupToc(toc.replace("TABLE DATA public _prisma_migrations", "COMMENT public _prisma_migrations"))).toThrow();
    expect(() => assertBaselinedBackupToc(toc.replace("TABLE public Tenant", "COMMENT public Tenant"))).toThrow();
    expect(() => assertBaselinedBackupToc(toc.replace("TABLE DATA public Item", "COMMENT public Item"))).toThrow();
  });
});
