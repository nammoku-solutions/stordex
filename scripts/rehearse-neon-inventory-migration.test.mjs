import { describe, expect, it } from "vitest";
import {
  REHEARSAL_TARGET, APPLIED_BASELINE, INVENTORY_MIGRATION,
  assertRehearsalTarget, assessMigrationState, assertInventorySchema,
} from "./rehearse-neon-inventory-migration.mjs";

describe("Neon clone-only inventory migration guards", () => {
  const target = {
    env: "staging-rehearsal",
    connection: new URL("postgresql://owner:secret@ep-example.neon.tech/neondb?sslmode=require"),
    project: REHEARSAL_TARGET.project,
    branch: REHEARSAL_TARGET.branch,
    database: REHEARSAL_TARGET.database,
  };
  it("verifies the server-reported clone identity, rejects staging/production/pooled URLs", () => {
    expect(() => assertRehearsalTarget(target)).not.toThrow();
    for (const patch of [
      { env: "staging" },
      { project: "different-project" },
      { branch: "br-sparkling-boat-ao9nrctp" },
      { branch: "br-dry-heart-ao0s2ngj" },
      { database: "postgres" },
      { connection: new URL("postgresql://owner:secret@ep-example-pooler.neon.tech/neondb") },
      { connection: new URL("postgresql://owner:secret@localhost/neondb") },
    ]) {
      expect(() => assertRehearsalTarget({ ...target, ...patch })).toThrow();
    }
  });
  const migrations = [...APPLIED_BASELINE, INVENTORY_MIGRATION];
  const checksums = Object.fromEntries(migrations.map(name => [name, "a".repeat(64)]));
  const complete = migrations.map(name => ({
    migration_name: name,
    checksum: checksums[name],
    finished_at: new Date("2026-10-23"),
    rolled_back_at: null,
  }));
  it("only accepts the exact 4-migration prefix or completed 5-migration chain", () => {
    expect(assessMigrationState(complete.slice(0, 4), checksums)).toBe("PENDING");
    expect(assessMigrationState(complete, checksums)).toBe("APPLIED");
    for (const invalid of [
      complete.slice(0, 3),
      [complete[1], complete[0], complete[2], complete[3]],
      [...complete.slice(0, 4), complete[3]],
      complete.map((row, i) => i === 2 ? { ...row, checksum: "b".repeat(64) } : row),
      complete.map((row, i) => i === 1 ? { ...row, finished_at: null } : row),
      complete.map((row, i) => i === 1 ? { ...row, rolled_back_at: new Date() } : row),
    ]) {
      expect(() => assessMigrationState(invalid, checksums)).toThrow();
    }
  });
  it("rejects partial inventory schema application or unexpected existing columns", () => {
    expect(() => assertInventorySchema("PENDING",
      { itemColumns: 0, packColumns: 0, enums: 0, indexCount: 0 })).not.toThrow();
    expect(() => assertInventorySchema("APPLIED",
      { itemColumns: 2, packColumns: 3, enums: 2, indexCount: 1 })).not.toThrow();
    expect(() => assertInventorySchema("PENDING",
      { itemColumns: 2, packColumns: 3, enums: 2, indexCount: 1 })).toThrow();
    expect(() => assertInventorySchema("APPLIED",
      { itemColumns: 2, packColumns: 1, enums: 2, indexCount: 1 })).toThrow();
  });
});
