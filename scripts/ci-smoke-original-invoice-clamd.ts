import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    const profile = await readFile(new URL("../infra/evidence-uat/clamd.conf", import.meta.url), "utf8");
    assert.doesNotMatch(profile, /^\s*(TCPAddr|TCPSocket)\s/m);
    assert.match(profile, /^OfficialDatabaseOnly yes$/m);
    assert.match(profile, /^FailIfCvdOlderThan 3$/m);
    const group = execFileSync("id", ["-gn"], { encoding: "utf8" }).trim();
    assert.match(group, /^[a-zA-Z0-9_-]+$/);
    // Only the signature source and non-shared socket identity differ in CI.
    await writeFile(config, profile
      .replace(/^LocalSocket .*$/m, "LocalSocket " + socketPath)
      .replace(/^LocalSocketGroup .*$/m, "LocalSocketGroup " + group)
      .replace(/^LocalSocketMode .*$/m, "LocalSocketMode 600")
      .replace(/^DatabaseDirectory .*$/m, "DatabaseDirectory " + db)
      .replace(/^OfficialDatabaseOnly yes$/m, "OfficialDatabaseOnly no")
      .replace(/^FailIfCvdOlderThan .*\n/m, ""), { mode: 0o600 });
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
    const cleanPath = join(directory, "clean.pdf");
    const encryptedPath = join(directory, "encrypted.pdf");
    await writeFile(cleanPath, clean);
    execFileSync("qpdf", ["--encrypt", "ci-only-user", "ci-only-owner", "256", "--", cleanPath, encryptedPath]);
    assert.deepEqual(await inspect(await readFile(encryptedPath)), { verdict: "BLOCKED" },
      "the same scanner policy must reject a password-protected PDF");
    assert.deepEqual(await createClamdOriginalInvoiceInspector({
      socketPath: join(directory, "absent.sock"), timeoutMs: 1_000,
    })(clean), { verdict: "UNAVAILABLE" });
    console.log("CLAMD_REAL_ENGINE_SMOKE_PASS (clean, signature match, encrypted PDF, unavailable socket)");
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
