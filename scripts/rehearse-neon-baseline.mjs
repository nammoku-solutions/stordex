/**
 * Clone-only Prisma migration-baseline rehearsal.
 * Default --check is READ ONLY; --execute uses the official Prisma CLI.
 * Refuses the populated Staging branch and the default/Production branch.
 */
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TARGET = Object.freeze({
  project: "dry-feather-14704968",
  branch: "br-solitary-tooth-aoom13fn",
  database: "neondb",
});
export const BASELINED = Object.freeze([
  "20260828093000_initial",
  "20261016070000_trading_connections",
  "20261016093000_intercompany_orders",
  "20261016110000_csv_import_jobs",
]);
export const PENDING_INVENTORY = "20261019090000_inventory_policy_purchase_mode";
const sections = ["tables", "enums", "indexes", "constraints", "columns"];

export function assertCloneIdentity({ appEnv, url, project, branch, database }) {
  if (appEnv !== "staging-rehearsal") {
    throw new Error("APP_ENV must be staging-rehearsal");
  }
  if (!url || !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname.endsWith(".neon.tech") ||
      url.hostname.includes("-pooler.")) {
    throw new Error("A direct Neon PostgreSQL URL is mandatory");
  }
  if (url.pathname !== "/" + TARGET.database ||
      project !== TARGET.project || branch !== TARGET.branch ||
      database !== TARGET.database) {
    throw new Error("Database identity is not the pinned disposable rehearsal clone; STOP");
  }
}

export function expectedBaselineCatalog(migrationSqls) {
  const result = Object.fromEntries(sections.map(key => [key, new Set()]));
  for (const sql of migrationSqls) {
    for (const m of sql.matchAll(/CREATE TYPE "([^"]+)"/g)) {
      result.enums.add(m[1]);
    }
    for (const m of sql.matchAll(/CREATE TABLE "([^"]+)"\s*\(([\s\S]*?)\n\);/g)) {
      result.tables.add(m[1]);
      for (const line of m[2].split("\n")) {
        const column = line.match(/^\s*"([^"]+)"\s+/);
        if (column) result.columns.add(m[1] + "." + column[1]);
      }
      for (const c of m[2].matchAll(/CONSTRAINT "([^"]+)"/g)) {
        result.constraints.add(c[1]);
        if (c[1].endsWith("_pkey")) result.indexes.add(c[1]);
      }
    }
    for (const m of sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)) {
      // PostgreSQL truncates identifiers at 63 bytes; names here are ASCII.
      result.indexes.add(m[1].slice(0, 63));
    }
    for (const m of sql.matchAll(/ADD CONSTRAINT "([^"]+)"/g)) {
      result.constraints.add(m[1]);
    }
  }
  return result;
}

export function compareCatalog(expected, actual) {
  const differences = {};
  for (const key of sections) {
    const left = expected[key] instanceof Set ? expected[key] : new Set(expected[key]);
    const right = new Set(actual[key]);
    const missing = [...left].filter(name => !right.has(name));
    const extra = [...right].filter(name => !left.has(name));
    if (missing.length || extra.length) differences[key] = { missing, extra };
  }
  return differences;
}

async function inspectDatabase(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const identity = (await client.query(
      "SELECT current_setting('neon.project_id',true) AS project, current_setting('neon.branch_id',true) AS branch, current_database() AS database"
    )).rows[0];
    assertCloneIdentity({
      appEnv: process.env.APP_ENV, url: new URL(connectionString), ...identity,
    });
    const sql = [
      "SELECT",
      "  (SELECT json_agg(tablename) FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations') AS tables,",
      "  (SELECT json_agg(DISTINCT t.typname) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS enums,",
      "  (SELECT json_agg(indexname) FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations') AS indexes,",
      "  (SELECT json_agg(table_name||'.'||column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations') AS columns,",
      "  (SELECT json_agg(con.conname) FROM pg_constraint con JOIN pg_class cls ON cls.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=cls.relnamespace WHERE ns.nspname='public' AND cls.relname <> '_prisma_migrations') AS constraints",
    ].join("\n");
    const row = (await client.query(sql)).rows[0];
    const catalog = Object.fromEntries(sections.map(key => [key, row[key] || []]));
    const ledgerExists = (await client.query(
      "SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present"
    )).rows[0].present;
    const ledger = ledgerExists
      ? (await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM public."_prisma_migrations" ORDER BY started_at, migration_name')).rows
      : [];
    const tenants = (await client.query('SELECT count(*)::int AS n FROM "Tenant"')).rows[0].n;
    return { catalog, ledgerExists, ledger, tenants };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

function ledgerIsBaseline(ledger) {
  return ledger.length === BASELINED.length && BASELINED.every((name, i) =>
    ledger[i].migration_name === name &&
    ledger[i].finished_at && !ledger[i].rolled_back_at &&
    /^[0-9a-f]{64}$/i.test(ledger[i].checksum)
  );
}

async function main() {
  const mode = process.argv[2] || "--check";
  if (!["--check", "--execute"].includes(mode) || process.argv.length > 3) {
    throw new Error("Use --check (read-only default) or --execute (clone ledger only)");
  }
  if (process.env.APP_ENV !== "staging-rehearsal" || !process.env.DATABASE_URL) {
    throw new Error("APP_ENV=staging-rehearsal and DATABASE_URL are required");
  }
  const url = new URL(process.env.DATABASE_URL);
  // Reject unsafe connection parameters before opening any connection.
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname.endsWith(".neon.tech") ||
      url.hostname.includes("-pooler.") ||
      url.pathname !== "/" + TARGET.database) {
    throw new Error("A direct neondb Neon connection is required");
  }
  const sqls = await Promise.all(BASELINED.map(name =>
    readFile(join(root, "prisma", "migrations", name, "migration.sql"), "utf8")
  ));
  const expected = expectedBaselineCatalog(sqls);
  const before = await inspectDatabase(process.env.DATABASE_URL);
  const diff = compareCatalog(expected, before.catalog);
  if (Object.keys(diff).length) {
    throw new Error("Physical DB differs from the existing migrations: " + JSON.stringify(diff));
  }
  if (before.ledgerExists && !ledgerIsBaseline(before.ledger)) {
    throw new Error("Existing Prisma ledger is not the exact four-migration baseline; STOP");
  }
  console.log(JSON.stringify({
    operation: mode, target: TARGET,
    matchedObjects: Object.fromEntries(sections.map(x => [x, expected[x].size])),
    tenants: before.tenants,
    applied: before.ledger.map(x => x.migration_name),
    nextPendingMigration: PENDING_INVENTORY,
  }, null, 2));
  if (mode === "--check") return;
  if (before.ledgerExists) {
    console.log("Already baselined in the clone; no writes made.");
    return;
  }
  if (process.env.STORDEX_BASELINE_CONFIRM !== "apply-on-" + TARGET.branch) {
    throw new Error("Execution requires STORDEX_BASELINE_CONFIRM=apply-on-" + TARGET.branch);
  }
  const prismaCli = join(root, "node_modules", "prisma", "build", "index.js");
  for (const name of BASELINED) {
    const result = spawnSync(process.execPath,
      [prismaCli, "migrate", "resolve", "--applied", name],
      { cwd: root, env: process.env, stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error("Prisma resolve failed at " + name + "; inspect clone ledger, never retry against Staging");
    }
  }
  const after = await inspectDatabase(process.env.DATABASE_URL);
  if (!ledgerIsBaseline(after.ledger) ||
      Object.keys(compareCatalog(expected, after.catalog)).length ||
      after.tenants !== before.tenants) {
    throw new Error("Clone verification failed: ledger/schema/tenant count mismatch");
  }
  console.log("PASS: exact four-migration Prisma ledger recorded on isolated clone. Inventory migration remains pending.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error("Rehearsal stopped:", error.message); process.exitCode = 2; });
}
