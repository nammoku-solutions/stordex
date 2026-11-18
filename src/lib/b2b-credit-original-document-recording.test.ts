import { describe, expect, it, vi } from "vitest";
import { recordConfirmedOriginalInvoice as record } from "./b2b-credit-original-document-recording";

type RecordPort = Parameters<typeof record>[1]["recordIfCurrent"];
type Candidate = Parameters<RecordPort>[0];
const confirmed = () => ({
  stored: true as const, evidenceRecorded: false as const, currencyVerified: false as const,
  financialPostingAllowed: false as const,
  submission: {
    receipt: {
      sellerTenantId: "tenant-a", invoiceId: "invoice-a",
      key: "b2b-credit-evidence/tenant-a/invoice-a/2fdc32d3-ad92-4d16-888f-ac6aaadd2274.pdf",
      versionId: "version-1", sha256: "a".repeat(64), byteLength: 400,
    },
    sourceInvoiceNumber: "INV-001", submittedByUserId: "actor-a", invoiceSnapshotSha256: "b".repeat(64),
  },
});

describe("exact-version evidence recording", () => {
  it("reuses one ID and row when the insert committed but the acknowledgement was lost", async () => {
    const ledger = new Map<string, Candidate>();
    const write = vi.fn<RecordPort>(async request => {
      const existing = ledger.get(request.evidenceId);
      if (existing) return { status: "EXISTING", record: existing };
      ledger.set(request.evidenceId, request);
      throw new Error("DB response lost after commit");
    });
    const stored = confirmed();
    const first = await record(stored, { recordIfCurrent: write });
    expect(first).toMatchObject({ recorded: true, currencyVerified: false, financialPostingAllowed: false });
    expect(write.mock.calls).toHaveLength(2);
    expect(write.mock.calls[0][0]).toEqual(write.mock.calls[1][0]);
    await expect(record(stored, { recordIfCurrent: write })).resolves.toEqual(first);
    expect(ledger.size).toBe(1);
  });

  it.each([
    (row: Candidate) => ({ ...row, sellerTenantId: "ignored", submittedByUserId: "someone-else" }),
    (row: Candidate) => ({ ...row, invoiceSnapshotSha256: "d".repeat(64) }),
    (row: Candidate) => ({ ...row, receipt: { ...row.receipt, versionId: "version-2" } }),
    (row: Candidate) => ({ ...row, receipt: { ...row.receipt, sha256: "c".repeat(64) } }),
  ])("rejects an existing row that belongs to a different submission", async alter => {
    const write = vi.fn<RecordPort>(async request => ({ status: "EXISTING", record: alter(request) }));
    await expect(record(confirmed(), { recordIfCurrent: write })).resolves.toEqual({
      recorded: false, reason: "RECEIPT_CONFLICT",
    });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("does not retry a source change, and bounds repeated transient failures", async () => {
    const gone = vi.fn<RecordPort>().mockResolvedValue({ status: "SOURCE_CHANGED" });
    await expect(record(confirmed(), { recordIfCurrent: gone })).resolves.toMatchObject({ reason: "SOURCE_CHANGED" });
    expect(gone).toHaveBeenCalledTimes(1);
    const retry = vi.fn<RecordPort>().mockResolvedValue({ status: "RETRYABLE" });
    await expect(record(confirmed(), { recordIfCurrent: retry })).resolves.toMatchObject({ reason: "RECORD_UNCONFIRMED" });
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it("will not try recording an unconfirmed version or invalid server metadata", async () => {
    const write = vi.fn<RecordPort>();
    const input = confirmed();
    input.submission.receipt.versionId = "null";
    await expect(record(input, { recordIfCurrent: write })).resolves.toMatchObject({ reason: "INVALID_RECEIPT" });
    expect(write).not.toHaveBeenCalled();
  });
});
