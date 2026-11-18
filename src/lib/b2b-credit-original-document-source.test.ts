import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  prepareAuthenticatedOriginalInvoiceDocument as prepare,
  prepareAuthenticatedOriginalInvoiceReview as review,
} from "./b2b-credit-original-document-source";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), invoice: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));

const actor = { id: "user-one", tenantId: "tenant-a", role: "ADMIN" };
const invoice = () => ({
  id: "invoice-one", tenantId: actor.tenantId, status: "ISSUED", invoiceNumber: "INV-01",
  issueDate: new Date("2026-11-11T00:00:00.000Z"), periodYear: 2026, periodMonth: 11,
  subtotal: 1000, tax: 100, total: 1100, taxRate: 10, taxPerOrder: false,
  orders: [{ order: {
    id: "order-one", tenantId: actor.tenantId, subtotal: 1000, tax: 100, total: 1100, taxRate: 10,
    items: [{ id: "line-one", itemId: "item-one", quantity: 2, unitPrice: 500, amount: 1000,
      item: { tenantId: actor.tenantId } }],
  } }],
});
const input = () => ({
  invoiceId: "invoice-one", filename: "original.pdf", mimeType: "application/pdf",
  bytes: new TextEncoder().encode("%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n"),
});

const tx = { user: { findFirst: mocks.user }, invoice: { findFirst: mocks.invoice } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: actor });
  mocks.user.mockResolvedValue(actor);
  mocks.invoice.mockResolvedValue(invoice());
  mocks.transaction.mockImplementation(callback => callback(tx));
});

describe("authenticated original invoice source preparation", () => {
  it("uses server identity, current DB membership, and a tenant-scoped read snapshot", async () => {
    const first = await prepare({ ...input(), ...{ tenantId: "tenant-b", snapshotSha256: "browser-hash" } });
    const second = await prepare(input());
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead", timeout: 15_000,
    });
    expect(mocks.user).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: actor.id, tenantId: actor.tenantId, role: { in: ["OWNER", "ADMIN"] }, tenant: { status: "ACTIVE" },
    } }));
    expect(mocks.invoice).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "invoice-one", tenantId: actor.tenantId, status: { in: ["ISSUED", "PAID"] },
    } }));
    expect(first).toMatchObject({
      accepted: true, proposedPrivateObjectKey: expect.stringContaining("/tenant-a/invoice-one/"),
      sourceSnapshotSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      sellerTenantId: actor.tenantId, invoiceId: "invoice-one", sourceInvoiceNumber: "INV-01",
      submittedByUserId: actor.id,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      storageCompleted: false, independentReviewCompleted: false,
      currencyVerified: false, financialPostingAllowed: false,
    });
    if (!first.accepted || !second.accepted) throw new Error("Expected two valid candidates");
    expect(first.sourceSnapshotSha256).toBe(second.sourceSnapshotSha256);
  });

  it("stops if current membership does not authorize the user", async () => {
    mocks.user.mockResolvedValue(null);
    await expect(prepare(input())).resolves.toEqual({ accepted: false, reason: "SOURCE_UNAVAILABLE" });
    expect(mocks.invoice).not.toHaveBeenCalled();
  });

  it("stops with missing session identity or a malformed invoice id", async () => {
    mocks.session.mockResolvedValueOnce({ user: { ...actor, id: undefined } });
    await expect(prepare(input())).resolves.toMatchObject({ accepted: false });
    await expect(prepare({ ...input(), invoiceId: "../invoice" })).resolves.toMatchObject({ accepted: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("preserves the existing sign-in gate", async () => {
    const unauthenticated = new Error("sign in required");
    mocks.session.mockRejectedValue(unauthenticated);
    await expect(prepare(input())).rejects.toBe(unauthenticated);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([null, { ...invoice(), tenantId: "tenant-b" }, { ...invoice(), status: "CANCELLED" }])(
    "does not distinguish missing, foreign, and non-issued invoices", async (record) => {
      mocks.invoice.mockResolvedValue(record);
      await expect(prepare(input())).resolves.toEqual({ accepted: false, reason: "SOURCE_UNAVAILABLE" });
    },
  );

  it("rejects foreign linked orders, foreign items, and inconsistent financial amounts", async () => {
    const foreignOrder = invoice();
    foreignOrder.orders[0].order.tenantId = "tenant-b";
    const foreignItem = invoice();
    foreignItem.orders[0].order.items[0].item.tenantId = "tenant-b";
    const badAmount = invoice();
    badAmount.orders[0].order.items[0].amount = 999;
    for (const record of [foreignOrder, foreignItem, badAmount, { ...invoice(), orders: [] }]) {
      mocks.invoice.mockResolvedValue(record);
      await expect(prepare(input())).resolves.toEqual({ accepted: false, reason: "SOURCE_INTEGRITY_FAILED" });
    }
  });

  it("rejects oversized snapshots and invalid PDF candidates", async () => {
    const record = invoice();
    mocks.invoice.mockResolvedValueOnce({ ...record, orders: Array(201).fill(record.orders[0]) });
    await expect(prepare(input())).resolves.toMatchObject({ accepted: false, reason: "SOURCE_INTEGRITY_FAILED" });
    record.orders[0].order.items = Array(501).fill(record.orders[0].order.items[0]);
    mocks.invoice.mockResolvedValueOnce(record);
    await expect(prepare(input())).resolves.toMatchObject({ accepted: false, reason: "SOURCE_INTEGRITY_FAILED" });
    await expect(prepare({ ...input(), mimeType: "text/html" })).resolves.toMatchObject({
      accepted: false, reason: "INVALID_CONTENT_TYPE",
    });
  });
});

async function reviewFixture() {
  const upload = await prepare(input());
  if (!upload.accepted) throw new Error("invalid test invoice");
  const evidence = {
    id: "evidence-one", invoiceId: upload.invoiceId, sellerTenantId: actor.tenantId,
    sourceInvoiceNumber: upload.sourceInvoiceNumber, submittedByUserId: "user-other",
    invoiceSnapshotSha256: upload.sourceSnapshotSha256, documentObjectRef: upload.proposedPrivateObjectKey,
    documentVersionId: "stored-v1", documentSha256: upload.sha256, documentByteLength: upload.byteLength,
    hasDecision: false,
  };
  return {
    evidence,
    request: {
      invoiceId: evidence.invoiceId, evidenceId: evidence.id,
      inspectedVersionId: evidence.documentVersionId, inspectedDocumentSha256: evidence.documentSha256,
      observation: { originalInvoiceNumber: "INV-01", explicitCurrency: "JPY", inspectedOriginal: true },
    },
    deps: {
      readEvidence: vi.fn().mockResolvedValue(evidence),
      readStoredVersion: vi.fn().mockResolvedValue(input().bytes),
    },
  };
}

describe("authenticated independent review preparation", () => {
  it("reads seller-scoped pending evidence in the source transaction, then reads the exact stored version outside it", async () => {
    const { evidence, request, deps } = await reviewFixture();
    let inTransaction = false;
    mocks.transaction.mockImplementationOnce(async callback => {
      inTransaction = true;
      try { return await callback(tx); } finally { inTransaction = false; }
    });
    deps.readEvidence.mockImplementationOnce(async () => {
      expect(inTransaction).toBe(true);
      return evidence;
    });
    deps.readStoredVersion.mockImplementationOnce(async () => {
      expect(inTransaction).toBe(false);
      return input().bytes;
    });
    const forgedFields = { reviewerUserId: "user-other", tenantId: "tenant-b", documentObjectRef: "browser-supplied-key" };
    await expect(review({ ...request, ...forgedFields }, deps)).resolves.toEqual({
      ready: true, observedDocumentSha256: evidence.documentSha256,
      observedInvoiceSnapshotSha256: evidence.invoiceSnapshotSha256,
      reviewRecorded: false, currencyVerified: false, financialPostingAllowed: false,
    });
    expect(deps.readEvidence).toHaveBeenCalledWith(tx, {
      evidenceId: evidence.id, invoiceId: evidence.invoiceId, sellerTenantId: actor.tenantId,
    });
    expect(deps.readStoredVersion).toHaveBeenCalledWith(
      { invoiceId: evidence.invoiceId, sellerTenantId: actor.tenantId },
      expect.objectContaining({ key: evidence.documentObjectRef, versionId: evidence.documentVersionId }),
    );
  });

  it("stops an invalid id or a revoked role before the ledger or storage is called", async () => {
    const { request, deps } = await reviewFixture();
    await expect(review({ ...request, evidenceId: "../evidence" }, deps)).resolves.toMatchObject({ ready: false });
    mocks.user.mockResolvedValueOnce({ ...actor, role: "STAFF" });
    await expect(review(request, deps)).resolves.toEqual({ ready: false, reason: "REVIEW_UNAVAILABLE" });
    expect(deps.readEvidence).not.toHaveBeenCalled();
    expect(deps.readStoredVersion).not.toHaveBeenCalled();
  });

  it.each([
    { id: "evidence-other" }, { sellerTenantId: "tenant-b" }, { invoiceId: "invoice-other" },
    { submittedByUserId: actor.id }, { hasDecision: true }, { hasDecision: undefined },
    { invoiceSnapshotSha256: "b".repeat(64) }, { sourceInvoiceNumber: "INV-02" },
    { documentVersionId: "null" }, { documentByteLength: 10 * 1024 * 1024 + 1 },
    { documentObjectRef: "b2b-credit-evidence/tenant-b/invoice-one/3cf2815e-13ee-49d0-a3e4-077d4a28894e.pdf" },
  ])("rejects out-of-scope, stale, decided or malformed ledger records without S3 access", async override => {
    const { evidence, request, deps } = await reviewFixture();
    deps.readEvidence.mockResolvedValueOnce({ ...evidence, ...override });
    await expect(review(request, deps)).resolves.toEqual({ ready: false, reason: "REVIEW_UNAVAILABLE" });
    expect(deps.readStoredVersion).not.toHaveBeenCalled();
  });

  it.each([
    { inspectedVersionId: "old-version" }, { inspectedDocumentSha256: "b".repeat(64) },
    { observation: { originalInvoiceNumber: "INV-01", explicitCurrency: "USD", inspectedOriginal: true } },
  ])("won't substitute a different version, bytes, or currency for the reviewer's observations", async override => {
    const { request, deps } = await reviewFixture();
    await expect(review({ ...request, ...override }, deps)).resolves.toEqual({
      ready: false, reason: "OBSERVATION_MISMATCH",
    });
    expect(deps.readStoredVersion).not.toHaveBeenCalled();
  });

  it("never verifies corrupted or absent document bytes", async () => {
    const { request, deps } = await reviewFixture();
    deps.readStoredVersion.mockResolvedValueOnce(new Uint8Array(input().bytes.byteLength));
    await expect(review(request, deps)).resolves.toEqual({ ready: false, reason: "DOCUMENT_UNAVAILABLE" });
    deps.readEvidence.mockResolvedValueOnce(null);
    await expect(review(request, deps)).resolves.toEqual({ ready: false, reason: "REVIEW_UNAVAILABLE" });
    expect(deps.readStoredVersion).toHaveBeenCalledTimes(1);
  });
});
