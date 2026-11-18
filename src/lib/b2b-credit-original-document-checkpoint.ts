/**
 * Private single-worker filesystem checkpoint for invoice write intents and receipts.
 * Configure only on a persistent trusted volume, never on Vercel's temp FS.
 * No PDF contents, credentials, AWS calls, or authorization logic here.
 */
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, readdir, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { OriginalInvoiceWriteIntent } from "./b2b-credit-original-document-intake";
import {
  isValidOriginalInvoiceObjectIdentity, originalInvoiceReceiptMatches,
  type createOriginalInvoicePrivateStorage,
} from "./b2b-credit-original-document-storage";
import {
  confirmedOriginalInvoiceEvidenceId,
  parseConfirmedOriginalInvoice,
  recordConfirmedOriginalInvoice,
  type ConfirmedOriginalInvoice,
} from "./b2b-credit-original-document-recording";

const maxBytes = 8 * 1024;
const idPattern = /^evidence-[a-f0-9]{64}$/;
const intentPattern = /^intent-[a-f0-9]{64}$/;
const noEntry = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";
const alreadyExists = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "EEXIST";
const intentId = (intent: OriginalInvoiceWriteIntent) =>
  "intent-" + createHash("sha256").update(intent.identity.key).digest("hex");

function parseIntent(value: unknown): OriginalInvoiceWriteIntent | null {
  const candidate = value as Partial<OriginalInvoiceWriteIntent> | null;
  if (!isValidOriginalInvoiceObjectIdentity(candidate?.identity) ||
      typeof candidate?.sourceInvoiceNumber !== "string" ||
      !candidate.sourceInvoiceNumber.trim() || candidate.sourceInvoiceNumber.trim().length > 128 ||
      typeof candidate.submittedByUserId !== "string" || !/^[A-Za-z0-9_-]{3,128}$/.test(candidate.submittedByUserId) ||
      typeof candidate.invoiceSnapshotSha256 !== "string" || !/^[a-f0-9]{64}$/.test(candidate.invoiceSnapshotSha256)) return null;
  const { sellerTenantId, invoiceId, key, sha256, byteLength } = candidate.identity;
  return { identity: { sellerTenantId, invoiceId, key, sha256, byteLength },
    sourceInvoiceNumber: candidate.sourceInvoiceNumber, submittedByUserId: candidate.submittedByUserId,
    invoiceSnapshotSha256: candidate.invoiceSnapshotSha256 };
}

export async function createOriginalInvoiceRecordingCheckpoint(directory: string) {
  if (!isAbsolute(directory) || typeof process.getuid !== "function") throw new Error("A private Unix checkpoint directory is required");
  const uid = process.getuid();
  const info = await lstat(directory);
  if (!info.isDirectory() || info.uid !== uid || (info.mode & 0o077) !== 0) {
    throw new Error("Checkpoint directory must be owned by the worker and inaccessible to other users");
  }

  function pathFor(id: string, pattern: RegExp) {
    if (typeof id !== "string" || !pattern.test(id)) throw new Error("Invalid checkpoint ID");
    return join(directory, id + ".json");
  }

  async function syncDirectory() {
    const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  }

  async function load<T>(id: string, pattern: RegExp, parse: (value: unknown) => T | null, deriveId: (value: T) => string): Promise<T | null> {
    let handle;
    try {
      handle = await open(pathFor(id, pattern), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (error) {
      if (noEntry(error)) return null;
      throw error;
    }
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.uid !== uid || (info.mode & 0o077) !== 0 || info.size > maxBytes) {
        throw new Error("Unsafe checkpoint file");
      }
      const payload = await handle.readFile("utf8");
      const parsed = parse(JSON.parse(payload));
      if (!parsed || deriveId(parsed) !== id) throw new Error("Invalid checkpoint receipt");
      return parsed;
    } finally {
      await handle.close();
    }
  }

  async function publish<T>(id: string, pattern: RegExp, normalized: T, readExisting?: (id: string) => Promise<T | null>) {
    const payload = JSON.stringify(normalized);
    if (Buffer.byteLength(payload) > maxBytes) throw new Error("Checkpoint exceeds size limit");
    const temp = join(directory, "." + randomUUID() + ".tmp");
    const handle = await open(temp, "wx", 0o600);
    try {
      try { await handle.writeFile(payload, "utf8"); await handle.sync(); } finally { await handle.close(); }
      try {
        // Hard-link publication is atomic and never overwrites this ID.
        await link(temp, pathFor(id, pattern));
      } catch (error) {
        if (!alreadyExists(error)) throw error;
        if (!readExisting) throw new Error("Write intent already exists; resume the existing intent");
        if (JSON.stringify(await readExisting(id)) !== payload) throw new Error("Checkpoint receipt conflict");
      }
      await syncDirectory();
      return id;
    } finally {
      await unlink(temp);
    }
  }

  async function list(pattern: RegExp) {
    return (await readdir(directory, { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
      .map(entry => entry.name.slice(0, -5)).filter(id => pattern.test(id)).sort();
  }

  async function remove(id: string, pattern: RegExp) {
    try { await unlink(pathFor(id, pattern)); } catch (error) { if (!noEntry(error)) throw error; }
    await syncDirectory();
  }

  const loadReceipt = (id: string) => load(id, idPattern, parseConfirmedOriginalInvoice, confirmedOriginalInvoiceEvidenceId);
  const loadIntent = (id: string) => load(id, intentPattern, parseIntent, intentId);
  type RecordDependencies = Parameters<typeof recordConfirmedOriginalInvoice>[1];

  return {
    async save(stored: ConfirmedOriginalInvoice): Promise<string> {
      const normalized = parseConfirmedOriginalInvoice(stored);
      if (!normalized) throw new Error("Invalid checkpoint receipt");
      return publish(confirmedOriginalInvoiceEvidenceId(normalized), idPattern, normalized, loadReceipt);
    },
    pendingIds: () => list(idPattern),
    async resume(id: string, dependencies: RecordDependencies) {
      const receipt = await loadReceipt(id);
      if (!receipt) return { recorded: false, reason: "CHECKPOINT_NOT_FOUND" } as const;
      const result = await recordConfirmedOriginalInvoice(receipt, dependencies);
      if (result.recorded) await remove(id, idPattern);
      return result;
    },
    async saveIntent(value: OriginalInvoiceWriteIntent): Promise<string> {
      const normalized = parseIntent(value);
      if (!normalized) throw new Error("Invalid original invoice write intent");
      return publish(intentId(normalized), intentPattern, normalized);
    },
    pendingIntentIds: () => list(intentPattern),
    async resumeIntent(id: string, dependencies: RecordDependencies & {
      storage: Pick<ReturnType<typeof createOriginalInvoicePrivateStorage>, "recover">;
    }) {
      const intent = await loadIntent(id);
      if (!intent) return { recorded: false, reason: "INTENT_NOT_FOUND" } as const;
      const { identity, ...provenance } = intent;
      let receipt;
      try {
        receipt = await dependencies.storage.recover({ ...identity });
      } catch {
        return { recorded: false, reason: "STORAGE_UNCONFIRMED" } as const;
      }
      if (!originalInvoiceReceiptMatches(identity, receipt)) {
        return { recorded: false, reason: "STORAGE_UNCONFIRMED" } as const;
      }
      const result = await recordConfirmedOriginalInvoice({
        stored: true, evidenceRecorded: false, currencyVerified: false, financialPostingAllowed: false,
        submission: { receipt: { ...identity, versionId: receipt.versionId }, ...provenance },
      }, dependencies);
      if (result.recorded) await remove(id, intentPattern);
      return result;
    },
  };
}
