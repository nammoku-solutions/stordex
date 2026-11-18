/** Private, same-host ClamAV adapter for a future invoice intake worker. */
import { createHash } from "node:crypto";
import { createConnection } from "node:net";
import { isAbsolute } from "node:path";
import type { OriginalInvoiceInspection } from "./b2b-credit-original-document-intake";
import { MAX_ORIGINAL_INVOICE_PDF_BYTES } from "./b2b-credit-original-document-storage";

const command = Buffer.from("zINSTREAM\0", "ascii");
const maxResponseBytes = 1024;
const unavailable = { verdict: "UNAVAILABLE" } as const;

/**
 * No public or TCP listener. Only server configuration chooses the socket.
 * The caller must run this alongside a maintained clamd with fail-closed scan
 * limits and current signatures. A CLEAN result is not proof of authenticity.
 */
export function createClamdOriginalInvoiceInspector(config: Readonly<{
  socketPath: string;
  timeoutMs?: number;
}>): (input: Uint8Array) => Promise<OriginalInvoiceInspection> {
  const { socketPath, timeoutMs = 10_000 } = config;
  if (!isAbsolute(socketPath) || socketPath.includes("\0") ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("Invalid private clamd configuration");
  }
  return async input => {
    if (!(input instanceof Uint8Array) || input.byteLength < 1 || input.byteLength > MAX_ORIGINAL_INVOICE_PDF_BYTES) {
      return unavailable;
    }
    // Build the exact framed payload before any I/O. Only the digest of these
    // bytes may be attached to the daemon's completed CLEAN response.
    const frame = Buffer.alloc(command.length + 4 + input.byteLength + 4);
    command.copy(frame);
    frame.writeUInt32BE(input.byteLength, command.length);
    frame.set(input, command.length + 4);
    const inspectedSha256 = createHash("sha256").update(frame.subarray(command.length + 4, -4)).digest("hex");

    return new Promise<OriginalInvoiceInspection>(resolve => {
      const socket = createConnection({ path: socketPath });
      let size = 0;
      let done = false;
      const chunks: Buffer[] = [];
      function finish(result: OriginalInvoiceInspection) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(result);
      }
      const timer = setTimeout(() => finish(unavailable), timeoutMs);
      socket.once("connect", () => { socket.write(frame); });
      socket.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxResponseBytes) finish(unavailable);
        else chunks.push(chunk);
      });
      socket.once("error", () => finish(unavailable));
      socket.once("close", () => finish(unavailable));
      socket.once("end", () => {
        const response = Buffer.concat(chunks).toString("latin1");
        if (response === "stream: OK\0") finish({ verdict: "CLEAN", inspectedSha256 });
        else if (/^stream: [\x20-\x7e]{1,1000} FOUND\0$/.test(response)) finish({ verdict: "BLOCKED" });
        else finish(unavailable);
      });
    });
  };
}
