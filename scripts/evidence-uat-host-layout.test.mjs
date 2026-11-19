import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = name => readFileSync(new URL("../infra/evidence-uat/" + name, import.meta.url), "utf8");

describe("Stordex evidence worker deployment templates", () => {
  it("requires an independently mounted checkpoint filesystem and never enables the feature", () => {
    const app = config("stordex-evidence-uat.service");
    expect(app).toMatch(/^RequiresMountsFor=\/var\/lib\/stordex-evidence$/m);
    expect(app).toMatch(/^ExecStartPre=\/usr\/bin\/mountpoint -q \/var\/lib\/stordex-evidence$/m);
    expect(app).toMatch(/^Environment=STORDEX_EVIDENCE_UAT_CHECKPOINT_DIR=\/var\/lib\/stordex-evidence\/checkpoints$/m);
    expect(app).toMatch(/^Environment=APP_ENV=staging$/m);
    expect(app).not.toContain("STORDEX_B2B_EVIDENCE_UAT_ENABLED=true");
    expect(app).not.toMatch(/^(Requires|BindsTo)=.*stordex-evidence-clamd/m);
  });

  it("exposes only the private Unix scanner with matching consumer permissions and fail-closed scan policy", () => {
    const scanner = config("clamd.conf");
    const app = config("stordex-evidence-uat.service");
    const daemon = config("stordex-evidence-clamd.service");
    const socket = scanner.match(/^LocalSocket (.+)$/m)?.[1];
    const group = scanner.match(/^LocalSocketGroup (.+)$/m)?.[1];
    expect(socket).toBe("/run/stordex-clamd/clamd.sock");
    expect(group).toBe("stordex-evidence");
    expect(app).toContain("STORDEX_EVIDENCE_UAT_CLAMD_SOCKET=" + socket);
    expect(app).toContain("SupplementaryGroups=" + group);
    expect(daemon).toContain("Group=" + group);
    expect(daemon).toMatch(/^RestrictAddressFamilies=AF_UNIX$/m);
    expect(scanner).not.toMatch(/^\s*(TCPSocket|TCPAddr)\s/m);
    for (const line of ["LocalSocketMode 0660", "StreamMaxLength 10M", "ScanPDF yes", "AlertEncryptedDoc yes",
      "AlertExceedsMax yes", "OfficialDatabaseOnly yes", "FailIfCvdOlderThan 3"]) {
      expect(scanner.split("\n")).toContain(line);
    }
  });
});
