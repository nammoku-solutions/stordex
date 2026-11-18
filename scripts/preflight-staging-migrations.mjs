/**
 * Read-only safety gate for an EXISTING populated Neon Staging database.
 * Never run prisma migrate deploy on a database that has no migration ledger.
 * Usage: dotenv -e .env.staging -- node scripts/preflight-staging-migrations.mjs
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { STAGING_IDENTITY, safeFailureDetails } from "./apply-neon-staging-migrations.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationDir = join(root, "prisma", "migrations");

/** Pure evaluator, used by tests and the CLI. No SQL or network side effects. */
export function evaluateMigrationState({ committed, checksums, applied, hasLedger, tables }) {
  const names = new Set(committed);
  const completed = applied.filter(x => x.finished_at && !x.rolled_back_at);
  const finished = new Set();
  const duplicates = new Set();
  const checksumMismatch = new Set();
  for (const row of completed) {
    const name = row.migration_name;
    if (finished.has(name)) duplicates.add(name);
    finished.add(name);
    const expected = checksums?.get(name);
    if (names.has(name) && (!expected || row.checksum !== expected)) checksumMismatch.add(name);
  }
  const incomplete = applied.filter(x => !x.finished_at && !x.rolled_back_at).map(x => x.migration_name);
  const unknown = [...finished].filter(x => !names.has(x));
  const missing = committed.filter(x => !finished.has(x));
  const appTables = tables.filter(x => x !== "_prisma_migrations");
  if (!hasLedger && appTables.length) {
    return {
      ok: false,
      reason: "POPULATED_DATABASE_WITHOUT_LEDGER",
      detail: "Existing tables exist but _prisma_migrations does not. Baselining is required before migrate deploy.",
      missing,
    };
  }
  if (!hasLedger) {
    return {
      ok: false, reason: "NO_MIGRATION_LEDGER",
      detail: "No migration ledger on this branch. Confirm environment before any migrate deploy.", missing,
    };
  }
  if (incomplete.length || unknown.length || missing.length || duplicates.size || checksumMismatch.size) {
    return {
      ok: false, reason: "INCONSISTENT_MIGRATION_LEDGER",
      detail: "Applied history differs from repository. Do not deploy migrations.",
      incomplete, unknown, missing, duplicates: [...duplicates], checksumMismatch: [...checksumMismatch],
    };
  }
  return { ok: true, reason: "READY", detail: "All repository migrations are recorded as applied with matching checksums.", missing: [] };
}

export async function readCommittedMigrations(directory = migrationDir) {
  const committed = (await readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  if (!committed.length) throw new Error("No repository migrations found.");
  const checksums = new Map(await Promise.all(committed.map(async name => [
    name, createHash("sha256").update(await readFile(join(directory, name, "migration.sql"))).digest("hex"),
  ])));
  return { committed, checksums };
}

export function requireStagingConnection(environment) {
  if (environment.APP_ENV !== "staging") {
    throw new Error("APP_ENV must equal staging; no database connection attempted.");
  }
  if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  let url;
  try {
    url = new URL(environment.DATABASE_URL);
  } catch {
    throw new Error("Invalid Staging DATABASE_URL; no database connection attempted.");
  }
  if (!["postgresql:", "postgres:"].includes(url.protocol) ||
      !url.hostname.endsWith(".neon.tech") ||
      url.pathname !== "/" + STAGING_IDENTITY.database) {
    throw new Error("Expected a Neon PostgreSQL URL for neondb; no database connection attempted.");
  }
  return environment.DATABASE_URL;
}

/** Check target identity before reading any application schema or migration ledger. */
export async function inspectStagingMigrationLedger(client, { committed, checksums }) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const { rows: [identity] } = await client.query(
      "SELECT current_setting('neon.project_id', true) AS project, " +
      "current_setting('neon.branch_id', true) AS branch, current_database() AS database"
    );
    if (!identity || Object.entries(STAGING_IDENTITY).some(([key, expected]) => identity[key] !== expected)) {
      throw new Error("Neon connection did not attest the Stordex Staging project, branch and database. STOP.");
    }
    const tablesResult = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
    );
    const tables = tablesResult.rows.map(x => x.table_name);
    const ledgerResult = await client.query("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists");
    const hasLedger = ledgerResult.rows[0].exists;
    let applied = [];
    if (hasLedger) {
      const result = await client.query(
        'SELECT migration_name, checksum, finished_at, rolled_back_at FROM public."_prisma_migrations" ORDER BY started_at, migration_name'
      );
      applied = result.rows;
    }
    return {
      check: "Stordex Neon Staging migration preflight (READ ONLY)",
      ...STAGING_IDENTITY,
      tableCount: tables.length,
      committedMigrations: committed,
      appliedMigrations: applied.map(x => x.migration_name),
      ...evaluateMigrationState({ committed, checksums, applied, hasLedger, tables }),
    };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
  }
}

async function main() {
  const connectionString = requireStagingConnection(process.env);
  const migrations = await readCommittedMigrations();
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15000, query_timeout: 15000 });
  try {
    await client.connect();
    const result = await inspectStagingMigrationLedger(client, migrations);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => {
    console.error("Staging migration preflight stopped:", safeFailureDetails(err, "read_only_preflight").message);
    process.exitCode = 2;
  });
}
