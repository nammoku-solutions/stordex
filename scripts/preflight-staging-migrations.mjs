/**
 * Read-only safety gate for an EXISTING populated Neon Staging database.
 * Never run prisma migrate deploy on a database that has no migration ledger.
 * Usage: dotenv -e .env.staging -- node scripts/preflight-staging-migrations.mjs
 */
import { readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationDir = join(root, "prisma", "migrations");

/** Pure evaluator, used by tests and the CLI. No SQL or network side effects. */
export function evaluateMigrationState({ committed, applied, hasLedger, tables }) {
  const names = new Set(committed);
  const finished = new Set(applied.filter(x => x.finished_at && !x.rolled_back_at).map(x => x.migration_name));
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
  if (incomplete.length || unknown.length || missing.length) {
    return {
      ok: false, reason: "INCONSISTENT_MIGRATION_LEDGER",
      detail: "Applied history differs from repository. Do not deploy migrations.",
      incomplete, unknown, missing,
    };
  }
  return { ok: true, reason: "READY", detail: "All repository migrations are recorded as applied.", missing: [] };
}

async function readMigrationNames() {
  const names = [];
  for (const name of await readdir(migrationDir)) {
    if ((await stat(join(migrationDir, name))).isDirectory()) {
      names.push(name);
    }
  }
  return names.sort();
}

async function main() {
  // Two explicit safeguards: never accidentally connect to Production or a
  // local disposable DB. Run with the intended .env.staging only.
  if (process.env.APP_ENV !== "staging") {
    throw new Error("APP_ENV must equal staging; no database connection attempted.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  const url = new URL(process.env.DATABASE_URL);
  if (!url.hostname.endsWith(".neon.tech")) {
    throw new Error("Expected a Neon .neon.tech host for Staging; no database connection attempted.");
  }
  if (!["postgresql:", "postgres:"].includes(url.protocol)) {
    throw new Error("Expected a PostgreSQL DATABASE_URL.");
  }

  const committed = await readMigrationNames();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query("BEGIN TRANSACTION READ ONLY");
    const tablesResult = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
    );
    const tables = tablesResult.rows.map(x => x.table_name);
    const ledgerResult = await client.query("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists");
    const hasLedger = ledgerResult.rows[0].exists;
    let applied = [];
    if (hasLedger) {
      const result = await client.query(
        'SELECT migration_name, finished_at, rolled_back_at FROM public."_prisma_migrations" ORDER BY started_at'
      );
      applied = result.rows;
    }
    const result = evaluateMigrationState({ committed, applied, hasLedger, tables });
    console.log(JSON.stringify({
      check: "Stordex Neon Staging migration preflight (READ ONLY)",
      database: url.pathname.slice(1),
      tableCount: tables.length,
      committedMigrations: committed,
      appliedMigrations: applied.map(x => x.migration_name),
      ...result,
    }, null, 2));
    if (!result.ok) process.exitCode = 2;
  } finally {
    // Transaction is read-only and never commits any operation.
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => {
    console.error("Staging migration preflight stopped:", err.message);
    process.exitCode = 2;
  });
}
