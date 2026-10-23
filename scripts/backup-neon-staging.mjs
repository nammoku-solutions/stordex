/**
 * Creates a local private PostgreSQL custom archive of exactly the Stordex
 * Staging Neon branch. No database writes. Default --check is read-only.
 * Do not commit or share this backup; it contains application/customer data.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertStagingDatabaseIdentity, STAGING_IDENTITY } from "./preflight-staging-migrations.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function validateBackupDirectory(dir) {
  if (!dir || !isAbsolute(dir)) throw new Error("Absolute backup path required");
  const path = resolve(dir);
  if (path === resolve(root) || path.startsWith(resolve(root) + sep)) {
    throw new Error("Backup location must be outside the repository");
  }
  return path;
}

export function parseClientVersion(s) {
  const m = s.match(/pg_dump\s+\(PostgreSQL\)\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

async function identityAndCounts(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const identity = (await client.query(
      "SELECT current_setting('neon.project_id',true) project, " +
      "current_setting('neon.branch_id',true) branch, current_database() database"
    )).rows[0];
    assertStagingDatabaseIdentity({
      appEnv: process.env.APP_ENV, connection: new URL(connectionString), ...identity,
    });
    const stats = (await client.query(
      "SELECT (SELECT count(*)::int FROM \"Tenant\") tenants, " +
      "(SELECT count(*)::int FROM \"Item\") items, " +
      "(SELECT coalesce(sum(stock),0)::bigint FROM \"Item\") stock, " +
      "(SELECT count(*)::int FROM \"PurchaseOrder\") purchase_orders, " +
      "(SELECT count(*)::int FROM \"InventoryMovement\") movements, " +
      "(SELECT to_regclass('public._prisma_migrations') IS NOT NULL) ledger_exists, " +
      "(SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' " +
      "AND table_name='Item' AND column_name IN ('stockPolicy','purchaseMode')) item_policy_columns"
    )).rows[0];
    if (stats.ledger_exists || stats.item_policy_columns !== 0) {
      throw new Error("Staging is no longer in the expected pre-migration state");
    }
    return stats;
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

function run(program, args, env) {
  const result = spawnSync(program, args, { env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(program + " failed. Check PostgreSQL client installation and private connection.");
  }
  return result.stdout;
}

async function hashFile(file) {
  const digest = createHash("sha256");
  for await (const part of createReadStream(file)) digest.update(part);
  return digest.digest("hex");
}

async function main() {
  const mode = process.argv[2] || "--check";
  if (!["--check", "--execute"].includes(mode) || process.argv.length > 3) {
    throw new Error("Use --check or --execute");
  }
  if (process.env.APP_ENV !== "staging" || !process.env.DATABASE_URL) {
    throw new Error("APP_ENV=staging and a direct Staging DATABASE_URL are required");
  }
  const url = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname.endsWith(".neon.tech") || url.hostname.includes("-pooler.") ||
      url.pathname !== "/neondb" || !url.username || !url.password) {
    throw new Error("Direct Neon neondb URL required; pooled/local connections are rejected");
  }
  const stats = await identityAndCounts(process.env.DATABASE_URL);
  const dir = validateBackupDirectory(
    process.env.STORDEX_STAGING_BACKUP_DIR || join(homedir(), "stordex-staging-backups")
  );
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: "neondb",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
    PGCHANNELBINDING: url.searchParams.get("channel_binding") || "prefer",
  };
  delete env.PGSERVICE;
  delete env.PGSERVICEFILE;
  const version = run("pg_dump", ["--version"], env).trim();
  if ((parseClientVersion(version) ?? 0) < 16) {
    throw new Error("PostgreSQL 16+ pg_dump client is required");
  }
  run("pg_restore", ["--version"], env);
  console.log(JSON.stringify({ mode, branch: STAGING_IDENTITY.branch, data: stats,
    outputDirectory: dir, client: version }, null, 2));
  if (mode === "--check") return;
  if (process.env.STORDEX_STAGING_BACKUP_CONFIRM !== "backup-only-on-" + STAGING_IDENTITY.branch) {
    throw new Error("Explicit backup-only confirmation is required");
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (((await stat(dir)).mode & 0o077) !== 0) {
    throw new Error("Backup directory is not private. Set its permissions to 700.");
  }
  const name = "stordex-staging-" +
    new Date().toISOString().replace(/[:.]/g, "-") + "-" +
    randomBytes(4).toString("hex");
  const archive = join(dir, name + ".dump");
  process.umask(0o077);
  try {
    run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file=" + archive,
      "--dbname=neondb"], env);
    await chmod(archive, 0o600);
    const info = await stat(archive);
    if (info.size < 1024) throw new Error("Archive unexpectedly small");
    const toc = run("pg_restore", ["--list", archive], env);
    if (!/TABLE public "?Tenant"? /.test(toc) ||
        !/TABLE public "?Item"? /.test(toc) ||
        !/TABLE public "?PurchaseOrder"? /.test(toc)) {
      throw new Error("Archive does not contain all expected app tables");
    }
    const manifest = {
      target: STAGING_IDENTITY, archive,
      bytes: info.size, sha256: await hashFile(archive),
      observedData: stats, createdAt: new Date().toISOString(),
      note: "Archive TOC validated; restore to a separate disposable DB before live migration",
    };
    await writeFile(join(dir, name + ".manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    console.log("BACKUP_ARCHIVE_VERIFIED\n" + JSON.stringify(manifest, null, 2));
  } catch (error) {
    await unlink(archive).catch(() => {});
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error("Backup stopped:", error.message); process.exitCode = 2; });
}
