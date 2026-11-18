import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateMigrationState, inspectStagingMigrationLedger, readCommittedMigrations, requireStagingConnection,
} from "./preflight-staging-migrations.mjs";

const committed = ["20260828090000_init", "20261016070000_trading_connections", "20261016093000_intercompany_orders"];
const checksums = new Map(committed.map((name, index) => [name, String(index + 1).repeat(64)]));
const applied = committed.map(migration_name => ({
  migration_name,
  checksum: checksums.get(migration_name),
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
      committed, checksums, applied: [...applied.slice(0,2), {migration_name:"other",finished_at:new Date(),rolled_back_at:null},
        {migration_name:committed[2],finished_at:null,rolled_back_at:null}],
      hasLedger:true, tables:["Tenant","_prisma_migrations"],
    });
    expect(result).toMatchObject({ok:false,reason:"INCONSISTENT_MIGRATION_LEDGER"});
    expect(result.unknown).toEqual(["other"]);
    expect(result.incomplete).toEqual([committed[2]]);
    expect(result.missing).toEqual([committed[2]]);
  });
  it("permits a populated DB only when completed records match the repository checksums", () => {
    expect(evaluateMigrationState({
      committed, checksums, applied, hasLedger:true, tables:["Tenant","Order","_prisma_migrations"],
    })).toMatchObject({ok:true,reason:"READY",missing:[]});
  });
  it("rejects modified SQL, missing checksums, and duplicate completed ledger entries", () => {
    const result = evaluateMigrationState({
      committed, checksums,
      applied: [{ ...applied[0], checksum: "f".repeat(64) }, { ...applied[1], checksum: null }, applied[2], applied[2]],
      hasLedger: true, tables: ["_prisma_migrations"],
    });
    expect(result).toMatchObject({
      ok: false, reason: "INCONSISTENT_MIGRATION_LEDGER",
      checksumMismatch: [committed[0], committed[1]], duplicates: [committed[2]],
    });
  });
  it("accepts a rolled-back historical attempt after an identical migration completed once", () => {
    expect(evaluateMigrationState({
      committed, checksums, applied: [...applied, { ...applied[0], finished_at: null, rolled_back_at: new Date() }],
      hasLedger: true, tables: ["_prisma_migrations"],
    }).ok).toBe(true);
  });
  it("hashes only SQL from committed migration folders, using the exact file bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stordex-preflight-test-"));
    try {
      const sql = Buffer.from("-- comment.\r\nSELECT 1;\r\n");
      await mkdir(join(directory, committed[0]));
      await writeFile(join(directory, committed[0], "migration.sql"), sql);
      await writeFile(join(directory, "migration_lock.toml"), 'provider = "postgresql"\n');
      const manifest = await readCommittedMigrations(directory);
      expect(manifest.committed).toEqual([committed[0]]);
      expect(manifest.checksums.get(committed[0])).toBe(createHash("sha256").update(sql).digest("hex"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.each([
    { APP_ENV: "production", DATABASE_URL: "postgresql://fake.neon.tech/neondb" },
    { APP_ENV: "staging", DATABASE_URL: "postgresql://localhost/neondb" },
    { APP_ENV: "staging", DATABASE_URL: "postgresql://fake.neon.tech/other" },
    { APP_ENV: "staging", DATABASE_URL: "not a URL" },
  ])("rejects invalid connection configuration before connecting", environment => {
    expect(() => requireStagingConnection(environment)).toThrow();
  });
  const source = { project: "dry-feather-14704968", branch: "br-sparkling-boat-ao9nrctp", database: "neondb" };
  it.each([
    { ...source, project: "delicate-rice-23940930" },
    { ...source, branch: "br-ancient-voice-aoutl8qq" },
    { ...source, database: "not-neondb" },
    { ...source, branch: null },
  ])("rolls back before reading schemas or ledger on a different or unattested target", async identity => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({rows: [identity]})
      .mockResolvedValueOnce({});
    await expect(inspectStagingMigrationLedger({query}, {committed, checksums})).rejects.toThrow("did not attest");
    expect(query.mock.calls).toEqual([
      ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"],
      [expect.stringContaining("neon.branch_id")],
      ["ROLLBACK"],
    ]);
  });
  it("reads and reports the attested account and migration history in one read-only transaction", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({rows: [source]})
      .mockResolvedValueOnce({rows: [{table_name: "_prisma_migrations"}, {table_name: "Tenant"}]})
      .mockResolvedValueOnce({rows: [{exists: true}]})
      .mockResolvedValueOnce({rows: applied})
      .mockResolvedValueOnce({});
    expect(await inspectStagingMigrationLedger({query}, {committed, checksums}))
      .toMatchObject({ ...source, ok: true, tableCount: 2, appliedMigrations: committed });
    expect(query.mock.calls.at(-2)[0]).toContain("SELECT migration_name, checksum");
    expect(query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
  });
});
