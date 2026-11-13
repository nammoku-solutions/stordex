/* eslint-disable no-console */
/**
 * DANGEROUS DDL is only permitted in GitHub Actions' disposable localhost
 * PostgreSQL 16 service named "stordex". Never points to Neon/Staging/Production.
 *
 * Draft SQL remains outside prisma/migrations: this runner is a CI rehearsal,
 * NOT a live migration, operational runbook or financial approval.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = new URL(process.env.DATABASE_URL || "postgresql://missing.invalid/not-allowed");
if (
  process.env.CI !== "true" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.APP_ENV !== "ci" ||
  url.hostname !== "localhost" ||
  url.port !== "5432" ||
  url.pathname !== "/stordex" ||
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  url.searchParams.toString() !== "schema=public"
) {
  throw new Error("Refusing Migration #12 rehearsal outside disposable CI localhost PostgreSQL");
}

const source = readFileSync(join(
  process.cwd(), "docs", "migration-proposals",
  "20261112_credit_currency_and_approval",
  "001_additive_schema_DRAFT_DO_NOT_APPLY.sql",
), "utf8");

if (!source.includes("DO NOT RUN ON STAGING OR PRODUCTION.")) {
  throw new Error("Refusing unmarked migration proposal");
}
const sha = "ab".repeat(32);
const docSha = "cd".repeat(32);
const base = "ci-m12-";
const seller = base + "seller";
const foreign = base + "foreign";
const maker = base + "maker";
const checker = base + "checker";
const reviewer = base + "reviewer";
const foreignAdmin = base + "foreign-admin";
const staff = base + "staff";
const invoiceId = base + "invoice";
const evidenceId = base + "evidence";
const evidence2 = base + "evidence2";
const uuid = i => "11111111-1111-4111-8111-" + String(i).padStart(12, "0");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
let testCount = 0;

async function expectRejected(query, params, hint) {
  let threw = false;
  try {
    await client.query(query, params);
  } catch (error) {
    threw = true;
    assert.ok(
      error instanceof Error && error.message.length > 0,
      hint + ": expected a database exception",
    );
  }
  assert.ok(threw, "Expected database to REJECT: " + hint);
  testCount++;
}

function evidenceParams(id, invoice = invoiceId, submitter = maker, tenant = seller) {
  return [
    id, tenant, invoice, "CI-INV-0001",
    `b2b-credit-evidence/${tenant}/${invoice}/${randomUUID()}.pdf`,
    "synthetic-version-1", 128, docSha, sha, submitter,
  ];
}
const insertEvidenceSQL = 'INSERT INTO "B2BInvoiceCurrencyEvidence" (' +
  '"id","sellerTenantId","invoiceId","sourceInvoiceNumber","documentObjectRef",' +
  '"documentVersionId","documentByteLength","documentSha256","invoiceSnapshotSha256",' +
  '"submittedByUserId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)';
async function insertEvidence(id, invoice = invoiceId, submitter = maker, tenant = seller) {
  await client.query(insertEvidenceSQL, evidenceParams(id, invoice, submitter, tenant));
}

function eventParams(id, evidence, actor, kind, payloadHash = docSha, tenant = seller) {
  return [base + "event-" + id, evidence, tenant, uuid(id), kind, actor, payloadHash,
    sha, "CI independent original document verification", kind === "VERIFIED" ? "JPY" : null];
}
const insertEventSQL = 'INSERT INTO "B2BInvoiceCurrencyEvidenceEvent" (' +
  '"id","evidenceId","sellerTenantId","eventId","eventType",' +
  '"reviewerUserId","observedDocumentSha256","observedInvoiceSnapshotSha256","reason","observedCurrencyCode")' +
  ' VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)';

try {
  await client.connect();
  const identity = (await client.query(
    "SELECT current_database() AS db, current_setting('neon.project_id',true) AS neon_project",
  )).rows[0];
  assert.equal(identity.db, "stordex");
  assert.equal(identity.neon_project, null);
  const migrationCount = Number((await client.query(
    'SELECT count(*)::integer AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  )).rows[0].n);
  assert.equal(migrationCount, 11);
  console.log("PASS: 11 existing Prisma migrations on isolated CI PostgreSQL");

  // Execute this draft DDL only after committed Prisma migrations, Typecheck,
  // Vitest, Prisma drift check and Next build have completed in disposable CI.
  await client.query(source);
  const tables = (await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN " +
      "('B2BInvoiceCurrencyEvidence','B2BInvoiceCurrencyEvidenceEvent'," +
      "'B2BCreditApprovalReviewEvent') ORDER BY tablename",
  )).rows;
  assert.equal(tables.length, 3);
  const triggers = (await client.query(
    "SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid " +
      "WHERE NOT t.tgisinternal AND c.relname IN " +
      "('B2BInvoiceCurrencyEvidence','B2BInvoiceCurrencyEvidenceEvent'," +
      "'B2BCreditApprovalReviewEvent')",
  )).rows;
  assert.equal(triggers.length, 6);
  console.log("PASS: draft SQL DDL applied only to throwaway CI database (3 tables, 6 triggers)");

  await client.query(
    'INSERT INTO "Tenant" ("id","name","slug","updatedAt") VALUES ' +
      "($1,'CI Seller','ci-m12-seller',now())," +
      "($2,'CI Foreign','ci-m12-foreign',now())",
    [seller, foreign],
  );
  await client.query(
    'INSERT INTO "User" ("id","tenantId","email","passwordHash","name","role","updatedAt") VALUES ' +
      "($1,$2,'maker@ci.invalid','not-for-auth','CI Maker','ADMIN',now())," +
      "($3,$2,'checker@ci.invalid','not-for-auth','CI Checker','OWNER',now())," +
      "($4,$2,'reviewer@ci.invalid','not-for-auth','CI Reviewer','ADMIN',now())," +
      "($5,$6,'foreign@ci.invalid','not-for-auth','CI Foreign','ADMIN',now())," +
      "($7,$2,'staff@ci.invalid','not-for-auth','CI Staff','STAFF',now())",
    [maker, seller, checker, reviewer, foreignAdmin, foreign, staff],
  );
  await client.query(
    'INSERT INTO "Customer" ("id","tenantId","code","name","updatedAt") ' +
      "VALUES ($1,$2,'M12','CI Customer',now())",
    [base + "customer", seller],
  );
  await client.query(
    'INSERT INTO "Invoice" ("id","tenantId","invoiceNumber","customerId",' +
      '"periodYear","periodMonth","status","subtotal","tax","total","updatedAt")' +
      " VALUES ($1,$2,'CI-INV-0001',$3,2026,11,'ISSUED',4400,440,4840,now())",
    [invoiceId, seller, base + "customer"],
  );
  console.log("PASS: completely synthetic seller/foreign tenants, roles and source invoice");

  const firstReceipt = evidenceParams(evidenceId);
  await client.query(insertEvidenceSQL, firstReceipt);
  testCount++;
  await expectRejected(
    insertEvidenceSQL,
    evidenceParams(base + "foreign-evidence", invoiceId, foreignAdmin),
    "seller invoice must reject foreign uploader",
  );
  await expectRejected(
    insertEvidenceSQL,
    evidenceParams(base + "staff-evidence", invoiceId, staff),
    "seller STAFF cannot submit evidence",
  );
  await expectRejected(
    insertEvidenceSQL,
    evidenceParams(base + "cross-tenant-evidence", invoiceId, foreignAdmin, foreign),
    "foreign tenant cannot claim seller invoice",
  );
  for (const [index, value, suffix, reason] of [
    [4, "https://example.invalid/original.pdf", "public-url", "reject public URLs"],
    [4, firstReceipt[4].replace(seller, foreign), "wrong-key", "reject a key scoped to another seller"],
    [5, "null", "null-version", "require a versioned object"],
    [6, 10485761, "overlarge-document", "enforce the maximum object size"],
  ]) {
    const params = evidenceParams(base + suffix);
    params[index] = value;
    await expectRejected(insertEvidenceSQL, params, reason);
  }
  await expectRejected(
    insertEvidenceSQL, [base + "duplicate-storage-receipt", ...firstReceipt.slice(1)],
    "an object key and version cannot be recorded twice",
  );
  for (const currency of [null, "USD"]) {
    const args = eventParams(12, evidenceId, reviewer, "VERIFIED");
    args[9] = currency;
    await expectRejected(insertEventSQL, args, "verification requires the reviewer to observe JPY");
  }
  const rejectedWithCurrency = eventParams(13, evidenceId, reviewer, "REJECTED");
  rejectedWithCurrency[9] = "JPY";
  await expectRejected(insertEventSQL, rejectedWithCurrency, "rejection cannot assert verified currency");
  await expectRejected(
    insertEventSQL, eventParams(1, evidenceId, maker, "VERIFIED"),
    "uploader cannot verify own evidence",
  );
  await expectRejected(
    insertEventSQL, eventParams(2, evidenceId, foreignAdmin, "VERIFIED", docSha, foreign),
    "cross-tenant reviewer cannot verify",
  );
  await expectRejected(
    insertEventSQL, eventParams(3, evidenceId, staff, "VERIFIED"),
    "STAFF cannot verify",
  );
  await expectRejected(
    insertEventSQL, eventParams(4, evidenceId, reviewer, "VERIFIED", "ee".repeat(32)),
    "mismatched original document digest",
  );
  await expectRejected(
    insertEventSQL, eventParams(5, evidenceId, reviewer, "REVOKED"),
    "cannot revoke without verification",
  );
  await client.query(insertEventSQL, eventParams(6, evidenceId, checker, "VERIFIED"));
  testCount++;
  await expectRejected(
    insertEventSQL, eventParams(7, evidenceId, reviewer, "REJECTED"),
    "cannot reject after verification",
  );
  await expectRejected(
    'UPDATE "B2BInvoiceCurrencyEvidence" SET "sourceInvoiceNumber"=$1 WHERE id=$2',
    ["ALTERED", evidenceId],
    "original evidence header immutable",
  );
  await expectRejected(
    'DELETE FROM "B2BInvoiceCurrencyEvidenceEvent" WHERE "evidenceId"=$1',
    [evidenceId],
    "event ledger cannot be deleted",
  );
  await expectRejected(
    'UPDATE "B2BInvoiceCurrencyEvidenceEvent" SET "reason"=$1 WHERE "evidenceId"=$2',
    ["changed", evidenceId],
    "verification cannot be rewritten",
  );
  await client.query(insertEventSQL, eventParams(8, evidenceId, reviewer, "REVOKED"));
  testCount++;
  await expectRejected(
    insertEventSQL, eventParams(9, evidenceId, checker, "REVOKED"),
    "duplicate revocation must be rejected",
  );

  // Two independent connections race to decide the same evidence. Exactly one
  // result must commit. The row-level guard plus unique index serialize this.
  await insertEvidence(evidence2);
  const peers = [
    new pg.Client({ connectionString: process.env.DATABASE_URL }),
    new pg.Client({ connectionString: process.env.DATABASE_URL }),
  ];
  try {
    await Promise.all(peers.map(x => x.connect()));
    const raced = await Promise.allSettled([
      peers[0].query(insertEventSQL, eventParams(10, evidence2, checker, "VERIFIED")),
      peers[1].query(insertEventSQL, eventParams(11, evidence2, reviewer, "REJECTED")),
    ]);
    assert.equal(raced.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(raced.filter(x => x.status === "rejected").length, 1);
    const count = Number((await client.query(
      'SELECT count(*)::integer AS n FROM "B2BInvoiceCurrencyEvidenceEvent" ' +
        'WHERE "evidenceId"=$1',
      [evidence2],
    )).rows[0].n);
    assert.equal(count, 1);
    testCount++;
  } finally {
    await Promise.all(peers.map(x => x.end().catch(() => {})));
  }

  // No old CreditNote is issued and the approval log must not accept fake or
  // cross-tenant provenance. A future authorized app writer requires further
  // separate tests with a complete fabricated B2B return+CreditNote fixture.
  await expectRejected(
    'INSERT INTO "B2BCreditApprovalReviewEvent" (' +
      '"id","eventId","creditNoteId","invoiceId","sellerTenantId","evidenceId",' +
      '"reviewerUserId","accountingVerifierUserId","eventType",' +
      '"invoiceSnapshotSha256","computedAmountsSha256","candidateSubtotal",' +
      '"candidateTax","candidateTotal","reason") ' +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'REVIEW_ACCEPTED',$9,$10,1760,176,1936,$11)",
    [base + "approval", uuid(12), base + "missing-credit", invoiceId, seller,
      evidenceId, checker, reviewer, sha, "ef".repeat(32),
      "CI does not authorize monetary approval"],
    "unrelated/missing CreditNote cannot receive review event",
  );

  const originalInvariant = (await client.query(
    'SELECT count(*)::integer AS n FROM "B2BCreditNote" ' +
      "WHERE status NOT IN ('DRAFT','VOID')",
  )).rows[0];
  assert.equal(originalInvariant.n, 0);
  const stillMigrationCount = Number((await client.query(
    'SELECT count(*)::integer AS n FROM "_prisma_migrations" ' +
      'WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  )).rows[0].n);
  assert.equal(stillMigrationCount, 11);
  console.log(
    "PASS: " + testCount +
    " PostgreSQL evidence/tenant/role/immutability/race/credit-preflight assertions",
  );
  console.log("PASS: no new Prisma migration record; DRAFT/VOID issue gate untouched");
} finally {
  await client.end().catch(() => {});
}
