import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createClamdOriginalInvoiceInspector } from "./b2b-credit-original-document-clamd";

const pdf = Buffer.from("%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n");
const command = Buffer.from("zINSTREAM\0");

async function mockDaemon(reply: (socket: Socket) => void, test: (socketPath: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "stordex-clamd-"));
  const socketPath = join(dir, "test.sock");
  const clients = new Set<Socket>();
  const server = createServer(socket => {
    clients.add(socket);
    socket.once("close", () => clients.delete(socket));
    socket.on("error", () => {});
    const chunks: Buffer[] = [];
    let received = 0;
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      received += chunk.length;
      if (received < command.length + 8 + pdf.length) return;
      const frame = Buffer.concat(chunks);
      expect(frame.subarray(0, command.length)).toEqual(command);
      expect(frame.readUInt32BE(command.length)).toBe(pdf.length);
      expect(frame.subarray(command.length + 4, -4)).toEqual(pdf);
      expect(frame.readUInt32BE(frame.length - 4)).toBe(0);
      reply(socket);
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    await test(socketPath);
  } finally {
    for (const client of clients) client.destroy();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}

describe("local ClamAV custody adapter", () => {
  it("streams only the captured PDF bytes and binds CLEAN to their exact digest", async () => {
    await mockDaemon(socket => {
      socket.write("stream:");
      socket.end(" OK\0");
    }, async socketPath => {
      const inspect = createClamdOriginalInvoiceInspector({ socketPath });
      const mutable = Buffer.from(pdf);
      const pending = inspect(mutable);
      mutable.fill(0);
      await expect(pending).resolves.toEqual({
        verdict: "CLEAN",
        inspectedSha256: createHash("sha256").update(pdf).digest("hex"),
      });
    });
  });

  it.each([
    ["stream: Policy.Test FOUND\0", "BLOCKED"],
    ["INSTREAM size limit exceeded. ERROR\0", "UNAVAILABLE"],
    ["stream: OK", "UNAVAILABLE"],
    ["stream: OK\0unexpected second response", "UNAVAILABLE"],
    ["x".repeat(2000), "UNAVAILABLE"],
  ])("fails closed for anything other than the exact complete clean frame", async (wire, verdict) => {
    await mockDaemon(socket => socket.end(wire), async socketPath => {
      await expect(createClamdOriginalInvoiceInspector({ socketPath })(pdf)).resolves.toEqual({ verdict });
    });
  });

  it("bounds the total duration even if a daemon accepts the request but never responds", async () => {
    await mockDaemon(() => {}, async socketPath => {
      await expect(createClamdOriginalInvoiceInspector({ socketPath, timeoutMs: 300 })(pdf))
        .resolves.toEqual({ verdict: "UNAVAILABLE" });
    });
  });

  it("does not treat an unavailable socket or a bad config as a scan", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stordex-no-clamd-"));
    try {
      await expect(createClamdOriginalInvoiceInspector({ socketPath: join(dir, "missing.sock") })(pdf))
        .resolves.toEqual({ verdict: "UNAVAILABLE" });
      expect(() => createClamdOriginalInvoiceInspector({ socketPath: "127.0.0.1:3310" })).toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
