/* eslint-disable no-console */
/**
 * Candidate-only Prisma DDL validation. This script reads Prisma 7's
 * introspection result from the disposable CI PostgreSQL database after the
 * draft SQL has been rehearsed there. It NEVER edits prisma/schema.prisma,
 * creates a tracked migration, or interacts with Neon/AWS.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const file=process.argv[2];
const url=new URL(process.env.DATABASE_URL || "postgresql://invalid.invalid/no");
assert.ok(
  process.env.CI==="true" &&
  process.env.GITHUB_ACTIONS==="true" &&
  process.env.APP_ENV==="ci" &&
  url.hostname==="localhost" &&
  url.port==="5432" &&
  url.pathname==="/stordex" &&
  url.searchParams.toString()==="schema=public" &&
  file?.includes("stordex-credit-m12-introspected.prisma"),
  "Refusing Prisma migration candidate inspection outside disposable CI DB",
);
const schema=readFileSync(file,"utf8");
const committed=readFileSync("prisma/schema.prisma","utf8");
function model(name) {
  const start=schema.indexOf("model "+name+" {");
  assert.ok(start>=0,"Missing Prisma model "+name);
  const end=schema.indexOf("\n}",start);
  assert.ok(end>start,"Missing Prisma closing brace "+name);
  return schema.slice(start,end+2);
}
const expected=[
  "B2BInvoiceCurrencyEvidence",
  "B2BInvoiceCurrencyEvidenceEvent",
  "B2BCreditApprovalReviewEvent",
];
for(const name of expected){
  const m=model(name);
  assert.match(m,/\bid\s+String\s+@id/);
  assert.match(m,/\bsellerTenantId\s+String\b/);
  assert.match(m,/@relation\(/);
  assert.ok(!committed.includes("model "+name+" {"),
    "Candidate audit table already present in committed operational schema: "+name);
}
const header=model("B2BInvoiceCurrencyEvidence");
const evidenceEvent=model("B2BInvoiceCurrencyEvidenceEvent");
const review=model("B2BCreditApprovalReviewEvent");
assert.match(header,/\binvoiceId\s+String\b/);
assert.match(header,/\bsubmittedByUserId\s+String\b/);
assert.match(header,/\bdocumentSha256\s+String\b/);
assert.match(header,/\binvoiceSnapshotSha256\s+String\b/);
assert.match(header,/\bdocumentObjectRef\s+String\b/);
assert.match(header,/\bdocumentVersionId\s+String\b/);
assert.match(header,/\bdocumentByteLength\s+Int\b/);
assert.doesNotMatch(header,/\bdocumentExplicitCurrencyCode\b/);
assert.match(evidenceEvent,/\bobservedCurrencyCode\s+String\?/);
assert.match(evidenceEvent,/\bobservedDocumentSha256\s+String\b/);
assert.match(evidenceEvent,/\bobservedInvoiceSnapshotSha256\s+String\b/);
assert.match(evidenceEvent,/\bcreatedAt\s+DateTime\b/);
const evidenceIdField=evidenceEvent.split("\n").find(x=>/^\s*evidenceId\s+String\b/.test(x));
assert.ok(evidenceIdField && !evidenceIdField.includes("@unique"),
  "Evidence events MUST support verified-then-revoked history; do not collapse to one-to-one");
assert.match(review,/@@unique\(\[creditNoteId, invoiceId, sellerTenantId\]/,
  "Prisma 7 requires explicit compound uniqueness for seller-owned CreditNote relation");
assert.match(review,/\bcreditNoteId\s+String\b/);
assert.match(review,/\bevidenceId\s+String\b/);
assert.match(review,/\breviewerUserId\s+String\b/);
assert.match(review,/\baccountingVerifierUserId\s+String\b/);
assert.match(review,/\bcandidateTotal\s+Int\b/);
assert.match(model("B2BCreditNote"),/\bstatus\s+B2BCreditStatus\b/);
assert.match(model("Invoice"),/\bstatus\s+InvoiceStatus\b/);
const digest=createHash("sha256").update(schema,"utf8").digest("hex");
console.log("PASS: Prisma draft-only candidate schema includes all three modeled audit tables and source relationships");
console.log("PASS: operating prisma/schema.prisma still excludes unapproved ledgers and is unchanged");
console.log("PASS: disposable Prisma candidate SHA-256="+digest);
console.log("NOTE: Prisma schema validation does not validate PostgreSQL triggers or partial unique indexes");
