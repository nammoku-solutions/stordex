/**
 * Issue #62 — stage immutable inventory cutover evidence into NEW archive tables.
 * DISPOSABLE CI ONLY; not a Staging or Production import operation.
 *
 * This module NEVER writes Item, PurchaseOrder or InventoryMovement.
 * An archive batch is not a migration approval, cutover authorization, or
 * proof the source files were captured atomically.
 */
import { prisma } from "@/lib/db";
import {
  verifyInventoryCutoverManifest,
  type InventoryCutoverManifest,
} from "./inventory-cutover-manifest";

function requireDisposableCi(): void {
  let ok = false;
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    ok = process.env.APP_ENV === "ci" &&
      url.protocol === "postgresql:" &&
      url.username === "stordex" &&
      url.password === "stordex" &&
      url.hostname === "localhost" &&
      url.port === "5432" &&
      url.pathname === "/stordex" &&
      [...url.searchParams.keys()].every(key => key === "schema") &&
      (!url.searchParams.has("schema") ||
        (url.searchParams.getAll("schema").length === 1 &&
         url.searchParams.get("schema") === "public"));
  } catch {
    ok = false;
  }
  if (!ok) throw new Error("Migration archive staging disabled outside disposable CI");
}

export type ArchiveCutoverResult = {
  batchId: string;
  archivedItems: number;
  created: boolean;
  operationalItemWrites: 0;
  operationalMovementWrites: 0;
  operationalOrderWrites: 0;
  status: "PREPARED";
};

export async function archiveCutoverInDisposableCi(input: {
  targetTenantId: string;
  sourceTenantId: string;
  itemsCsv: Uint8Array;
  movementsCsv: Uint8Array;
  manifest: InventoryCutoverManifest;
}): Promise<ArchiveCutoverResult> {
  requireDisposableCi();
  if (!verifyInventoryCutoverManifest({
    sourceTenantId: input.sourceTenantId,
    itemsCsv: input.itemsCsv,
    movementsCsv: input.movementsCsv,
    manifest: input.manifest,
  })) {
    throw new Error("移行元CSVと検証記録が一致しません。アーカイブを作成していません");
  }
  const { manifest } = input;
  if (manifest.items.length > 1000) {
    throw new Error("隔離DBのアーカイブ検証は商品1,000件までです");
  }
  return prisma.$transaction(async tx => {
    const tenant = await tx.tenant.findUnique({
      where: { id: input.targetTenantId },
      select: { id: true },
    });
    if (!tenant) throw new Error("復元先テナントが見つかりません");

    const existing = await tx.migrationArchiveBatch.findUnique({
      where: { tenantId_manifestId: {
        tenantId: input.targetTenantId, manifestId: manifest.manifestId,
      } },
      include: { items: { orderBy: { itemCode: "asc" } } },
    });
    if (existing) {
      const expected = manifest.items;
      const same = existing.state === "PREPARED" &&
        existing.sourceTenantFingerprint === manifest.tenantFingerprint &&
        existing.itemsCsvSha256 === manifest.source.itemsCsvSha256 &&
        existing.movementsCsvSha256 === manifest.source.movementsCsvSha256 &&
        existing.items.length === expected.length &&
        existing.items.every((saved, i) =>
          saved.tenantId === input.targetTenantId &&
          saved.itemCode === expected[i].code &&
          saved.cutoverStock === expected[i].cutoverStock &&
          saved.historyKind === expected[i].history &&
          saved.historicalOpening === expected[i].inferredHistoricalOpening &&
          saved.lastHistoricalBalance === expected[i].lastHistoricalBalance &&
          saved.movementCount === expected[i].movementCount);
      if (!same) {
        throw new Error("同じ検証記録IDのアーカイブに内容不一致があります");
      }
      return {
        batchId: existing.id,
        archivedItems: expected.length,
        created: false,
        operationalItemWrites: 0 as const,
        operationalMovementWrites: 0 as const,
        operationalOrderWrites: 0 as const,
        status: "PREPARED" as const,
      };
    }

    const batch = await tx.migrationArchiveBatch.create({
      data: {
        tenantId: input.targetTenantId,
        manifestId: manifest.manifestId,
        sourceTenantFingerprint: manifest.tenantFingerprint,
        itemsCsvSha256: manifest.source.itemsCsvSha256,
        movementsCsvSha256: manifest.source.movementsCsvSha256,
        items: { create: manifest.items.map(item => ({
          tenantId: input.targetTenantId,
          itemCode: item.code,
          cutoverStock: item.cutoverStock,
          historyKind: item.history,
          historicalOpening: item.inferredHistoricalOpening,
          lastHistoricalBalance: item.lastHistoricalBalance,
          movementCount: item.movementCount,
        })) },
      },
    });
    return {
      batchId: batch.id,
      archivedItems: manifest.items.length,
      created: true,
      operationalItemWrites: 0 as const,
      operationalMovementWrites: 0 as const,
      operationalOrderWrites: 0 as const,
      status: "PREPARED" as const,
    };
  }, { isolationLevel: "Serializable", timeout: 15000 });
}