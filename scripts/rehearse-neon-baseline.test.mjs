import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BASELINED, PENDING_INVENTORY, assertCloneIdentity, compareCatalog, expectedBaselineCatalog, TARGET } from "./rehearse-neon-baseline.mjs";

describe("Neon migration baseline rehearsal guards", () => {
  const identity = {
    appEnv: "staging-rehearsal",
    url: new URL("postgresql://user:secret@ep-test.neon.tech/neondb?sslmode=require"),
    project: TARGET.project,
    branch: TARGET.branch,
    database: TARGET.database,
  };
  it("accepts only the server-verified, direct, disposable clone", () => {
    expect(() => assertCloneIdentity(identity)).not.toThrow();
    for (const patch of [
      { appEnv: "staging" },
      { branch: "br-sparkling-boat-ao9nrctp" },
      { branch: "br-dry-heart-ao0s2ngj" },
      { project: "another-project" },
      { url: new URL("postgresql://a:b@ep-test-pooler.neon.tech/neondb") },
      { url: new URL("postgresql://a:b@localhost/neondb") },
    ]) {
      expect(() => assertCloneIdentity({ ...identity, ...patch })).toThrow();
    }
  });
  it("matches precisely the four previously applied SQL migrations", () => {
    expect(BASELINED).toHaveLength(4);
    expect(BASELINED).not.toContain(PENDING_INVENTORY);
    const sources = BASELINED.map(name => readFileSync(join("prisma","migrations",name,"migration.sql"), "utf8"));
    const expected = expectedBaselineCatalog(sources);
    expect(Object.fromEntries(Object.entries(expected).map(([key,value]) => [key,value.size]))).toEqual({
      tables: 21, enums: 11, indexes: 59, constraints: 62, columns: 266,
    });
    expect(expected.columns.has("Item.stockPolicy")).toBe(false);
    expect(expected.columns.has("PurchaseOrderItem.packCount")).toBe(false);
    expect(expected.indexes.has("IntercompanyOrderItem_intercompanyOrderId_sourcePurchaseOrderIt")).toBe(true);
    expect(compareCatalog(expected,
      Object.fromEntries(Object.entries(expected).map(([key,value]) => [key,[...value]]))
    )).toEqual({});
  });
  it("rejects both missing and unexpected schema objects", () => {
    expect(compareCatalog(
      { tables: new Set(["Tenant"]), enums: [], indexes: [], constraints: [], columns: [] },
      { tables: ["Item"], enums: [], indexes: [], constraints: [], columns: [] },
    )).toEqual({ tables: { missing: ["Tenant"], extra: ["Item"] } });
  });
});
