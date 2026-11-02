/**
 * Creates a local private PostgreSQL custom archive of exactly the Stordex
 * BASELINED Staging Neon branch (exactly four Prisma migrations).
 * No database writes. Default --check is read-only.
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
import { STAGING_IDENTITY, readChecksums, inspect, safeFailureDetails } from "./apply-neon-staging-migrations.mjs";
import { APPLIED_BASELINE } from "./rehearse-neon-inventory-migration.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let currentPhase = "startup";

/** Preserve nested network errors even when AggregateError.message is empty. */
export function safeBackupFailure(error, phase, environment = process.env) {
  return safeFailureDetails(error, phase, environment);
}

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


/** A strict four-migration state gate. Never back up an unexpected state. */
export function assertBaselinedBackupState(result) {
  if (result?.state !== "BASELINED" ||
      JSON.stringify(result.migrations) !== JSON.stringify(APPLIED_BASELINE)) {
    throw new Error("Expected exactly four completed Prisma baseline records; STOP");
  }
  return result;
}

async function inspectBaselinedSource(connectionString) {
  const { hashes, baselineCatalog } = await readChecksums();
  return assertBaselinedBackupState(
    await inspect(connectionString, hashes, baselineCatalog)
  );
}

/** Require both schema and table data in the custom pg_dump archive TOC. */
export function assertBaselinedBackupToc(toc) {
  for (const name of ["Tenant", "Item", "PurchaseOrder", "_prisma_migrations"]) {
    const quoted = '"' + name + '"';
    const table = toc.includes("TABLE public " + name + " ") ||
      toc.includes("TABLE public " + quoted + " ");
    const data = toc.includes("TABLE DATA public " + name + " ") ||
      toc.includes("TABLE DATA public " + quoted + " ");
    if (!table || !data) {
      throw new Error("Archive TOC missing required schema/data entry: " + name);
    }
  }
}

/** Report useful libpq diagnostic details, but redact all Neon URL/password fragments. */
export function safeCommandFailure(program, result, environment = process.env) {
  const diagnostic = result.error?.message || result.stderr || "(no stderr)";
  const safe = safeFailureDetails({ message: diagnostic }, "postgres_client", environment);
  const code = Number.isInteger(result.status) ? String(result.status) : "no-exit-status";
  return new Error(program + " failed (exit " + code + "): " + safe.message);
}

function run(program, args, env) {
  const result = spawnSync(program, args, { env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw safeCommandFailure(program, result);
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
  currentPhase = "staging_preflight_connect_and_validate";
  const before = await inspectBaselinedSource(process.env.DATABASE_URL);
  currentPhase = "private_archive_path_and_client_validation";
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
    PGSSLMODE: "verify-full",
    // PostgreSQL 16 libpq otherwise looks for ~/.postgresql/root.crt.
    // Trust the OS CA bundle and verify the expected Neon host name.
    PGSSLROOTCERT: "system",
    PGCHANNELBINDING: url.searchParams.get("channel_binding") || "require",
  };
  delete env.PGSERVICE;
  delete env.PGSERVICEFILE;
  const version = run("pg_dump", ["--version"], env).trim();
  if ((parseClientVersion(version) ?? 0) < 16) {
    throw new Error("PostgreSQL 16+ pg_dump client is required");
  }
  run("pg_restore", ["--version"], env);
  console.log(JSON.stringify({ mode, state: before.state, branch: STAGING_IDENTITY.branch,
    data: before.data, migrations: before.migrations,
    outputDirectory: dir, client: version }, null, 2));
  if (mode === "--check") return;
  if (process.env.STORDEX_STAGING_BASELINED_BACKUP_CONFIRM !== "backup-baselined-only-on-" + STAGING_IDENTITY.branch) {
    throw new Error("Explicit backup-only confirmation is required");
  }
  currentPhase = "private_backup_directory";
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (((await stat(dir)).mode & 0o077) !== 0) {
    throw new Error("Backup directory is not private. Set its permissions to 700.");
  }
  const name = "stordex-staging-baselined-" +
    new Date().toISOString().replace(/[:.]/g, "-") + "-" +
    randomBytes(4).toString("hex");
  const archive = join(dir, name + ".dump");
  process.umask(0o077);
  try {
    currentPhase = "pg_dump_private_archive";
    run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file=" + archive,
      "--dbname=neondb"], env);
    await chmod(archive, 0o600);
    const info = await stat(archive);
    if (info.size < 1024) throw new Error("Archive unexpectedly small");
    currentPhase = "backup_archive_toc_validation";
    const toc = run("pg_restore", ["--list", archive], env);
    assertBaselinedBackupToc(toc);
    currentPhase = "staging_post_backup_readonly_recheck";
    const after = await inspectBaselinedSource(process.env.DATABASE_URL);
    if (JSON.stringify(before.data) !== JSON.stringify(after.data) ||
        JSON.stringify(before.migrations) !== JSON.stringify(after.migrations)) {
      throw new Error("Staging data or Prisma ledger changed during dump; discard archive");
    }
    currentPhase = "private_backup_manifest_write";
    const manifest = {
      target: STAGING_IDENTITY, archive,
      bytes: info.size, sha256: await hashFile(archive),
      state: before.state, migrations: before.migrations,
      observedData: before.data, createdAt: new Date().toISOString(),
      note: "Post-baseline TOC validated, but isolated restore of this dump is still required before any live inventory migration",
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
  main().catch(error => {
    console.error("Backup stopped:", JSON.stringify(safeBackupFailure(error, currentPhase), null, 2));
    process.exitCode = 2;
  });
}
