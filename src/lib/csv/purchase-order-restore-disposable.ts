/**
 * Issue #62: an isolated PostgreSQL-only rehearsal for PO snapshot restoration.
 *
 * Deliberately NOT a user-facing importer. Future migrations need explicit
 * inventory-ledger/baseline reconciliation and a separate approval before
 * this may ever be enabled outside disposable CI.
 */
import { prisma } from "@/lib/db";
import { preflightPurchaseOrderExport, type PurchaseOrderImportSnapshot } from "./purchase-order-preflight";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
// A Prisma transaction client type is inferred from the concrete callback
// rather than admitting a generic, unscoped database object.

export type PORestoreResult = {
  sourceDocuments: number;
  sourceLines: number;
  created: number;
  skippedIdentical: number;
  stockMovementsCreated: 0;
  itemStockUpdated: 0;
  warnings: number;
};

function ensureDisposableCiDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (process.env.APP_ENV !== "ci" ||
      !/^postgresql:\/\/stordex:stordex@localhost:5432\/stordex(?:\?|$)/.test(url)) {
    throw new Error("CSV historical PO restoration is disabled outside disposable CI PostgreSQL");
  }
}

function asDate(day: string) {
  return new Date(day + "T00:00:00.000Z");
}

function sameDate(left: Date | null, right: string | null): boolean {
  return (left?.toISOString().slice(0, 10) ?? null) === right;
}

function comparableImportedLine(
  line: PurchaseOrderImportSnapshot["lines"][number],
  itemId: string,
) {
  return {
    itemId, itemName: line.itemName, unit: line.unit,
    quantity: line.quantity, unitPrice: line.unitPrice, amount: line.amount,
    received: line.received, packSize: line.packSize,
    packCount: line.packCount, packUnit: line.packUnit,
  };
}

function identicalExisting(
  existing: {
    supplierId: string;
    orderDate: Date;
    pickupDate: Date | null;
    status: string;
    note: string | null;
    taxRate: number;
    subtotal: number;
    tax: number;
    total: number;
    createdAt: Date;
    updatedAt: Date;
    items: Array<{
      itemId: string; itemName: string; unit: string;
      quantity: number; unitPrice: number; amount: number;
      received: number; packSize: number | null;
      packCount: number | null; packUnit: string | null;
    }>;
  },
  doc: PurchaseOrderImportSnapshot,
  supplierId: string,
  itemIds: Map<string, string>,
): boolean {
  if (existing.supplierId !== supplierId ||
      !sameDate(existing.orderDate, doc.orderDate) ||
      !sameDate(existing.pickupDate, doc.pickupDate) ||
      existing.status !== doc.status ||
      existing.note !== doc.note ||
      existing.taxRate !== doc.taxRate ||
      existing.subtotal !== doc.subtotal ||
      existing.tax !== doc.tax ||
      existing.total !== doc.total ||
      existing.createdAt.toISOString() !== doc.createdAt ||
      existing.updatedAt.toISOString() !== doc.updatedAt ||
      existing.items.length !== doc.lines.length) {
    return false;
  }
  const canonical = (row: Record<string, unknown>) => JSON.stringify(row);
  const expected = doc.lines.map(line => {
    const id = itemIds.get(line.itemCode);
    if (!id) return "<missing-item>";
    return canonical(comparableImportedLine(line, id));
  }).sort();
  const actual = existing.items.map(line => canonical({
    itemId: line.itemId, itemName: line.itemName, unit: line.unit,
    quantity: line.quantity, unitPrice: line.unitPrice, amount: line.amount,
    received: line.received, packSize: line.packSize,
    packCount: line.packCount, packUnit: line.packUnit,
  })).sort();
  return JSON.stringify(expected) === JSON.stringify(actual);
}

/**
 * Rehearsal ONLY: reconstructs source PO and line snapshots with their historical
 * status and received values without calling normal business status transitions,
 * incrementing inventory, or synthesizing inventory movements.
 *
 * The entire CSV batch is one Serializable transaction: on any failed reference
 * or conflicting existing PO, NO new order is retained. Subsequent identical
 * calls are idempotently skipped. No UI/API may expose this function.
 */
export async function restorePurchaseOrdersInDisposableCi(opts: {
  tenantId: string;
  rows: string[][];
}): Promise<PORestoreResult> {
  // This must precede parsing, ORM access, and any transaction.
  ensureDisposableCiDatabase();
  const preflight = preflightPurchaseOrderExport(opts.rows);
  if (!preflight.ok) {
    throw new Error("仕入発注CSVの事前検証がFAILしました。復元は実施されません");
  }
  if (preflight.documents.length > 1000) {
    throw new Error("一度に復元できる仕入発注は1,000件までです");
  }

  const docs = preflight.documents;
  return prisma.$transaction(async tx => {
    const supplierCodes = [...new Set(docs.map(doc => doc.supplierCode))];
    const itemCodes = [...new Set(docs.flatMap(doc => doc.lines.map(line => line.itemCode)))];
    const suppliers = await tx.supplier.findMany({
      where: { tenantId: opts.tenantId, code: { in: supplierCodes } },
      select: { id: true, code: true },
    });
    const items = await tx.item.findMany({
      where: { tenantId: opts.tenantId, code: { in: itemCodes } },
      select: { id: true, code: true },
    });
    const supplierIds = new Map(suppliers.map(s => [s.code, s.id]));
    const itemIds = new Map(items.map(i => [i.code, i.id]));
    // Always resolve within the target tenant; never trust IDs from CSV.
    for (const doc of docs) {
      if (!supplierIds.has(doc.supplierCode)) {
        throw new Error("同じテナントに仕入先コードが見つかりません: " + doc.supplierCode);
      }
      for (const line of doc.lines) {
        if (!itemIds.has(line.itemCode)) {
          throw new Error("同じテナントに商品コードが見つかりません: " + line.itemCode);
        }
      }
    }

    const matching = await tx.purchaseOrder.findMany({
      where: { tenantId: opts.tenantId, poNumber: { in: docs.map(d => d.poNumber) } },
      include: { items: true },
    });
    const existingByNumber = new Map(matching.map(po => [po.poNumber, po]));
    let created = 0;
    let skippedIdentical = 0;

    for (const doc of docs) {
      const supplierId = supplierIds.get(doc.supplierCode)!;
      const existing = existingByNumber.get(doc.poNumber);
      if (existing) {
        if (!identicalExisting(existing, doc, supplierId, itemIds)) {
          throw new Error("同じ発注番号が別の内容で登録されています: " + doc.poNumber);
        }
        skippedIdentical++;
        continue;
      }
      const order = await tx.purchaseOrder.create({
        data: {
          tenantId: opts.tenantId,
          poNumber: doc.poNumber,
          supplierId,
          orderDate: asDate(doc.orderDate),
          pickupDate: doc.pickupDate ? asDate(doc.pickupDate) : null,
          status: doc.status,
          note: doc.note,
          taxRate: doc.taxRate, subtotal: doc.subtotal,
          tax: doc.tax, total: doc.total,
          createdAt: new Date(doc.createdAt),
          updatedAt: new Date(doc.updatedAt),
          items: {
            create: doc.lines.map(line => ({
              ...comparableImportedLine(line, itemIds.get(line.itemCode)!),
            })),
          },
        },
        select: { id: true },
      });
      if (!order.id) throw new Error("発注の復元IDがありません");
      created++;
    }
    return {
      sourceDocuments: preflight.documentCount,
      sourceLines: preflight.lineCount,
      created,
      skippedIdentical,
      stockMovementsCreated: 0 as const,
      itemStockUpdated: 0 as const,
      warnings: preflight.warnings.length,
    };
  }, { isolationLevel: "Serializable", timeout: 10000 });
}
