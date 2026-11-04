/**
 * Issue #62 — stage immutable inventory cutover and movement evidence in NEW archive tables.
 * DISPOSABLE CI ONLY; never write Item, PurchaseOrder, or InventoryMovement.
 * This operation is not a cutover, migration approval, or atomic source snapshot.
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  verifyInventoryCutoverManifest,
  type InventoryCutoverManifest,
} from "./inventory-cutover-manifest";
import { MOVEMENT_MIGRATION_EXPORT_HEADERS } from "./inventory-ledger-preflight";
import { decodeCsvBuffer, parseCsv } from "./parse";

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

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

type MovementSnapshot = Record<(typeof MOVEMENT_MIGRATION_EXPORT_HEADERS)[number], string>;

function canonicalSnapshot(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  // The source parser provides fixed, flat CSV header values only.
  if (keys.length !== MOVEMENT_MIGRATION_EXPORT_HEADERS.length ||
      keys.some(key => !MOVEMENT_MIGRATION_EXPORT_HEADERS.includes(
        key as (typeof MOVEMENT_MIGRATION_EXPORT_HEADERS)[number],
      )) || keys.some(key => typeof obj[key] !== "string")) {
    return null;
  }
  return JSON.stringify(keys.map(key => [key, obj[key]]));
}

function extractMovementSnapshots(csv: Uint8Array) {
  // The exact same bytes have already passed the manifest verifier, including
  // the strict header, date, ID, arithmetic and global chronology checks.
  const rows = parseCsv(decodeCsvBuffer(csv, "utf-8").text);
  const header = rows[0];
  const positions = new Map(header.map((key, index) => [key, index]));
  return rows.slice(1).map(row => {
    const snapshot = Object.fromEntries(
      MOVEMENT_MIGRATION_EXPORT_HEADERS.map(key => [key, row[positions.get(key)!]]),
    ) as MovementSnapshot;
    const canonical = canonicalSnapshot(snapshot);
    if (!canonical) throw new Error("移行元履歴の列構成が不正です");
    return {
      sourceMovementId: snapshot.movementId,
      sourceSha256: sha256(canonical),
      snapshot,
    };
  });
}

export type ArchiveCutoverResult = {
  batchId: string;
  archivedItems: number;
  archivedMovements: number;
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
  const sourceMovements = extractMovementSnapshots(input.movementsCsv);
  // Keep the rehearsal bounded; a production migration will use a separately
  // reviewed, paginated import with an explicit source-freeze audit.
  if (manifest.items.length > 1000 || sourceMovements.length > 1000) {
    throw new Error("隔離DBアーカイブの一回の検証は商品・履歴それぞれ1,000件までです");
  }
  if (sourceMovements.length !== manifest.checks.movementCount) {
    throw new Error("移行元履歴の件数と検証記録が一致しません");
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
      include: {
        items: { orderBy: { itemCode: "asc" } },
        movements: { orderBy: { sourceMovementId: "asc" } },
      },
    });
    if (existing) {
      const expected = manifest.items;
      const sameItems = existing.items.length === expected.length &&
        existing.items.every((saved, i) =>
          saved.tenantId === input.targetTenantId &&
          saved.itemCode === expected[i].code &&
          saved.cutoverStock === expected[i].cutoverStock &&
          saved.historyKind === expected[i].history &&
          saved.historicalOpening === expected[i].inferredHistoricalOpening &&
          saved.lastHistoricalBalance === expected[i].lastHistoricalBalance &&
          saved.movementCount === expected[i].movementCount);
      const sourceById = new Map(sourceMovements.map(movement =>
        [movement.sourceMovementId, movement]));
      const sameMovements = existing.movements.length === sourceMovements.length &&
        existing.movements.every(saved => {
          const source = sourceById.get(saved.sourceMovementId);
          return !!source && saved.tenantId === input.targetTenantId &&
            saved.sourceSha256 === source.sourceSha256 &&
            canonicalSnapshot(saved.snapshot) === canonicalSnapshot(source.snapshot);
        });
      if (existing.state !== "PREPARED" ||
          existing.sourceTenantFingerprint !== manifest.tenantFingerprint ||
          existing.itemsCsvSha256 !== manifest.source.itemsCsvSha256 ||
          existing.movementsCsvSha256 !== manifest.source.movementsCsvSha256 ||
          !sameItems || !sameMovements) {
        throw new Error("同じ検証記録IDのアーカイブに内容不一致があります");
      }
      return {
        batchId: existing.id,
        archivedItems: expected.length,
        archivedMovements: sourceMovements.length,
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
      },
    });
    if (manifest.items.length) {
      await tx.migrationArchiveItem.createMany({
        data: manifest.items.map(item => ({
          tenantId: input.targetTenantId,
          batchId: batch.id,
          itemCode: item.code,
          cutoverStock: item.cutoverStock,
          historyKind: item.history,
          historicalOpening: item.inferredHistoricalOpening,
          lastHistoricalBalance: item.lastHistoricalBalance,
          movementCount: item.movementCount,
        })),
      });
    }
    if (sourceMovements.length) {
      await tx.migrationArchiveMovement.createMany({
        data: sourceMovements.map(movement => ({
          tenantId: input.targetTenantId,
          batchId: batch.id,
          sourceMovementId: movement.sourceMovementId,
          sourceSha256: movement.sourceSha256,
          snapshot: movement.snapshot,
        })),
      });
    }
    return {
      batchId: batch.id,
      archivedItems: manifest.items.length,
      archivedMovements: sourceMovements.length,
      created: true,
      operationalItemWrites: 0 as const,
      operationalMovementWrites: 0 as const,
      operationalOrderWrites: 0 as const,
      status: "PREPARED" as const,
    };
  }, { isolationLevel: "Serializable", timeout: 15000 });
}
