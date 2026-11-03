/**
 * Issue #62 — historical stock ledger restore rehearsal.
 *
 * This is an INTERNAL disposable-CI-only database exercise. There is deliberately
 * no API route / UI, Staging write path, or ordinary application invocation.
 * Restores immutable historical movement snapshots, NEVER replays their deltas
 * into Item.stock, and NEVER invents opening movements for no-history items.
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  MOVEMENT_MIGRATION_EXPORT_HEADERS,
  preflightInventoryLedgerExports,
} from "./inventory-ledger-preflight";

export type LedgerRestoreReport = {
  itemCount: number;
  sourceMovements: number;
  created: number;
  skippedIdentical: number;
  currentStockUpdates: 0;
  noHistoryItems: number;
};

const PG_INT_MAX = 2147483647;

function ensureIsolatedPostgres(): void {
  let allowed = false;
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    allowed = process.env.APP_ENV === "ci" &&
      url.protocol === "postgresql:" &&
      url.username === "stordex" && url.password === "stordex" &&
      url.hostname === "localhost" && url.port === "5432" &&
      url.pathname === "/stordex" &&
      [...url.searchParams.keys()].every(key => key === "schema") &&
      (!url.searchParams.has("schema") ||
        (url.searchParams.getAll("schema").length === 1 &&
         url.searchParams.get("schema") === "public"));
  } catch {
    allowed = false;
  }
  if (!allowed) {
    throw new Error("Inventory history restoration disabled outside disposable CI PostgreSQL");
  }
}

// Do not trust source global IDs on a different tenant. Preserve stable
// source-to-target identity with a tenant-namespaced deterministic ID instead.
function targetMovementId(tenantId: string, sourceId: string): string {
  return "hist_" + createHash("sha256")
    .update(tenantId + "\u0000" + sourceId).digest("hex").slice(0, 48);
}

type RestoreMovement = {
  id: string;
  itemId: string;
  tenantId: string;
  warehouseId: string | null;
  type: "INBOUND" | "OUTBOUND" | "ADJUSTMENT";
  quantity: number;
  balance: number;
  createdAt: Date;
  expiryDate: Date | null;
  lotNumber: string | null;
  location: string | null;
  reference: string | null;
  note: string | null;
};

function sameMovement(
  existing: RestoreMovement & { createdBy: string | null },
  desired: RestoreMovement,
): boolean {
  return existing.id === desired.id &&
    existing.tenantId === desired.tenantId &&
    existing.itemId === desired.itemId &&
    existing.warehouseId === desired.warehouseId &&
    existing.type === desired.type &&
    existing.quantity === desired.quantity &&
    existing.balance === desired.balance &&
    existing.createdAt.getTime() === desired.createdAt.getTime() &&
    (existing.expiryDate?.getTime() ?? null) === (desired.expiryDate?.getTime() ?? null) &&
    existing.lotNumber === desired.lotNumber &&
    existing.location === desired.location &&
    existing.reference === desired.reference &&
    existing.note === desired.note &&
    existing.createdBy === null;
}

export async function restoreInventoryHistoryInDisposableCi(input: {
  tenantId: string;
  itemRows: string[][];
  movementRows: string[][];
}): Promise<LedgerRestoreReport> {
  // Must fail BEFORE any Prisma query and never fall back to another DB.
  ensureIsolatedPostgres();

  const audit = preflightInventoryLedgerExports({
    items: input.itemRows, movements: input.movementRows,
  });
  if (!audit.ok) {
    throw new Error("CSV在庫と履歴の事前照合がFAILしました。復元していません");
  }
  if (audit.summaries.length > 1000 || audit.movementCount > 1000) {
    throw new Error("使い捨てDB復元の上限は商品・履歴それぞれ1,000件です");
  }

  // The preflight validated both header sets, row lengths, types, order and
  // balance continuity, so this normalization is NOT a second CSV parser.
  const head = input.movementRows[0];
  const idx = new Map(head.map((key, i) => [key, i]));
  const get = (row: string[], key: typeof MOVEMENT_MIGRATION_EXPORT_HEADERS[number]) =>
    row[idx.get(key)!] ?? "";

  return prisma.$transaction(async tx => {
    const items = await tx.item.findMany({
      where: { tenantId: input.tenantId },
      select: { id: true, code: true, stock: true },
    });
    // Import only into an isolated, pre-created master snapshot of exactly
    // these items, with source cutover stock ALREADY set exactly once.
    const expectedCodes = new Set(audit.summaries.map(item => item.code));
    if (items.length !== expectedCodes.size ||
        items.some(item => !expectedCodes.has(item.code))) {
      throw new Error("移行先の商品マスタ構成がCSVの商品構成と一致しません");
    }
    const itemIds = new Map(items.map(item => [item.code, item.id]));
    for (const source of audit.summaries) {
      const target = items.find(item => item.code === source.code);
      if (!target || target.stock !== source.currentStock) {
        throw new Error("移行先の現在庫がCSVのカットオーバー残高と一致しません");
      }
    }

    const warehouseCodes = [...new Set(input.movementRows.slice(1)
      .map(row => get(row, "warehouseCode")).filter(Boolean))];
    const warehouses = await tx.warehouse.findMany({
      where: { tenantId: input.tenantId, code: { in: warehouseCodes } },
      select: { id: true, code: true },
    });
    const warehouseIds = new Map(warehouses.map(warehouse => [warehouse.code, warehouse.id]));
    if (warehouses.length !== warehouseCodes.length) {
      throw new Error("移行先テナントに存在しない倉庫コードがあります");
    }

    const desired: RestoreMovement[] = input.movementRows.slice(1).map(row => ({
      id: targetMovementId(input.tenantId, get(row, "movementId")),
      tenantId: input.tenantId,
      itemId: itemIds.get(get(row, "itemCode"))!,
      warehouseId: get(row, "warehouseCode")
        ? warehouseIds.get(get(row, "warehouseCode"))! : null,
      type: get(row, "type") as RestoreMovement["type"],
      quantity: Number(get(row, "quantity")),
      balance: Number(get(row, "balance")),
      createdAt: new Date(get(row, "createdAt")),
      expiryDate: get(row, "expiryDate")
        ? new Date(get(row, "expiryDate") + "T00:00:00.000Z") : null,
      lotNumber: get(row, "lotNumber") || null,
      location: get(row, "location") || null,
      reference: get(row, "reference") || null,
      note: get(row, "note") || null,
    }));
    for (const movement of desired) {
      if (Math.abs(movement.quantity) > PG_INT_MAX ||
          movement.balance > PG_INT_MAX) {
        throw new Error("履歴の数量がPostgreSQLの整数列の上限を超えています");
      }
    }

    const existing = await tx.inventoryMovement.findMany({
      where: { tenantId: input.tenantId },
      take: 1001,
    });
    const expectedIds = new Set(desired.map(movement => movement.id));
    // Never merge archival history into operational movements, even if
    // overlapping timestamps appear to balance by coincidence.
    if (existing.some(movement => !expectedIds.has(movement.id)) ||
        existing.length > 1000) {
      throw new Error("移行先にCSV由来ではない入出庫履歴が存在します");
    }
    const existingMap = new Map(existing.map(movement => [movement.id, movement]));
    let created = 0, skippedIdentical = 0;
    for (const movement of desired) {
      const prior = existingMap.get(movement.id);
      if (prior) {
        if (!sameMovement(prior, movement)) {
          throw new Error("同じ移行元履歴IDに別内容が登録されています");
        }
        skippedIdentical++;
      } else {
        await tx.inventoryMovement.create({ data: movement });
        created++;
      }
    }

    // Intentionally NO tx.item.update, status actions or inbound/outbound
    // business operations. Historical movements are archival snapshots.
    return {
      itemCount: audit.itemCount,
      sourceMovements: audit.movementCount,
      created,
      skippedIdentical,
      currentStockUpdates: 0 as const,
      noHistoryItems: audit.unverifiedItems,
    };
  }, { isolationLevel: "Serializable", timeout: 15000 });
}
