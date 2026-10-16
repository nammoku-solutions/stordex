import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { toCsv } from "@/lib/csv-export";
import { decodeCsvBuffer, parseCsv } from "./parse";
import { autoMap } from "./schema";

// WARNING: Real DB integration test; never connect to a staging/production DB.
// GitHub Actions uses the disposable Postgres service at localhost:5432/stordex.
const conn = process.env.DATABASE_URL ?? "";
const ciLocalOnly =
  process.env.APP_ENV === "ci" &&
  /^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?|$)/.test(conn);

describe("real PostgreSQL CSV import idempotence and tenant isolation", () => {
  it.runIf(ciLocalOnly)("dry-run, create, retry, malformed line and cross-tenant safety", async () => {
    // Deferred imports prevent any DB connection outside disposable CI.
    const { prisma } = await import("@/lib/db");
    const { runImport } = await import("./import");
    const suffix = randomUUID().slice(0, 12);
    const tenantA = await prisma.tenant.create({
      data: { slug: "ci-csv-buyer-" + suffix, name: "CSV TEST BUYER" },
    });
    const tenantB = await prisma.tenant.create({
      data: { slug: "ci-csv-other-" + suffix, name: "CSV TEST OTHER" },
    });
    try {
      await prisma.customer.create({
        data: { tenantId: tenantA.id, code: "CUS-01", name: "東京文具株式会社" },
      });
      await prisma.customer.create({
        data: { tenantId: tenantB.id, code: "CUS-01", name: "OTHER COMPANY" },
      });
      await prisma.item.create({
        data: { tenantId: tenantA.id, code: "SKU-PAPER", name: "A4紙", unit: "箱", stock: 12 },
      });
      const headers = [
        "orderNumber","customerCode","customerName","orderDate","dueDate",
        "itemCode","itemName","unit","quantity","unitPrice","taxRate",
      ];
      const line = (qty: string) => [
        "CI-20261017-001","CUS-01","東京文具株式会社","2026-10-17","2026-10-19",
        "SKU-PAPER","A4紙","箱",qty,"1,000","8",
      ];
      const rows = parseCsv(decodeCsvBuffer(
        new TextEncoder().encode(toCsv(headers,[line("2"),line("3")]))
      ).text);
      const config = {
        target: "ORDER" as const,
        mapping: autoMap("ORDER", rows[0]),
        headerRow: 0,
        skipRows: 0,
        upsertMode: "skip" as const,
      };
      const opts = { tenantId: tenantA.id, rows, config };
      const before = await prisma.order.count({where:{tenantId:tenantA.id}});
      const preview = await runImport({...opts,dryrun:true});
      expect(preview).toMatchObject({ createdCount:1, errorCount:0 });
      expect(await prisma.order.count({where:{tenantId:tenantA.id}})).toBe(before);

      const committed = await runImport({...opts,dryrun:false});
      expect(committed).toMatchObject({createdCount:1,errorCount:0});
      const saved = await prisma.order.findUniqueOrThrow({
        where:{tenantId_orderNumber:{tenantId:tenantA.id,orderNumber:"CI-20261017-001"}},
        include:{items:true},
      });
      expect(saved).toMatchObject({status:"DRAFT",taxRate:8,subtotal:5000,tax:400,total:5400});
      expect(saved.items).toHaveLength(2);
      expect(saved.items.map(i=>i.quantity).sort()).toEqual([2,3]);
      expect(await prisma.inventoryMovement.count({where:{tenantId:tenantA.id}})).toBe(0);
      expect((await prisma.item.findUniqueOrThrow({
        where:{tenantId_code:{tenantId:tenantA.id,code:"SKU-PAPER"}},
      })).stock).toBe(12);

      const duplicate = await runImport({...opts,dryrun:false});
      expect(duplicate).toMatchObject({createdCount:0,skippedCount:2,errorCount:0});
      expect(await prisma.order.count({where:{tenantId:tenantA.id}})).toBe(before+1);

      // Same customer code in other tenant cannot resolve source tenant's SKU.
      const otherTenant = await runImport({tenantId:tenantB.id,rows,config,dryrun:true});
      expect(otherTenant).toMatchObject({createdCount:0,errorCount:2});
      expect(await prisma.order.count({where:{tenantId:tenantB.id}})).toBe(0);

      const invalidRows = parseCsv(decodeCsvBuffer(new TextEncoder().encode(
        toCsv(headers,[
          [...line("1")].map((value,idx)=>idx===0?"CI-BAD-001":value),
          [...line("NOT-A-NUMBER")].map((value,idx)=>idx===0?"CI-BAD-001":value),
        ])
      )).text);
      const invalid = await runImport({
        tenantId:tenantA.id,rows:invalidRows,config,dryrun:false,
      });
      expect(invalid).toMatchObject({createdCount:0,errorCount:2});
      expect(await prisma.order.count({
        where:{tenantId:tenantA.id,orderNumber:"CI-BAD-001"},
      })).toBe(0);
    } finally {
      // Never executed on non-CI/non-local databases.
      await prisma.order.deleteMany({where:{tenantId:tenantA.id}});
      await prisma.item.deleteMany({where:{tenantId:tenantA.id}});
      await prisma.customer.deleteMany({where:{tenantId:tenantA.id}});
      await prisma.customer.deleteMany({where:{tenantId:tenantB.id}});
      await prisma.tenant.deleteMany({where:{id:{in:[tenantA.id,tenantB.id]}}});
    }
  });
});
