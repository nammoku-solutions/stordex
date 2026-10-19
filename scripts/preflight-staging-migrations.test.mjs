import { describe, it, expect } from "vitest";
import { evaluateMigrationState } from "./preflight-staging-migrations.mjs";

const committed = ["20260828090000_init", "20261016070000_trading_connections", "20261016093000_intercompany_orders"];
const applied = committed.map(migration_name => ({
  migration_name,
  finished_at: new Date("2026-10-19T00:00:00Z"),
  rolled_back_at: null,
}));

describe("read-only Neon Staging migration preflight", () => {
  it("blocks the real risk: a populated schema without Prisma history", () => {
    const result = evaluateMigrationState({
      committed, applied: [], hasLedger: false, tables: ["Tenant", "Order", "Item"],
    });
    expect(result).toMatchObject({ok:false, reason:"POPULATED_DATABASE_WITHOUT_LEDGER"});
  });
  it("blocks databases with no ledger, even if empty, pending environment confirmation", () => {
    expect(evaluateMigrationState({
      committed, applied: [], hasLedger: false, tables: [],
    }).reason).toBe("NO_MIGRATION_LEDGER");
  });
  it("rejects missing, unrecognized and unfinished migration records", () => {
    const result = evaluateMigrationState({
      committed, applied: [...applied.slice(0,2), {migration_name:"other",finished_at:new Date(),rolled_back_at:null},
        {migration_name:committed[2],finished_at:null,rolled_back_at:null}],
      hasLedger:true, tables:["Tenant","_prisma_migrations"],
    });
    expect(result).toMatchObject({ok:false,reason:"INCONSISTENT_MIGRATION_LEDGER"});
    expect(result.unknown).toEqual(["other"]);
    expect(result.incomplete).toEqual([committed[2]]);
    expect(result.missing).toEqual([committed[2]]);
  });
  it("permits a populated DB only when committed migrations are all recorded as finished", () => {
    expect(evaluateMigrationState({
      committed, applied, hasLedger:true, tables:["Tenant","Order","_prisma_migrations"],
    })).toMatchObject({ok:true,reason:"READY",missing:[]});
  });
});
