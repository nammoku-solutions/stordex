import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prepareIndependentOriginalInvoiceReview as review } from "./b2b-credit-original-document-review";

const bytes = Buffer.from("synthetic invoice bytes");
const digest = createHash("sha256").update(bytes).digest("hex");
const fixture = () => ({
  reviewer: { userId: "reviewer", sellerTenantId: "seller", role: "ADMIN", tenantActive: true },
  invoice: { id: "invoice", sellerTenantId: "seller", invoiceNumber: "I-001", status: "ISSUED",
    snapshotSha256: "a".repeat(64) },
  submission: { submittedByUserId: "uploader", invoiceSnapshotSha256: "a".repeat(64),
    receipt: { sellerTenantId: "seller", invoiceId: "invoice", key: "server-owned", versionId: "v1",
      sha256: digest, byteLength: bytes.length } },
  observation: { originalInvoiceNumber: "I-001", explicitCurrency: "JPY", inspectedOriginal: true },
});

describe("independent original document review preparation", () => {
  it("matches the scoped version and observed details without recording or verifying evidence", async () => {
    const input = fixture();
    const read = vi.fn().mockResolvedValue(bytes);
    await expect(review(input, read)).resolves.toEqual({
      ready: true, observedDocumentSha256: digest, observedInvoiceSnapshotSha256: "a".repeat(64),
      reviewRecorded: false, currencyVerified: false, financialPostingAllowed: false,
    });
    expect(read).toHaveBeenCalledWith({ sellerTenantId: "seller", invoiceId: "invoice" }, input.submission.receipt);
  });

  it("does not read storage for a self-review, foreign tenant, STAFF, suspended tenant, stale or cancelled source", async () => {
    const x = fixture();
    const read = vi.fn();
    for (const input of [
      { ...x, reviewer: { ...x.reviewer, userId: "uploader" } },
      { ...x, reviewer: { ...x.reviewer, sellerTenantId: "other" } },
      { ...x, reviewer: { ...x.reviewer, role: "STAFF" } },
      { ...x, reviewer: { ...x.reviewer, tenantActive: false } },
      { ...x, invoice: { ...x.invoice, snapshotSha256: "b".repeat(64) } },
      { ...x, invoice: { ...x.invoice, status: "CANCELLED" } },
      { ...x, submission: { ...x.submission, receipt: { ...x.submission.receipt, invoiceId: "other" } } },
    ]) await expect(review(input, read)).resolves.toEqual({ ready: false, reason: "REVIEW_UNAVAILABLE" });
    expect(read).not.toHaveBeenCalled();
  });

  it.each([{ explicitCurrency: "USD" }, { inspectedOriginal: false }, { originalInvoiceNumber: "I-002" }])(
    "stops when the human observation does not match", async (override) => {
      const x = fixture();
      const read = vi.fn();
      await expect(review({ ...x, observation: { ...x.observation, ...override } }, read))
        .resolves.toEqual({ ready: false, reason: "OBSERVATION_MISMATCH" });
      expect(read).not.toHaveBeenCalled();
    },
  );

  it("returns a generic refusal for corrupted bytes or storage failure", async () => {
    await expect(review(fixture(), vi.fn().mockResolvedValue(Buffer.alloc(bytes.length))))
      .resolves.toEqual({ ready: false, reason: "DOCUMENT_UNAVAILABLE" });
    await expect(review(fixture(), vi.fn().mockRejectedValue(new Error("provider failure"))))
      .resolves.toEqual({ ready: false, reason: "DOCUMENT_UNAVAILABLE" });
  });
});
