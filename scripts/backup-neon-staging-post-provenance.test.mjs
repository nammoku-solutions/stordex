import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "backup-neon-staging-post-provenance.sh");
const text = readFileSync(script, "utf8");

describe("Staging post-provenance encrypted backup helper", () => {
  it("has valid bash syntax", () => {
    const result = spawnSync("bash", ["-n", script], {encoding:"utf8"});
    expect(result.status, result.stderr).toBe(0);
  });
  it("rejects other modes before any database connection", () => {
    const result = spawnSync("bash", [script, "--migrate"], {
      encoding:"utf8", timeout:5000,
      env:{...process.env, STORDEX_STAGING_BACKUP_HOST:"example.com"},
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage:");
    expect(result.stdout).not.toContain("password");
  });
  it("rejects pooled/untrusted hosts before requesting a password", () => {
    for (const host of ["example.com", "ep-bad-pooler.aws.neon.tech"]) {
      const result = spawnSync("bash", [script, "--check"], {
        encoding:"utf8", timeout:5000,
        env:{...process.env,STORDEX_STAGING_BACKUP_HOST:host,
          STORDEX_STAGING_BACKUP_USER:"testrole"},
      });
      expect(result.status, host).toBe(2);
      expect(result.stderr).toContain("direct, non-pooled Neon host");
    }
  });
  it("pins the precise project, branch and six-migration baseline", () => {
    expect(text).toContain('STAGING_PROJECT="dry-feather-14704968"');
    expect(text).toContain('STAGING_BRANCH="br-sparkling-boat-ao9nrctp"');
    expect(text).toContain('STAGING_MIGRATION="20261104150000_b2b_seller_line_provenance"');
    expect(text).toContain('"$total_migrations" == "6"');
    expect(text).toContain('"$provenance" == "1"');
    expect(text).toContain('"$return_requests" == "0"');
    expect(text).toContain('"$before" == "$after"');
  });
  it("encrypts a streamed dump rather than writing a plaintext file", () => {
    expect(text).toMatch(/pg_dump --format=custom --no-owner --no-acl --dbname=neondb\s*\|/);
    expect(text).toContain("gpg --no-symkey-cache --symmetric --cipher-algo AES256");
    expect(text).toContain("gpg --no-symkey-cache --decrypt");
    expect(text).toContain("pg_restore --list");
    expect(text).toContain('umask 077');
    expect(text).toContain('chmod 600 -- "$target"');
    expect(text).not.toMatch(/pg_dump[^\n]*--file[ =]/);
    expect(text).not.toMatch(/pg_dump[^\n]*-f\s+/);
    expect(text).not.toContain("prisma migrate deploy");
    expect(text).not.toContain("DROP TABLE");
  });
});
