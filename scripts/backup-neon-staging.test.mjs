import { describe, expect, it } from "vitest";
import { validateBackupDirectory, parseClientVersion } from "./backup-neon-staging.mjs";

describe("backup protection", () => {
  it("requires an absolute path and disallows a repository-local backup", () => {
    expect(() => validateBackupDirectory("backups")).toThrow();
    expect(() => validateBackupDirectory(process.cwd())).toThrow();
    expect(() => validateBackupDirectory(process.cwd() + "/backups")).toThrow();
    expect(validateBackupDirectory("/tmp/stordex-staging-dumps")).toBe("/tmp/stordex-staging-dumps");
  });
  it("recognizes pg_dump client major versions", () => {
    expect(parseClientVersion("pg_dump (PostgreSQL) 16.15")).toBe(16);
    expect(parseClientVersion("pg_dump (PostgreSQL) 18.1")).toBe(18);
    expect(parseClientVersion("pg_restore (PostgreSQL) 16.15")).toBe(null);
  });
});
