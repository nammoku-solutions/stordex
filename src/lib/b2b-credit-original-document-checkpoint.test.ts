import { chmod, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOriginalInvoiceRecordingCheckpoint as checkpoint } from "./b2b-credit-original-document-checkpoint";
import type { ConfirmedOriginalInvoice, recordConfirmedOriginalInvoice } from "./b2b-credit-original-document-recording";

const stored: ConfirmedOriginalInvoice = {
  stored: true, evidenceRecorded: false, currencyVerified: false, financialPostingAllowed: false,
  submission: {
    receipt: {
      sellerTenantId: "tenant-a", invoiceId: "invoice-a",
      key: "b2b-credit-evidence/tenant-a/invoice-a/2fdc32d3-ad92-4d16-888f-ac6aaadd2274.pdf",
      versionId: "version-1", sha256: "a".repeat(64), byteLength: 400,
    },
    sourceInvoiceNumber: "INV-001", submittedByUserId: "actor-a", invoiceSnapshotSha256: "b".repeat(64),
  },
};
type Port = Parameters<typeof recordConfirmedOriginalInvoice>[1]["recordIfCurrent"];

describe.skipIf(process.platform === "win32")("durable original invoice checkpoint", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "stordex-evidence-")); });
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it("resumes from disk after losing all acknowledgements for a committed insert", async () => {
    const firstWorker = await checkpoint(dir);
    const id = await firstWorker.save(stored);
    expect((await stat(join(dir, id + ".json"))).mode & 0o777).toBe(0o600);
    const rows = new Map<string, Parameters<Port>[0]>();
    const lost = vi.fn<Port>(async candidate => {
      if (!rows.has(id)) rows.set(id, candidate);
      throw new Error("response lost");
    });
    await expect(firstWorker.resume(id, { recordIfCurrent: lost })).resolves.toMatchObject({ reason: "RECORD_UNCONFIRMED" });
    expect(lost).toHaveBeenCalledTimes(2);

    const nextWorker = await checkpoint(dir);
    expect(await nextWorker.pendingIds()).toEqual([id]);
    const existing = vi.fn<Port>(async candidate => {
      const record = rows.get(candidate.evidenceId);
      if (!record) throw new Error("unexpected evidence ID");
      return { status: "EXISTING", record };
    });
    await expect(nextWorker.resume(id, { recordIfCurrent: existing })).resolves.toEqual({
      recorded: true, evidenceId: id, currencyVerified: false, financialPostingAllowed: false,
    });
    expect(existing).toHaveBeenCalledTimes(1);
    expect(rows.size).toBe(1);
    expect(await nextWorker.pendingIds()).toEqual([]);
    await expect(nextWorker.resume(id, { recordIfCurrent: existing })).resolves.toMatchObject({ reason: "CHECKPOINT_NOT_FOUND" });
  });

  it("publishes one private receipt per exact version and never overwrites differing metadata", async () => {
    const queue = await checkpoint(dir);
    const [id, duplicate] = await Promise.all([queue.save(stored), queue.save(stored)]);
    expect(duplicate).toBe(id);
    const path = join(dir, id + ".json");
    expect(await readdir(dir)).toEqual([id + ".json"]);
    const payload = await readFile(path, "utf8");
    await expect(queue.save({
      ...stored, submission: { ...stored.submission, submittedByUserId: "actor-b" },
    })).rejects.toThrow("Checkpoint receipt conflict");
    expect(await readFile(path, "utf8")).toBe(payload);
    expect(await queue.save({
      ...stored, submission: { ...stored.submission, receipt: { ...stored.submission.receipt, versionId: "version-2" } },
    })).not.toBe(id);
    expect(await queue.pendingIds()).toHaveLength(2);
  });

  it("retains receipts when the rechecked source changed or the returned row differs", async () => {
    const queue = await checkpoint(dir);
    const id = await queue.save(stored);
    await expect(queue.resume(id, { recordIfCurrent: async () => ({ status: "SOURCE_CHANGED" }) }))
      .resolves.toMatchObject({ reason: "SOURCE_CHANGED" });
    await expect(queue.resume(id, {
      recordIfCurrent: async record => ({ status: "EXISTING", record: { ...record, sourceInvoiceNumber: "OTHER" } }),
    })).resolves.toMatchObject({ reason: "RECEIPT_CONFLICT" });
    expect(await queue.pendingIds()).toEqual([id]);
  });

  it("rejects tampered versions, symlinks, traversal and directories accessible to other users", async () => {
    const queue = await checkpoint(dir);
    const id = await queue.save(stored);
    const port = vi.fn<Port>();
    const path = join(dir, id + ".json");
    await expect(queue.resume("../arbitrary", { recordIfCurrent: port })).rejects.toThrow("Invalid checkpoint ID");
    await writeFile(path, (await readFile(path, "utf8")).replace("version-1", "version-2"));
    await expect(queue.resume(id, { recordIfCurrent: port })).rejects.toThrow("Invalid checkpoint receipt");
    await rm(path);
    await symlink(join(dir, "missing.json"), path);
    await expect(queue.resume(id, { recordIfCurrent: port })).rejects.toMatchObject({ code: "ELOOP" });
    await chmod(dir, 0o755);
    await expect(checkpoint(dir)).rejects.toThrow("inaccessible to other users");
    expect(port).not.toHaveBeenCalled();
  });
});
