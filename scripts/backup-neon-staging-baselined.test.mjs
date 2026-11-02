import { describe, it, expect } from "vitest";
import {
  validateBackupDirectory,
  parseClientVersion,
  assertBaselinedBackupState,
  assertBaselinedBackupToc,
  safeCommandFailure,
  safeBackupFailure,
} from "./backup-neon-staging-baselined.mjs";
import { APPLIED_BASELINE, INVENTORY_MIGRATION } from "./rehearse-neon-inventory-migration.mjs";

describe("post-baseline private Staging backup safety", () => {
  it("refuses relative/repository-local backup paths", () => {
    expect(() => validateBackupDirectory("backups")).toThrow();
    expect(() => validateBackupDirectory(process.cwd())).toThrow();
    expect(() => validateBackupDirectory(process.cwd() + "/backups")).toThrow();
    expect(validateBackupDirectory("/tmp/stordex-staging-baselined-test"))
      .toBe("/tmp/stordex-staging-baselined-test");
  });
  it("requires a modern pg_dump client", () => {
    expect(parseClientVersion("pg_dump (PostgreSQL) 16.15")).toBe(16);
    expect(parseClientVersion("pg_dump (PostgreSQL) 18.1")).toBe(18);
    expect(parseClientVersion("pg_restore (PostgreSQL) 16.15")).toBe(null);
  });
  it("allows exactly the four completed Prisma migration names and no fifth", () => {
    const valid = {state: "BASELINED", migrations: APPLIED_BASELINE};
    expect(assertBaselinedBackupState(valid)).toBe(valid);
    expect(() => assertBaselinedBackupState({...valid,state:"UNBASELINED"})).toThrow();
    expect(() => assertBaselinedBackupState({...valid,state:"MIGRATED"})).toThrow();
    expect(() => assertBaselinedBackupState({...valid,migrations:APPLIED_BASELINE.slice(0,3)})).toThrow();
    expect(() => assertBaselinedBackupState({...valid,migrations:[...APPLIED_BASELINE,INVENTORY_MIGRATION]})).toThrow();
    expect(() => assertBaselinedBackupState({...valid,migrations:[...APPLIED_BASELINE].reverse()})).toThrow();
  });
  it("requires table schemas AND table data for the Prisma ledger and app tables", () => {
    const tables = ["Tenant", "Item", "PurchaseOrder", "_prisma_migrations"];
    const toc = tables.flatMap((name,i)=>[
      (100+i) + "; 1259 200 TABLE public " + name + " owner",
      (200+i) + "; 0 200 TABLE DATA public " + name + " owner",
    ]).join("\n");
    expect(() => assertBaselinedBackupToc(toc)).not.toThrow();
    expect(() => assertBaselinedBackupToc(toc.replace("TABLE DATA public _prisma_migrations", "COMMENT public _prisma_migrations"))).toThrow();
    expect(() => assertBaselinedBackupToc(toc.replace("TABLE public Tenant", "COMMENT public Tenant"))).toThrow();
    expect(() => assertBaselinedBackupToc(toc.replace("TABLE DATA public Item", "COMMENT public Item"))).toThrow();
  });
});

describe("PostgreSQL client diagnostics without credential disclosure", () => {
  it("redacts a full URL, password, and includes the actionable libpq error", () => {
    const url = "postgresql://neon_owner:do_not_log_123@ep-example.neon.tech/neondb?sslmode=verify-full";
    const error = safeCommandFailure("pg_dump", {
      status: 1,
      stderr: "connection failed: root certificate file \"/home/jun/.postgresql/root.crt\" does not exist; " + url + " password do_not_log_123",
    }, { DATABASE_URL: url });
    expect(error.message).toContain("pg_dump failed (exit 1)");
    expect(error.message).toContain("root certificate file");
    expect(error.message).not.toContain("do_not_log_123");
    expect(error.message).not.toContain("postgresql://");
  });
  it("handles a failed spawn with no stderr or exit status", () => {
    const error = safeCommandFailure("pg_dump", {
      status: null,
      error: new Error("ENOENT: executable not found"),
      stderr: "",
    }, {DATABASE_URL: ""});
    expect(error.message).toContain("no-exit-status");
    expect(error.message).toContain("ENOENT");
  });
});

describe("post-baseline backup failure diagnostics", () => {
  it("reports nested IPv4 and IPv6 failures for an empty AggregateError.message", () => {
    const timeout = Object.assign(new Error("connect ETIMEDOUT 18.138.49.39:5432"), {code: "ETIMEDOUT"});
    const noRoute = Object.assign(new Error("connect ENETUNREACH fe80::1:5432"), {code: "ENETUNREACH"});
    const result = safeBackupFailure(new AggregateError([timeout, noRoute], ""), "staging_preflight_connect_and_validate");
    expect(result.phase).toBe("staging_preflight_connect_and_validate");
    expect(result.name).toBe("AggregateError");
    expect(result.message).toBe("(empty error message)");
    expect(result.nested.map(x => x.code)).toEqual(["ETIMEDOUT", "ENETUNREACH"]);
  });
  it("preserves DNS EAI_AGAIN while redacting database URL secrets", () => {
    const url="postgresql://owner:secret_451@ep-example.neon.tech/neondb?sslmode=require";
    const err=Object.assign(new Error("getaddrinfo EAI_AGAIN ep-example.neon.tech; "+url),{code:"EAI_AGAIN"});
    const detail=JSON.stringify(safeBackupFailure(err,"staging_preflight_connect_and_validate",{DATABASE_URL:url}));
    expect(detail).toContain("EAI_AGAIN");
    expect(detail).not.toContain("secret_451");
    expect(detail).not.toContain("postgresql://");
  });
});
