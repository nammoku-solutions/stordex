/**
 * One-time guarded Staging repair of Prisma ledger, then inventory migration.
 * NO writes without --baseline / --inventory, a verified restore-tested backup,
 * matching fingerprints, and independent explicit product-owner approval.
 * NEVER use on Neon Production or a clone.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { APPLIED_BASELINE, INVENTORY_MIGRATION } from "./rehearse-neon-inventory-migration.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const STAGING_IDENTITY = Object.freeze({
  project: "dry-feather-14704968",
  branch: "br-sparkling-boat-ao9nrctp",
  database: "neondb",
});

export function assertStagingDatabaseIdentity({appEnv, connection, project, branch, database}) {
  if (appEnv !== "staging" ||
      !connection || !["postgres:", "postgresql:"].includes(connection.protocol) ||
      !connection.hostname.endsWith(".neon.tech") ||
      connection.hostname.includes("-pooler.") ||
      connection.pathname !== "/neondb" ||
      project !== STAGING_IDENTITY.project ||
      branch !== STAGING_IDENTITY.branch ||
      database !== STAGING_IDENTITY.database) {
    throw new Error("Connection is not verified direct Stordex Staging. STOP.");
  }
}

export function expectedBaselineCatalog(migrationSqls) {
  const sections = ["tables", "enums", "indexes", "constraints", "columns"];
  const result = Object.fromEntries(sections.map(key => [key, new Set()]));
  for (const sql of migrationSqls) {
    for (const m of sql.matchAll(/CREATE TYPE "([^"]+)"/g)) result.enums.add(m[1]);
    for (const m of sql.matchAll(/CREATE TABLE "([^"]+)"\s*\(([\s\S]*?)\n\);/g)) {
      result.tables.add(m[1]);
      for (const line of m[2].split("\n")) {
        const col = line.match(/^\s*"([^"]+)"\s+/);
        if (col) result.columns.add(m[1] + "." + col[1]);
      }
      for (const pk of m[2].matchAll(/CONSTRAINT "([^"]+)"/g)) {
        result.constraints.add(pk[1]);
        if (pk[1].endsWith("_pkey")) result.indexes.add(pk[1]);
      }
    }
    for (const m of sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)) {
      result.indexes.add(m[1].slice(0,63));
    }
    for (const m of sql.matchAll(/ADD CONSTRAINT "([^"]+)"/g)) result.constraints.add(m[1]);
  }
  return result;
}

export function compareCatalog(expected, actual) {
  const differences = {};
  for (const key of ["tables", "enums", "indexes", "constraints", "columns"]) {
    const a = new Set(expected[key]), b = new Set(actual[key]);
    const missing = [...a].filter(v=>!b.has(v));
    const extra = [...b].filter(v=>!a.has(v));
    if (missing.length || extra.length) differences[key] = {missing,extra};
  }
  return differences;
}

const expectedChain = [...APPLIED_BASELINE, INVENTORY_MIGRATION];
const BACKUP_SHA = "a8ef4098f48b0384cd52d208c4959c6f0578744b179df15e904c169681076db9";
const EXPECTED = Object.freeze({
  tenants: 2, items: 8, stock: "1655", purchase_orders: 5,
  purchase_lines: 5, movements: 14,
  item_fingerprint: "5e2f798f413fc90b89af0999b4290a5a",
  po_fingerprint: "8889fd4812acf85c9bc52dc1120a5ec6",
});

export function verifyBackupHash(actual, expected = BACKUP_SHA) {
  if (!/^[0-9a-f]{64}$/.test(actual) || actual !== expected) {
    throw new Error("Staging backup SHA-256 mismatch. STOP and investigate.");
  }
}
export function verifyExistingData(data, expected = EXPECTED) {
  const errors = Object.entries(expected).filter(([key, value]) => String(data[key]) !== String(value))
    .map(([key]) => key);
  if (errors.length) throw new Error("Staging differs from restore-tested backup: " + errors.join(", "));
}
export function classifyStagingMigrationState({ ledger, hasLedger, schema, checksums }) {
  if (!hasLedger && ledger.length) throw new Error("Ledger existence and rows disagree");
  for (let i = 0; i < ledger.length; i++) {
    const row = ledger[i];
    if (row.migration_name !== expectedChain[i] ||
        !row.finished_at || row.rolled_back_at ||
        row.checksum !== checksums[row.migration_name]) {
      throw new Error("Prisma migration ledger invalid: missing/reordered/failed/modified entry");
    }
  }
  let state;
  if (!hasLedger && ledger.length === 0) state = "UNBASELINED";
  else if (ledger.length === 4) state = "BASELINED";
  else if (ledger.length === 5) state = "MIGRATED";
  else throw new Error("Partial or unexpected Prisma migration history; STOP");
  const expectedSchema = state === "MIGRATED"
    ? { item_columns: 2, pack_columns: 3, enums: 2, index_count: 1 }
    : { item_columns: 0, pack_columns: 0, enums: 0, index_count: 0 };
  for (const [key, value] of Object.entries(expectedSchema)) {
    if (Number(schema[key]) !== value) {
      throw new Error("Unexpected inventory schema " + key + ": expected " + value +
        ", got " + String(schema[key]));
    }
  }
  return state;
}

function callPrisma(commandArgs, databaseUrl) {
  const cli = join(root, "node_modules", "prisma", "build", "index.js");
  const r = spawnSync(process.execPath, [cli, ...commandArgs], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit",
  });
  if (r.error || r.status !== 0) {
    throw new Error("Prisma CLI failed; stop, inspect Staging ledger before retrying");
  }
}

async function readChecksums() {
  const dirs = (await import("node:fs/promises")).readdir;
  const committed = (await dirs(join(root, "prisma", "migrations"), { withFileTypes: true }))
    .filter(d => d.isDirectory()).map(d => d.name).sort();
  if (JSON.stringify(committed) !== JSON.stringify(expectedChain)) {
    throw new Error("Unexpected migration set/order. STOP.");
  }
  const files = await Promise.all(expectedChain.map(name =>
    readFile(join(root, "prisma", "migrations", name, "migration.sql"))));
  const hashes = Object.fromEntries(files.map((sql, i) =>
    [expectedChain[i], createHash("sha256").update(sql).digest("hex")]));
  const baselineCatalog = expectedBaselineCatalog(files.slice(0, 4).map(f => f.toString("utf8")));
  return { hashes, baselineCatalog };
}

async function inspect(databaseUrl, hashes, baselineCatalog) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const identity = (await client.query(
      "SELECT current_setting('neon.project_id',true) AS project, " +
      "current_setting('neon.branch_id',true) AS branch, current_database() AS database"
    )).rows[0];
    assertStagingDatabaseIdentity({
      appEnv: process.env.APP_ENV,
      connection: new URL(databaseUrl), ...identity,
    });
    const existence = (await client.query(
      "SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has_ledger"
    )).rows[0].has_ledger;
    const ledger = existence ? (await client.query(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM public."_prisma_migrations" ORDER BY started_at, migration_name'
    )).rows : [];
    const schema = (await client.query(
      "SELECT " +
      "(SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' " +
      "AND table_name='Item' AND column_name IN ('stockPolicy','purchaseMode')) item_columns, " +
      "(SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' " +
      "AND table_name='PurchaseOrderItem' AND column_name IN ('packSize','packUnit','packCount')) pack_columns, " +
      "(SELECT count(DISTINCT t.typname)::int FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid " +
      "JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' " +
      "AND t.typname IN ('StockPolicy','PurchaseMode')) enums, " +
      "(SELECT count(*)::int FROM pg_indexes WHERE schemaname='public' " +
      "AND indexname='Item_tenantId_stockPolicy_active_idx') index_count"
    )).rows[0];
    const state = classifyStagingMigrationState({ ledger, hasLedger: existence, schema, checksums: hashes });
    // Before/after the ledger-only writes, require the full existing physical
    // schema catalog exactly matches all four previously applied migrations.
    if (state !== "MIGRATED") {
      const catalog = (await client.query(
        "SELECT " +
        "(SELECT json_agg(tablename) FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations') tables, " +
        "(SELECT json_agg(DISTINCT t.typname) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') enums, " +
        "(SELECT json_agg(indexname) FROM pg_indexes WHERE schemaname='public' AND tablename<>'_prisma_migrations') indexes, " +
        "(SELECT json_agg(table_name||'.'||column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations') columns, " +
        "(SELECT json_agg(con.conname) FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname<>'_prisma_migrations') constraints"
      )).rows[0];
      const diff = compareCatalog(baselineCatalog, Object.fromEntries(
        Object.entries(catalog).map(([k,v]) => [k,v || []])));
      if (Object.keys(diff).length) {
        throw new Error("Staging physical baseline schema drift: " + JSON.stringify(diff));
      }
    } else {
      const extra = (await client.query(
        "SELECT (SELECT count(*)::int FROM \"Item\" WHERE \"stockPolicy\"<>'STOCKED' " +
        "OR \"purchaseMode\"<>'UNIT') changed_items, " +
        "(SELECT count(*)::int FROM \"PurchaseOrderItem\" WHERE \"packSize\" IS NOT NULL " +
        "OR \"packUnit\" IS NOT NULL OR \"packCount\" IS NOT NULL) populated_snapshots"
      )).rows[0];
      if (extra.changed_items || extra.populated_snapshots) {
        throw new Error("Preexisting records have unexpected inventory defaults/snapshots");
      }
    }
    const data = (await client.query(
      "SELECT " +
      "(SELECT count(*)::int FROM \"Tenant\") tenants, " +
      "(SELECT count(*)::int FROM \"Item\") items, " +
      "(SELECT coalesce(sum(stock),0)::bigint FROM \"Item\") stock, " +
      "(SELECT count(*)::int FROM \"PurchaseOrder\") purchase_orders, " +
      "(SELECT count(*)::int FROM \"PurchaseOrderItem\") purchase_lines, " +
      "(SELECT count(*)::int FROM \"InventoryMovement\") movements, " +
      "(SELECT md5(coalesce(string_agg(\"id\"||':'||stock::text,'|' ORDER BY \"id\"),'')) FROM \"Item\") item_fingerprint, " +
      "(SELECT md5(coalesce(string_agg(\"id\"||':'||quantity::text||':'||received::text,'|' ORDER BY \"id\"),'')) FROM \"PurchaseOrderItem\") po_fingerprint"
    )).rows[0];
    verifyExistingData(data);
    return { identity, state, schema, data, migrations: ledger.map(x=>x.migration_name) };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

async function assertVerifiedBackup(archive) {
  if (!archive || !resolve(archive).startsWith(resolve(process.env.HOME || "/") + "/")) {
    throw new Error("Set STORDEX_STAGING_BACKUP_ARCHIVE to the private locally restored .dump");
  }
  if (!archive.endsWith(".dump")) throw new Error("Expected PostgreSQL custom-format backup");
  const file = await stat(archive);
  if (!file.isFile() || file.size !== 67396) throw new Error("Archive size mismatch");
  if ((file.mode & 0o077) !== 0) throw new Error("Backup must not be group/world readable");
  const sha = createHash("sha256");
  for await (const chunk of createReadStream(archive)) sha.update(chunk);
  verifyBackupHash(sha.digest("hex"));
}

async function main() {
  const mode = process.argv[2] || "--check";
  if (!["--check","--baseline","--inventory"].includes(mode) || process.argv.length > 3) {
    throw new Error("Use --check, --baseline or --inventory");
  }
  if (process.env.APP_ENV !== "staging" || !process.env.DATABASE_URL) {
    throw new Error("APP_ENV=staging and Staging DATABASE_URL required");
  }
  const url = new URL(process.env.DATABASE_URL);
  if (!["postgres:","postgresql:"].includes(url.protocol) ||
      !url.hostname.endsWith(".neon.tech") || url.hostname.includes("-pooler.") ||
      url.pathname !== "/neondb") {
    throw new Error("Use direct Staging Neon neondb URL, never pooled, clone, or local");
  }
  const { hashes, baselineCatalog } = await readChecksums();
  await assertVerifiedBackup(process.env.STORDEX_STAGING_BACKUP_ARCHIVE);
  const before = await inspect(process.env.DATABASE_URL, hashes, baselineCatalog);
  console.log(JSON.stringify({ mode, target: STAGING_IDENTITY, state: before.state,
    data: before.data, migrations: before.migrations, backupSha256: BACKUP_SHA }, null, 2));
  if (mode === "--check") return;
  if (mode === "--baseline" && before.state !== "UNBASELINED") {
    throw new Error("Baseline requires NO existing ledger; check partial history first");
  }
  if (mode === "--inventory" && before.state !== "BASELINED") {
    throw new Error("Inventory deployment requires exactly four complete baselined migrations");
  }
  if (process.env.STORDEX_STAGING_WRITE_APPROVAL !== mode + "-on-" + STAGING_IDENTITY.branch) {
    throw new Error("Explicit scoped Staging write approval variable required");
  }
  if (mode === "--baseline") {
    for (const name of APPLIED_BASELINE) {
      callPrisma(["migrate", "resolve", "--applied", name], process.env.DATABASE_URL);
    }
  } else {
    callPrisma(["migrate", "deploy"], process.env.DATABASE_URL);
  }
  const after = await inspect(process.env.DATABASE_URL, hashes, baselineCatalog);
  const intended = mode === "--baseline" ? "BASELINED" : "MIGRATED";
  if (after.state !== intended ||
      JSON.stringify(after.data) !== JSON.stringify(before.data)) {
    throw new Error("Post-write Staging ledger or data mismatch. STOP and investigate.");
  }
  console.log("PASS: " + mode + " completed on verified Staging, existing records unchanged.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(e => { console.error("Staging migration stopped:", e.message); process.exitCode = 2; });
}
