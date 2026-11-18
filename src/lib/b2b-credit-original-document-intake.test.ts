import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeInspectedOriginalInvoice } from "./b2b-credit-original-document-intake";
import { createOriginalInvoiceRecordingCheckpoint } from "./b2b-credit-original-document-checkpoint";

const prepare = vi.hoisted(() => vi.fn());
vi.mock("./b2b-credit-original-document-source", () => ({ prepareAuthenticatedOriginalInvoiceDocument: prepare }));

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const file = () => Buffer.from("%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n");
type Put = Parameters<typeof storeInspectedOriginalInvoice>[1]["storage"]["put"];

const candidate = () => ({
  accepted: true,
  invoiceId: "invoice-one", sellerTenantId: "tenant-one", submittedByUserId: "actor-one",
  sourceInvoiceNumber: "INV-01", sourceSnapshotSha256: "a".repeat(64),
  proposedPrivateObjectKey: "b2b-credit-evidence/tenant-one/invoice-one/bec47c1a-44f2-45d2-b430-fb854ae17c68.pdf",
  sha256: digest(file()), byteLength: file().length,
});

function fixture() {
  return {
    input: { invoiceId: "invoice-one", filename: "invoice.pdf", mimeType: "application/pdf", bytes: file() },
    dependencies: {
      inspectPdf: vi.fn(async (bytes: Uint8Array) => ({ verdict: "CLEAN" as const, inspectedSha256: digest(bytes) })),
      storage: { put: vi.fn<Put>(async identity => ({ ...identity, versionId: "storage-v1" })) },
      saveIntent: vi.fn<Parameters<typeof storeInspectedOriginalInvoice>[1]["saveIntent"]>()
        .mockResolvedValue("synthetic-intent"),
    },
  };
}

beforeEach(() => {
  prepare.mockReset();
  prepare.mockImplementation(async () => candidate());
});

describe("original invoice custody intake", () => {
  it("inspects a copy, reauthorizes, and stores precisely the same bytes with server-owned scope", async () => {
    const { input, dependencies } = fixture();
    dependencies.inspectPdf.mockImplementationOnce(async inspected => {
      expect(inspected).not.toBe(input.bytes);
      expect(inspected).toEqual(file());
      input.bytes.fill(0);
      return { verdict: "CLEAN", inspectedSha256: digest(inspected) };
    });
    await expect(storeInspectedOriginalInvoice(input, dependencies)).resolves.toEqual({
      stored: true, evidenceRecorded: false, currencyVerified: false, financialPostingAllowed: false,
      submission: {
        receipt: { sellerTenantId: "tenant-one", invoiceId: input.invoiceId, key: candidate().proposedPrivateObjectKey,
          versionId: "storage-v1", byteLength: file().length, sha256: digest(file()) },
        sourceInvoiceNumber: "INV-01", submittedByUserId: "actor-one", invoiceSnapshotSha256: "a".repeat(64),
      },
    });
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(dependencies.storage.put.mock.calls[0][1]).toEqual(file());
    expect(prepare.mock.invocationCallOrder[1]).toBeLessThan(dependencies.storage.put.mock.invocationCallOrder[0]);
    expect(dependencies.saveIntent.mock.invocationCallOrder[0]).toBeLessThan(dependencies.storage.put.mock.invocationCallOrder[0]);
    expect(dependencies.saveIntent.mock.calls[0][0].identity).toEqual(dependencies.storage.put.mock.calls[0][0]);
  });

  it("never scans or stores rejected source requests", async () => {
    const { input, dependencies } = fixture();
    prepare.mockResolvedValueOnce({ accepted: false, reason: "SOURCE_UNAVAILABLE" });
    await expect(storeInspectedOriginalInvoice(input, dependencies)).resolves.toEqual({
      stored: false, reason: "SOURCE_UNAVAILABLE",
    });
    expect(dependencies.inspectPdf).not.toHaveBeenCalled();
    expect(dependencies.saveIntent).not.toHaveBeenCalled();
    expect(dependencies.storage.put).not.toHaveBeenCalled();
  });

  it.each([
    { verdict: "BLOCKED" }, { verdict: "UNAVAILABLE" },
    { verdict: "CLEAN", inspectedSha256: "f".repeat(64) }, null,
  ])("requires an explicit clean verdict carrying the digest of the intake bytes", async result => {
    const { input, dependencies } = fixture();
    const inspectPdf = vi.fn().mockResolvedValue(result);
    await expect(storeInspectedOriginalInvoice(input, { ...dependencies, inspectPdf })).resolves.toEqual({
      stored: false, reason: "INSPECTION_NOT_CLEARED",
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(dependencies.storage.put).not.toHaveBeenCalled();
  });

  it("does not store if inspection fails or mutates the supplied copy", async () => {
    const { input, dependencies } = fixture();
    dependencies.inspectPdf.mockRejectedValueOnce(new Error("scanner error"));
    dependencies.inspectPdf.mockImplementationOnce(async scanned => {
      scanned[0] = 0;
      return { verdict: "CLEAN", inspectedSha256: digest(file()) };
    });
    for (let i = 0; i < 2; i++) {
      await expect(storeInspectedOriginalInvoice(input, dependencies)).resolves.toEqual({
        stored: false, reason: "INSPECTION_NOT_CLEARED",
      });
    }
    expect(dependencies.storage.put).not.toHaveBeenCalled();
  });

  it.each([
    { accepted: false, reason: "SOURCE_UNAVAILABLE" }, { sourceSnapshotSha256: "b".repeat(64) },
    { submittedByUserId: "actor-other" }, { sellerTenantId: "tenant-other" },
  ])("does not store when authorization or source data changes during inspection", async changes => {
    const { input, dependencies } = fixture();
    prepare.mockResolvedValueOnce(candidate()).mockResolvedValueOnce({ ...candidate(), ...changes });
    await expect(storeInspectedOriginalInvoice(input, dependencies)).resolves.toEqual({
      stored: false, reason: "SOURCE_CHANGED",
    });
    expect(dependencies.storage.put).not.toHaveBeenCalled();
  });

  it("does not treat a failed or mismatched storage receipt as evidence and does not retry", async () => {
    const { input, dependencies } = fixture();
    dependencies.storage.put.mockImplementationOnce(async identity => ({ ...identity, versionId: "null" }));
    dependencies.storage.put.mockImplementationOnce(async identity => ({ ...identity, sha256: "f".repeat(64), versionId: "v2" }));
    dependencies.storage.put.mockRejectedValueOnce(new Error("write status unknown"));
    for (let i = 0; i < 3; i++) {
      await expect(storeInspectedOriginalInvoice(input, dependencies)).resolves.toEqual({
        stored: false, reason: "STORAGE_UNCONFIRMED",
      });
      expect(dependencies.storage.put).toHaveBeenCalledTimes(i + 1);
    }
  });

  it("never puts an object if the intent cannot be persisted first", async () => {
    const { input, dependencies } = fixture();
    dependencies.saveIntent.mockRejectedValueOnce(new Error("disk unavailable"));
    await expect(storeInspectedOriginalInvoice(input, dependencies)).resolves.toEqual({
      stored: false, reason: "INTENT_UNCONFIRMED",
    });
    expect(dependencies.storage.put).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === "win32")("recovers a lost PUT acknowledgment from the persisted intent without another PUT", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stordex-intake-"));
    try {
      const first = await createOriginalInvoiceRecordingCheckpoint(directory);
      const { input, dependencies } = fixture();
      let committed: Awaited<ReturnType<Put>> | undefined;
      dependencies.storage.put.mockImplementationOnce(async identity => {
        committed = { ...identity, versionId: "committed-version" };
        throw new Error("connection lost after PUT");
      });
      await expect(storeInspectedOriginalInvoice(input, { ...dependencies, saveIntent: first.saveIntent }))
        .resolves.toEqual({ stored: false, reason: "STORAGE_UNCONFIRMED" });
      expect(await first.pendingIds()).toEqual([]);
      await expect(storeInspectedOriginalInvoice(input, { ...dependencies, saveIntent: first.saveIntent }))
        .resolves.toEqual({ stored: false, reason: "INTENT_UNCONFIRMED" });
      const restart = await createOriginalInvoiceRecordingCheckpoint(directory);
      const [id] = await restart.pendingIntentIds();
      expect(id).toMatch(/^intent-/);
      const recordIfCurrent = vi.fn(async (record: Parameters<Parameters<typeof restart.resumeIntent>[1]["recordIfCurrent"]>[0]) =>
        ({ status: "INSERTED" as const, record }));
      const recover = vi.fn(async () => ({ ...committed!, versionId: "null" }));
      await expect(restart.resumeIntent(id, { storage: { recover }, recordIfCurrent }))
        .resolves.toMatchObject({ reason: "STORAGE_UNCONFIRMED" });
      recover.mockResolvedValueOnce({ ...committed!, sha256: "b".repeat(64) });
      await expect(restart.resumeIntent(id, { storage: { recover }, recordIfCurrent }))
        .resolves.toMatchObject({ reason: "STORAGE_UNCONFIRMED" });
      expect(recordIfCurrent).not.toHaveBeenCalled();
      expect(await restart.pendingIntentIds()).toEqual([id]);
      recover.mockResolvedValueOnce(committed!);
      await expect(restart.resumeIntent(id, { storage: { recover }, recordIfCurrent }))
        .resolves.toMatchObject({ recorded: true, currencyVerified: false, financialPostingAllowed: false });
      expect(recordIfCurrent.mock.calls[0][0].receipt.versionId).toBe("committed-version");
      expect(await restart.pendingIntentIds()).toEqual([]);
      expect(dependencies.storage.put).toHaveBeenCalledTimes(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
