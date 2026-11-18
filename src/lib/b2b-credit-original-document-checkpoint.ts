/**
 * Private single-worker filesystem checkpoint for confirmed invoice receipts.
 * Configure only on a persistent trusted volume, never on Vercel's temp FS.
 * No PDF contents, credentials, AWS calls, or authorization logic here.
 */
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, readdir, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  confirmedOriginalInvoiceEvidenceId,
  parseConfirmedOriginalInvoice,
  recordConfirmedOriginalInvoice,
  type ConfirmedOriginalInvoice,
} from "./b2b-credit-original-document-recording";

const maxBytes = 8 * 1024;
const idPattern = /^evidence-[a-f0-9]{64}$/;
const noEntry = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";
const alreadyExists = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "EEXIST";

export async function createOriginalInvoiceRecordingCheckpoint(directory: string) {
  if (!isAbsolute(directory) || typeof process.getuid !== "function") throw new Error("A private Unix checkpoint directory is required");
  const uid = process.getuid();
  const info = await lstat(directory);
  if (!info.isDirectory() || info.uid !== uid || (info.mode & 0o077) !== 0) {
    throw new Error("Checkpoint directory must be owned by the worker and inaccessible to other users");
  }

  function pathFor(id: string) {
    if (typeof id !== "string" || !idPattern.test(id)) throw new Error("Invalid checkpoint ID");
    return join(directory, id + ".json");
  }

  async function syncDirectory() {
    const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  }

  async function load(id: string): Promise<ConfirmedOriginalInvoice | null> {
    let handle;
    try {
      handle = await open(pathFor(id), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
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
      const parsed = parseConfirmedOriginalInvoice(JSON.parse(payload));
      if (!parsed || confirmedOriginalInvoiceEvidenceId(parsed) !== id) throw new Error("Invalid checkpoint receipt");
      return parsed;
    } finally {
      await handle.close();
    }
  }

  return {
    async save(stored: ConfirmedOriginalInvoice): Promise<string> {
      const normalized = parseConfirmedOriginalInvoice(stored);
      if (!normalized) throw new Error("Invalid checkpoint receipt");
      const id = confirmedOriginalInvoiceEvidenceId(normalized);
      const payload = JSON.stringify(normalized);
      if (Buffer.byteLength(payload) > maxBytes) throw new Error("Checkpoint exceeds size limit");
      const temp = join(directory, "." + randomUUID() + ".tmp");
      const handle = await open(temp, "wx", 0o600);
      try {
        try { await handle.writeFile(payload, "utf8"); await handle.sync(); } finally { await handle.close(); }
        try {
          // Hard-link publication is atomic and never overwrites this ID.
          await link(temp, pathFor(id));
        } catch (error) {
          if (!alreadyExists(error)) throw error;
          if (JSON.stringify(await load(id)) !== payload) throw new Error("Checkpoint receipt conflict");
        }
        await syncDirectory();
        return id;
      } finally {
        await unlink(temp);
      }
    },
    async pendingIds(): Promise<string[]> {
      return (await readdir(directory, { withFileTypes: true }))
        .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
        .map(entry => entry.name.slice(0, -5)).filter(id => idPattern.test(id)).sort();
    },
    async resume(id: string, dependencies: Parameters<typeof recordConfirmedOriginalInvoice>[1]) {
      const receipt = await load(id);
      if (!receipt) return { recorded: false, reason: "CHECKPOINT_NOT_FOUND" } as const;
      const result = await recordConfirmedOriginalInvoice(receipt, dependencies);
      if (result.recorded) {
        try { await unlink(pathFor(id)); } catch (error) { if (!noEntry(error)) throw error; }
        await syncDirectory();
      }
      return result;
    },
  };
}
