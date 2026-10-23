/**
 * Inventory-migration rehearsal on a specific disposable Neon clone ONLY.
 *
 * --check   is read-only; checks branch identity, migration history and schema.
 * --execute invokes official Prisma migrate deploy after an explicit clone-only
 * confirmation; then re-verifies schema, ledger and existing application data.
 *
 * Never use this tool to alter the real Neon Staging or Production branches.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationDir = join(root, "prisma", "migrations");
export const REHEARSAL_TARGET = Object.freeze({
  project: "dry-feather-14704968",
  branch: "br-solitary-tooth-aoom13fn",
  database: "neondb",
});
export const APPLIED_BASELINE = Object.freeze([
  "20260828093000_initial",
  "20261016070000_trading_connections",
  "20261016093000_intercompany_orders",
  "20261016110000_csv_import_jobs",
]);
export const INVENTORY_MIGRATION = "20261019090000_inventory_policy_purchase_mode";
const expectedMigrations = [...APPLIED_BASELINE, INVENTORY_MIGRATION];

export function assertRehearsalTarget({ env, connection, project, branch, database }) {
  if (env !== "staging-rehearsal") {
    throw new Error("APP_ENV must be staging-rehearsal");
  }
  if (!connection || !["postgres:", "postgresql:"].includes(connection.protocol) ||
      !connection.hostname.endsWith(".neon.tech") ||
      connection.hostname.includes("-pooler.") ||
      connection.pathname !== "/" + REHEARSAL_TARGET.database) {
    throw new Error("Use the direct (non-pooled) URL for the pinned Neon clone");
  }
  if (project !== REHEARSAL_TARGET.project ||
      branch !== REHEARSAL_TARGET.branch ||
      database !== REHEARSAL_TARGET.database) {
    throw new Error("Neon server identity is not the disposable clone. STOP.");
  }
}

export function assessMigrationState(rows, expectedChecksums) {
  if (rows.length !== APPLIED_BASELINE.length &&
      rows.length !== expectedMigrations.length) {
    throw new Error("Unexpected number of applied migrations: " + rows.length);
  }
  for (let index = 0; index < rows.length; index++) {
    const record = rows[index];
    if (record.migration_name !== expectedMigrations[index] ||
        !record.finished_at || record.rolled_back_at ||
        record.checksum !== expectedChecksums[record.migration_name]) {
      throw new Error("Prisma ledger has a missing, reordered, failed, or altered migration");
    }
  }
  return rows.length === expectedMigrations.length ? "APPLIED" : "PENDING";
}

export function assertInventorySchema(state, schema) {
  const expected = state === "APPLIED"
    ? { itemColumns: 2, packColumns: 3, enums: 2, indexCount: 1 }
    : { itemColumns: 0, packColumns: 0, enums: 0, indexCount: 0 };
  for (const [key, value] of Object.entries(expected)) {
    if (Number(schema[key]) !== value) {
      throw new Error("Inventory schema " + key + " is " + schema[key] + ", expected " + value);
    }
  }
}

async function inspect(connectionString, checksums) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const identity = (await client.query(
      "SELECT current_setting('neon.project_id', true) AS project, " +
      "current_setting('neon.branch_id', true) AS branch, " +
      "current_database() AS database"
    )).rows[0];
    assertRehearsalTarget({
      env: process.env.APP_ENV,
      connection: new URL(connectionString),
      ...identity,
    });
    const ledger = (await client.query(
      'SELECT migration_name, checksum, finished_at, rolled_back_at ' +
      'FROM public."_prisma_migrations" ORDER BY started_at, migration_name'
    )).rows;
    const state = assessMigrationState(ledger, checksums);
    const schema = (await client.query(
      "SELECT " +
      "(SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' " +
      "AND table_name='Item' AND column_name IN ('stockPolicy','purchaseMode')) AS \"itemColumns\", " +
      "(SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' " +
      "AND table_name='PurchaseOrderItem' AND column_name IN ('packSize','packUnit','packCount')) AS \"packColumns\", " +
      "(SELECT count(DISTINCT t.typname)::int FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid " +
      "JOIN pg_namespace ns ON ns.oid=t.typnamespace WHERE ns.nspname='public' " +
      "AND t.typname IN ('StockPolicy','PurchaseMode')) AS enums, " +
      "(SELECT count(*)::int FROM pg_indexes WHERE schemaname='public' " +
      "AND indexname='Item_tenantId_stockPolicy_active_idx') AS \"indexCount\""
    )).rows[0];
    assertInventorySchema(state, schema);
    const data = (await client.query(
      "SELECT " +
      "(SELECT count(*)::int FROM \"Tenant\") AS tenants, " +
      "(SELECT count(*)::int FROM \"Item\") AS items, " +
      "(SELECT coalesce(sum(stock),0)::bigint FROM \"Item\") AS stock, " +
      "(SELECT count(*)::int FROM \"PurchaseOrder\") AS purchase_orders, " +
      "(SELECT count(*)::int FROM \"PurchaseOrderItem\") AS purchase_lines, " +
      "(SELECT count(*)::int FROM \"InventoryMovement\") AS movements, " +
      "(SELECT md5(coalesce(string_agg(\"id\"||':'||stock::text, '|' ORDER BY \"id\"),'')) " +
      " FROM \"Item\") AS item_fingerprint, " +
      "(SELECT md5(coalesce(string_agg(\"id\"||':'||quantity::text||':'||received::text, '|' ORDER BY \"id\"),'')) " +
      " FROM \"PurchaseOrderItem\") AS po_fingerprint"
    )).rows[0];
    if (state === "APPLIED") {
      const nonDefaults = (await client.query(
        "SELECT " +
        "(SELECT count(*)::int FROM \"Item\" WHERE \"stockPolicy\" <> 'STOCKED' OR \"purchaseMode\" <> 'UNIT') AS non_default_items, " +
        "(SELECT count(*)::int FROM \"PurchaseOrderItem\" WHERE \"packSize\" IS NOT NULL " +
        "OR \"packCount\" IS NOT NULL OR \"packUnit\" IS NOT NULL) AS non_null_snapshots"
      )).rows[0];
      if (nonDefaults.non_default_items !== 0 || nonDefaults.non_null_snapshots !== 0) {
        throw new Error("Existing rows have unexpected nondefault inventory migration values");
      }
    }
    return { identity, state, schema, data, ledger: ledger.map(row => row.migration_name) };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

async function main() {
  const mode = process.argv[2] || "--check";
  if (!["--check", "--execute"].includes(mode) || process.argv.length > 3) {
    throw new Error("Expected --check (read-only) or --execute (pinned clone only)");
  }
  if (process.env.APP_ENV !== "staging-rehearsal" || !process.env.DATABASE_URL) {
    throw new Error("APP_ENV=staging-rehearsal and DATABASE_URL required");
  }
  const url = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname.endsWith(".neon.tech") ||
      url.hostname.includes("-pooler.") ||
      url.pathname !== "/" + REHEARSAL_TARGET.database) {
    throw new Error("Direct Neon clone connection required");
  }
  const folderNames = (await readdir(migrationDir, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory()).map(dirent => dirent.name).sort();
  if (JSON.stringify(folderNames) !== JSON.stringify(expectedMigrations)) {
    throw new Error("Committed migrations differ from the exact approved five-migration chain");
  }
  const checksums = Object.fromEntries(await Promise.all(expectedMigrations.map(async name => {
    const sql = await readFile(join(migrationDir, name, "migration.sql"));
    return [name, createHash("sha256").update(sql).digest("hex")];
  })));
  const before = await inspect(process.env.DATABASE_URL, checksums);
  console.log(JSON.stringify({
    operation: mode,
    target: REHEARSAL_TARGET,
    state: before.state,
    ledger: before.ledger,
    inventorySchema: before.schema,
    preexistingData: before.data,
  }, null, 2));
  if (mode === "--check") return;
  if (before.state === "APPLIED") {
    console.log("Inventory migration already recorded and verified on the clone; no changes made.");
    return;
  }
  if (process.env.STORDEX_INVENTORY_CONFIRM !== "migrate-on-" + REHEARSAL_TARGET.branch) {
    throw new Error("STORDEX_INVENTORY_CONFIRM must match the exact disposable clone branch");
  }
  const cli = join(root, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(process.execPath, [cli, "migrate", "deploy"], {
    cwd: root, env: process.env, stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("Prisma migrate deploy failed on the disposable clone. STOP and inspect its ledger.");
  }
  const after = await inspect(process.env.DATABASE_URL, checksums);
  if (after.state !== "APPLIED" ||
      JSON.stringify(after.data) !== JSON.stringify(before.data)) {
    throw new Error("Clone migration postcheck failed: application data changed or ledger incomplete");
  }
  console.log("PASS: inventory migration applied to the isolated Neon clone; existing records preserved.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error("Inventory rehearsal stopped:", error.message); process.exitCode = 2; });
}
