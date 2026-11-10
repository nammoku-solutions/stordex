import { describe, expect, it } from "vitest";

const disposable = process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?schema=public)?$/
    .test(process.env.DATABASE_URL ?? "");

describe("return status audit schema protections (disposable PostgreSQL only)", () => {
  it.runIf(disposable)("installs append-only guard, tenant FKs, idempotency and physical-only transition constraints", async () => {
    const { prisma } = await import("@/lib/db");
    const [trigger, constraints, indexes] = await Promise.all([
      prisma.$queryRaw<Array<{ tgname: string; definition: string }>>`
        SELECT tgname, pg_get_triggerdef(t.oid, true) AS definition
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        WHERE c.oid = 'public."B2BReturnStatusEvent"'::regclass
          AND NOT t.tgisinternal ORDER BY tgname
      `,
      prisma.$queryRaw<Array<{ conname: string; definition: string }>>`
        SELECT conname, pg_get_constraintdef(c.oid, true) AS definition
        FROM pg_constraint c
        WHERE c.conrelid = 'public."B2BReturnStatusEvent"'::regclass
        ORDER BY conname
      `,
      prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'B2BReturnStatusEvent'
        ORDER BY indexname
      `,
    ]);
    expect(trigger).toHaveLength(1);
    expect(trigger[0].tgname).toBe("B2BReturnStatusEvent_guard");
    for (const verb of ["INSERT", "UPDATE", "DELETE"]) {
      expect(trigger[0].definition).toContain(verb);
    }
    const names = new Set(constraints.map(c => c.conname));
    for (const name of [
      "B2BReturnStatusEvent_pkey",
      "B2BReturnStatusEvent_uuid_check",
      "B2BReturnStatusEvent_hash_check",
      "B2BReturnStatusEvent_physical_edges_check",
      "B2BReturnStatusEvent_tenantId_fkey",
      "B2BReturnStatusEvent_returnRequestId_fkey",
      "B2BReturnStatusEvent_actorUserId_fkey",
    ]) {
      expect(names.has(name), `Missing DB constraint ${name}`).toBe(true);
    }
    const edge = constraints.find(x => x.conname ===
      "B2BReturnStatusEvent_physical_edges_check");
    expect(edge?.definition).toContain("DISPATCHED");
    expect(edge?.definition).toContain("INSPECTED");
    expect(edge?.definition).not.toContain("CREDIT_PENDING");
    expect(edge?.definition).not.toContain("CLOSED");
    expect(indexes.map(x => x.indexname))
      .toContain("B2BReturnStatusEvent_tenantId_eventId_key");
    expect(indexes.find(x => x.indexname ===
      "B2BReturnStatusEvent_tenantId_eventId_key")?.indexdef)
      .toContain("UNIQUE");
    expect(await prisma.b2BReturnStatusEvent.count()).toBe(0);
  }, 20000);
});
