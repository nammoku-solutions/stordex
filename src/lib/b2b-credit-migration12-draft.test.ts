import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const proposal = join(
  process.cwd(), "docs/migration-proposals",
  "20261112_credit_currency_and_approval",
);
const source = readFileSync(
  join(proposal, "001_additive_schema_DRAFT_DO_NOT_APPLY.sql"), "utf8",
);
const preflight = readFileSync(join(proposal, "002_preflight_READ_ONLY.sql"), "utf8");
const postcheck = readFileSync(
  join(proposal, "003_postcheck_READ_ONLY_AFTER_APPROVAL.sql"), "utf8",
);

describe("migration 12 is a DESIGN PROPOSAL, never an applied migration", () => {
  it("lives outside Prisma migration discovery and explicitly rejects unauthorized execution", () => {
    expect(proposal).not.toContain("/prisma/migrations/");
    expect(source).toMatch(/DO NOT RUN ON STAGING OR PRODUCTION/);
    expect(source).toContain("dry-feather-14704968");
    expect(source).toContain("br-sparkling-boat-ao9nrctp");
    expect(source).toContain("neondb");
    expect(source).toMatch(/\bBEGIN;/);
    expect(source).toMatch(/\bCOMMIT;/);
  });

  it("adds exactly three new evidence/review ledgers and no original-row DML", () => {
    const withoutSqlComments = source.replace(/--[^\r\n]*/g, "");
    const tableNames = [...withoutSqlComments.matchAll(/CREATE TABLE\s+"([^"]+)"/g)]
      .map(match => match[1]);
    expect(tableNames).toEqual([
      "B2BInvoiceCurrencyEvidence",
      "B2BInvoiceCurrencyEvidenceEvent",
      "B2BCreditApprovalReviewEvent",
    ]);
    expect(withoutSqlComments).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE|DROP TABLE)\s+"(?:Invoice|B2BCreditNote|InventoryMovement)"/);
    expect(withoutSqlComments).not.toMatch(/ALTER TABLE\s+"(?:B2BCreditNote|Invoice)"\s+DROP/i);
    expect(withoutSqlComments).not.toMatch(/ALTER TYPE\s+"B2BCreditStatus"/i);
  });

  it("preserves tenant FKs, append-only events and records all six trigger guards", () => {
    expect(source).toContain('FOREIGN KEY ("invoiceId","sellerTenantId")');
    expect(source).toContain('FOREIGN KEY ("creditNoteId","invoiceId","sellerTenantId")');
    expect(source).toContain('FOREIGN KEY ("evidenceId","invoiceId","sellerTenantId")');
    expect(source).toContain('FOREIGN KEY ("reviewerUserId","sellerTenantId")');
    const triggers = [...source.matchAll(/CREATE TRIGGER\s+"([^"]+)"/g)].map(x => x[1]);
    expect(triggers).toHaveLength(6);
    expect(triggers).toContain("B2BInvoiceCurrencyEvidence_immutable");
    expect(triggers).toContain("B2BInvoiceCurrencyEvidenceEvent_immutable");
    expect(triggers).toContain("B2BCreditApprovalReviewEvent_immutable");
    expect(source).toMatch(/'VERIFIED','REJECTED','REVOKED'/);
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("credit.\"createdByUserId\"");
  });

  it("uses DB-only expression uniqueness so VERIFIED then REVOKED remains a one-to-many audit relation", () => {
    expect(source).toContain('CREATE UNIQUE INDEX "B2BInvoiceCurrencyEvidenceEvent_result_once_idx"');
    expect(source).toContain('CREATE UNIQUE INDEX "B2BInvoiceCurrencyEvidenceEvent_revoke_once_idx"');
    expect(source).toContain('(CASE WHEN "eventType" IN (\'VERIFIED\',\'REJECTED\')');
    expect(source).toContain('(CASE WHEN "eventType" = \'REVOKED\'');
    expect(source).not.toMatch(/ON "B2BInvoiceCurrencyEvidenceEvent"\("evidenceId"\)\s+WHERE/);
    expect(source).toContain('CREATE UNIQUE INDEX "B2BCreditApprovalReviewEvent_credit_invoice_seller_key"');
    expect(source).toContain('ON "B2BCreditApprovalReviewEvent"("creditNoteId","invoiceId","sellerTenantId")');
  });

  it("has separate source-only and after-approval read-only checks", () => {
    expect(preflight).toContain("dry-feather-14704968");
    expect(preflight).toContain("br-sparkling-boat-ao9nrctp");
    expect(postcheck).toContain("dry-feather-14704968");
    expect(postcheck).toContain("br-sparkling-boat-ao9nrctp");
    expect(preflight).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\s/mi);
    expect(postcheck).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\s/mi);
    expect(postcheck).toContain("12 applied");
    expect(postcheck).toContain("32 tables");
  });
});
