import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createClamdOriginalInvoiceInspector } from "../src/lib/b2b-credit-original-document-clamd";
import { buildSyntheticPdf } from "./smoke-stordex-evidence-sandbox";

async function main() {
  assert.ok(process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true" && process.env.APP_ENV === "ci",
    "This smoke is restricted to disposable GitHub Actions CI");
  const directory = await mkdtemp(join(tmpdir(), "stordex-clam-"));
  let daemon: ReturnType<typeof spawn> | undefined;
  let closed: Promise<void> | undefined;
  let launchError: Error | undefined;
  const socketPath = join(directory, "clamd.sock");
  try {
    const db = join(directory, "db");
    const config = join(directory, "clamd.conf");
    const rejectedMarker = randomUUID();
    await mkdir(db, { mode: 0o700 });
    // This local signature only marks an inert UUID inserted into a generated PDF.
    await writeFile(join(db, "synthetic.ndb"),
      "Stordex.CI.SyntheticMarker:0:*:" + Buffer.from(rejectedMarker).toString("hex") + "\n");
    await writeFile(config, [
      "Foreground yes", "LocalSocket " + socketPath, "LocalSocketMode 600",
      "DatabaseDirectory " + db, "ScanPDF yes", "Bytecode no", "",
    ].join("\n"), { mode: 0o600 });
    daemon = spawn("clamd", ["--config-file=" + config], { stdio: ["ignore", "inherit", "inherit"] });
    daemon.once("error", error => { launchError = error; });
    const child = daemon;
    closed = new Promise(resolve => child.once("close", () => resolve()));
    const stopAt = Date.now() + 15_000;
    for (;;) {
      if (launchError) throw launchError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("clamd exited before socket readiness");
      const socket = await lstat(socketPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return undefined;
      });
      if (socket) {
        assert.ok(socket.isSocket());
        assert.equal(socket.mode & 0o777, 0o600);
        break;
      }
      if (Date.now() >= stopAt) throw new Error("clamd did not open its Unix socket");
      await delay(100);
    }
    const inspect = createClamdOriginalInvoiceInspector({ socketPath, timeoutMs: 5_000 });
    const clean = buildSyntheticPdf(randomUUID());
    assert.deepEqual(await inspect(clean), {
      verdict: "CLEAN", inspectedSha256: createHash("sha256").update(clean).digest("hex"),
    });
    assert.deepEqual(await inspect(buildSyntheticPdf(rejectedMarker)), { verdict: "BLOCKED" });
    assert.deepEqual(await createClamdOriginalInvoiceInspector({
      socketPath: join(directory, "absent.sock"), timeoutMs: 1_000,
    })(clean), { verdict: "UNAVAILABLE" });
    console.log("CLAMD_REAL_ENGINE_SMOKE_PASS");
  } finally {
    if (daemon && closed) {
      daemon.kill("SIGTERM");
      await Promise.race([closed, delay(2_000, undefined, { ref: false })]);
      if (daemon.exitCode === null && daemon.signalCode === null) daemon.kill("SIGKILL");
      await closed;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
