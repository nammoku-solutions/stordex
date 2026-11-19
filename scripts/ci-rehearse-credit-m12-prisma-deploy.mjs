/**
 * Verify the proposed migration through the actual Prisma deploy path.
 * All IO is restricted to the disposable CI PostgreSQL service and scratch.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import pg from "pg";
import { baselineMigrationCount, loadMigration12, migrationName, sha256 } from "./ci-credit-m12-source.mjs";

const baselineUrl = "postgresql://stordex:stordex@localhost:5432/stordex?schema=public";
const rehearsalDb = "stordex_m12_prisma_rehearsal";
const ledgers = ["B2BCreditApprovalReviewEvent", "B2BInvoiceCurrencyEvidence", "B2BInvoiceCurrencyEvidenceEvent"];

async function main() {
  assert.ok(process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true" && process.env.APP_ENV === "ci" &&
    process.env.DATABASE_URL === baselineUrl, "Refusing Prisma migration rehearsal outside disposable CI");
  const candidateSchema = process.argv[2];
  const reportPath = process.argv[3];
  assert.ok(candidateSchema && isAbsolute(candidateSchema) && reportPath && isAbsolute(reportPath), "Absolute CI input/output paths required");
  const root = process.cwd();
  const { sql, formal, migrationPath } = loadMigration12(root);
  const checkedSchema = formal ? join(root, "prisma/schema.prisma") : candidateSchema;
  const scratch = await mkdtemp(join(root, ".stordex-m12-ci-")); // Prisma config resolves repository node_modules
  const control = new pg.Client({ connectionString: baselineUrl });
  const url = baselineUrl.replace("/stordex?", "/" + rehearsalDb + "?");
  const db = new pg.Client({ connectionString: url });
  const cli = join(root, "node_modules/.bin/prisma");
  const config = join(scratch, "prisma.config.ts");
  const migrations = join(scratch, "migrations");
  const run = (...args) => execFileSync(cli, [...args, "--config", config], {
    cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: "inherit", timeout: 60_000,
  });
  async function databaseState() {
    return (await db.query(`
      SELECT (SELECT count(*)::int FROM information_schema.tables
              WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
        (SELECT count(*)::int FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
        (SELECT count(*)::int FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS unfinished
    `)).rows[0];
  }
  try {
    await control.connect();
    const { rows: [identity] } = await control.query(
      "SELECT current_database() AS name, current_setting('neon.project_id', true) AS neon",
    );
    assert.deepEqual(identity, { name: "stordex", neon: null });
    await control.query('CREATE DATABASE "stordex_m12_prisma_rehearsal"');
    await db.connect();
    assert.equal((await db.query("SELECT current_database() AS name")).rows[0].name, rehearsalDb);
    await copyFile(join(root, "prisma/schema.prisma"), join(scratch, "schema.prisma"));
    await cp(join(root, "prisma/migrations"), migrations, {
      recursive: true,
      errorOnExist: true,
      // Start with the 11-migration baseline even on a formal candidate checkout.
      filter: path => path !== migrationPath,
    });
    await writeFile(config, [
      'import { defineConfig, env } from "prisma/config";',
      'export default defineConfig({ schema: "schema.prisma", migrations: { path: "migrations" },',
      '  datasource: { url: env("DATABASE_URL") } });',
    ].join("\n"), { mode: 0o600 });
    const names = (await readdir(migrations, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort();
    assert.equal(names.length, baselineMigrationCount);
    assert.ok(migrationName > names.at(-1));
    run("migrate", "deploy");
    const before = await databaseState();
    assert.deepEqual(before, { tables: 29, applied: 11, unfinished: 0 });
    const historySql = 'SELECT migration_name,checksum FROM "_prisma_migrations" ' +
      'WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name';
    const previous = (await db.query(historySql)).rows;
    assert.deepEqual(previous.map(x => x.migration_name), names);

    await mkdir(join(migrations, migrationName));
    await writeFile(join(migrations, migrationName, "migration.sql"), sql, { mode: 0o600 });
    await copyFile(checkedSchema, join(scratch, "schema.prisma"));
    run("migrate", "deploy");
    const after = await databaseState();
    assert.deepEqual(after, { tables: 32, applied: 12, unfinished: 0 });
    const checksum = sha256(sql);
    assert.deepEqual((await db.query(historySql)).rows, [...previous, { migration_name: migrationName, checksum }]);
    const installed = await db.query(`
      SELECT c.relname AS table_name, count(*)::int AS guards FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname=ANY($1::text[])
      GROUP BY c.relname ORDER BY c.relname
    `, [ledgers]);
    assert.deepEqual(installed.rows, ledgers.map(table_name => ({ table_name, guards: 2 })));
    for (const table of ledgers) assert.equal((await db.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n, 0);
    assert.equal((await db.query(
      "SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid='public.\"B2BCreditNote\"'::regclass " +
      "AND conname='B2BCreditNote_draft_or_void_only_check'",
    )).rows[0].n, 1);
    run("migrate", "status");
    run("migrate", "diff", "--from-config-datasource", "--to-schema", join(scratch, "schema.prisma"), "--exit-code");
    run("migrate", "deploy");
    assert.deepEqual(await databaseState(), after);
    await writeFile(reportPath, JSON.stringify({
      status: "CI_PASS_NOT_APPROVED_NOT_APPLIED_TO_STAGING",
      database: rehearsalDb, migrationName, migrationSha256: checksum,
      prismaSchemaSha256: sha256(await readFile(candidateSchema)),
      schemaCheckedByDeployRehearsal: formal ? "prisma/schema.prisma" : "candidate.prisma",
      deploySchemaSha256: sha256(await readFile(checkedSchema)),
      before, after, emptyLedgers: ledgers, guardCount: 6,
    }, null, 2) + "\n", { mode: 0o600 });
    console.log("PRISMA_M12_DEPLOY_REHEARSAL_PASS (11 → 12, exact checksum, three empty ledgers, repeat deploy no-op)");
  } finally {
    await Promise.allSettled([control.end(), db.end()]);
    await rm(scratch, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
