// Only reads repository files. CI callers enforce disposable database identity.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const migrationName = "20261119120000_b2b_invoice_evidence_and_review";
export const baselineMigrationCount = 11;
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function loadMigration12(root = process.cwd()) {
  const proposal = join(root, "docs/migration-proposals/20261112_credit_currency_and_approval/001_additive_schema_DRAFT_DO_NOT_APPLY.sql");
  const migrationPath = join(root, "prisma/migrations", migrationName);
  const formal = existsSync(migrationPath);
  const original = readFileSync(proposal);
  assert.match(original.toString("utf8"), /DO NOT RUN ON STAGING OR PRODUCTION/);
  const sql = formal ? readFileSync(join(migrationPath, "migration.sql")) : original;
  if (formal) {
    assert.ok(sql.equals(original), "Registered Migration #12 must match the rehearsed proposal byte for byte");
    assert.equal(sha256(sql), "8ea57dda5cd5a8a7233e982d133b31a776c5d9e15520417ba50b57494634ed96",
      "Registered Migration #12 differs from the checked release candidate");
  }
  return { sql, formal, migrationPath, expectedCount: baselineMigrationCount + Number(formal) };
}
