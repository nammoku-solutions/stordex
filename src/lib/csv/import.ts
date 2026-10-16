/**
 * CSV インポート エンジン。
 *
 * 入力: 解析済み CSV (string[][]), マッピング, 設定
 * 出力: 行ごとの結果 (ok/error) と、commit モードでは DB 反映
 *
 * 4 ターゲット (CUSTOMER / SUPPLIER / ITEM / ORDER) を 1 つのエンジンで
 * 扱い、ターゲット固有のロジックだけ分岐させる。
 */

import type { ImportTarget } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { coerceValue, fieldsFor, type FieldDef } from "./schema";
import { stringifyCsv } from "./parse";

export interface ImportConfig {
  target: ImportTarget;
  mapping: Record<string, string>;
  headerRow: number;
  skipRows: number;
  upsertMode: "skip" | "update";
  /** orderNumber を自動採番するか (受注時のみ) */
  generateOrderNumber?: boolean;
}

export interface ImportResult {
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: { row: number; reason: string; raw: string[] }[];
  /** ドライラン時の preview 用 (最大 5 件) */
  samples: any[];
}

/**
 * 行→フィールド辞書 への変換 + 型チェック。
 */
function rowToRecord(
  row: string[],
  headers: string[],
  mapping: Record<string, string>,
  fields: FieldDef[]
): { ok: true; record: Record<string, any> } | { ok: false; error: string } {
  const headerIndex = new Map<string, number>();
  headers.forEach((h, i) => headerIndex.set(h, i));
  const record: Record<string, any> = {};
  const missing: string[] = [];
  for (const f of fields) {
    const csvHeader = mapping[f.key];
    let raw: string | undefined;
    if (csvHeader) {
      const idx = headerIndex.get(csvHeader);
      if (idx !== undefined) raw = row[idx];
    }
    const r = coerceValue(raw, f.type);
    if (!r.ok) return { ok: false, error: `[${f.label}] ${r.error}` };
    if ((r.value === null || r.value === undefined || r.value === "") && f.required) {
      missing.push(f.label);
      continue;
    }
    record[f.key] = r.value;
  }
  if (missing.length > 0) {
    return { ok: false, error: `必須項目が空: ${missing.join(", ")}` };
  }
  return { ok: true, record };
}

/**
 * メインエントリ。dryrun = true なら DB 書き込みなし、結果集計だけ返す。
 */
export async function runImport(opts: {
  tenantId: string;
  rows: string[][];
  config: ImportConfig;
  dryrun: boolean;
}): Promise<ImportResult> {
  const { tenantId, rows, config, dryrun } = opts;
  const fields = fieldsFor(config.target);

  // ヘッダ取り出し
  const headerRow = Math.max(0, config.headerRow);
  const headers = rows[headerRow] ?? [];
  const dataStart = headerRow + 1 + Math.max(0, config.skipRows);
  const data = rows.slice(dataStart);

  const result: ImportResult = {
    rowCount: data.length,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    errors: [],
    samples: [],
  };

  // ===== 受注は別ロジック (グループ化) =====
  if (config.target === "ORDER") {
    return await importOrders({ tenantId, headers, data, config, fields, dryrun, result });
  }

  // ===== マスタ系 (Customer / Supplier / Item) =====
  for (let i = 0; i < data.length; i++) {
    const rowNum = dataStart + i + 1; // 1-indexed for messages
    const row = data[i];
    const r = rowToRecord(row, headers, config.mapping, fields);
    if (!r.ok) {
      result.errorCount++;
      result.errors.push({ row: rowNum, reason: r.error, raw: row });
      continue;
    }
    const rec = r.record;

    try {
      if (config.target === "CUSTOMER") {
        await upsertCustomer(tenantId, rec, config.upsertMode, dryrun, result);
      } else if (config.target === "SUPPLIER") {
        await upsertSupplier(tenantId, rec, config.upsertMode, dryrun, result);
      } else if (config.target === "ITEM") {
        await upsertItem(tenantId, rec, config.upsertMode, dryrun, result);
      }
      if (result.samples.length < 5) result.samples.push(rec);
    } catch (e: any) {
      result.errorCount++;
      result.errors.push({ row: rowNum, reason: e?.message ?? String(e), raw: row });
    }
  }
  return result;
}

async function upsertCustomer(
  tenantId: string,
  rec: Record<string, any>,
  upsertMode: "skip" | "update",
  dryrun: boolean,
  result: ImportResult
) {
  const existing = await prisma.customer.findUnique({
    where: { tenantId_code: { tenantId, code: rec.code } },
    select: { id: true },
  });
  if (existing) {
    if (upsertMode === "skip") {
      result.skippedCount++;
      return;
    }
    if (!dryrun) {
      await prisma.customer.update({
        where: { id: existing.id },
        data: {
          name: rec.name,
          nameKana: rec.nameKana,
          branch: rec.branch,
          groupName: rec.groupName,
          postalCode: rec.postalCode,
          address: rec.address,
          phone: rec.phone,
          fax: rec.fax,
          email: rec.email,
          contact: rec.contact,
          nextDayOrder: rec.nextDayOrder ?? false,
          note: rec.note,
        },
      });
    }
    result.updatedCount++;
    return;
  }
  if (!dryrun) {
    await prisma.customer.create({
      data: {
        tenantId,
        code: rec.code,
        name: rec.name,
        nameKana: rec.nameKana,
        branch: rec.branch,
        groupName: rec.groupName,
        postalCode: rec.postalCode,
        address: rec.address,
        phone: rec.phone,
        fax: rec.fax,
        email: rec.email,
        contact: rec.contact,
        nextDayOrder: rec.nextDayOrder ?? false,
        note: rec.note,
      },
    });
  }
  result.createdCount++;
}

async function upsertSupplier(
  tenantId: string,
  rec: Record<string, any>,
  upsertMode: "skip" | "update",
  dryrun: boolean,
  result: ImportResult
) {
  const existing = await prisma.supplier.findUnique({
    where: { tenantId_code: { tenantId, code: rec.code } },
    select: { id: true },
  });
  if (existing) {
    if (upsertMode === "skip") {
      result.skippedCount++;
      return;
    }
    if (!dryrun) {
      await prisma.supplier.update({
        where: { id: existing.id },
        data: {
          name: rec.name,
          nameKana: rec.nameKana,
          postalCode: rec.postalCode,
          address: rec.address,
          phone: rec.phone,
          fax: rec.fax,
          email: rec.email,
          contact: rec.contact,
          note: rec.note,
        },
      });
    }
    result.updatedCount++;
    return;
  }
  if (!dryrun) {
    await prisma.supplier.create({
      data: {
        tenantId,
        code: rec.code,
        name: rec.name,
        nameKana: rec.nameKana,
        postalCode: rec.postalCode,
        address: rec.address,
        phone: rec.phone,
        fax: rec.fax,
        email: rec.email,
        contact: rec.contact,
        note: rec.note,
      },
    });
  }
  result.createdCount++;
}

async function upsertItem(
  tenantId: string,
  rec: Record<string, any>,
  upsertMode: "skip" | "update",
  dryrun: boolean,
  result: ImportResult
) {
  const existing = await prisma.item.findUnique({
    where: { tenantId_code: { tenantId, code: rec.code } },
    select: { id: true, stock: true },
  });

  let supplierId: string | null = null;
  if (rec.supplierCode) {
    const supplier = await prisma.supplier.findUnique({
      where: { tenantId_code: { tenantId, code: rec.supplierCode } },
      select: { id: true },
    });
    if (!supplier) throw new Error(`未登録の仕入先コード: ${rec.supplierCode}`);
    supplierId = supplier.id;
  }

  if (rec.stock != null && (!Number.isSafeInteger(rec.stock) || rec.stock < 0)) {
    throw new Error("在庫数は0以上の整数で指定してください");
  }
  const details = {
    name: rec.name,
    nameKana: rec.nameKana,
    unit: rec.unit ?? "個",
    spec: rec.spec,
    origin: rec.origin,
    caseQty: rec.caseQty,
    orderUnit: rec.orderUnit,
    barcode: rec.barcode,
    reorderPoint: rec.reorderPoint ?? 0,
    costPrice: rec.costPrice ?? 0,
    salesPrice: rec.salesPrice ?? 0,
    supplierId,
    category: rec.category,
    note: rec.note,
  };

  if (existing) {
    if (upsertMode === "skip") {
      result.skippedCount++;
      return;
    }
    if (!dryrun) {
      await prisma.$transaction(async (tx) => {
        const current = await tx.item.findFirst({
          where: { id: existing.id, tenantId },
          select: { id: true, stock: true },
        });
        if (!current) throw new Error("取り込み対象の商品が見つかりません");
        const updatedStock = rec.stock == null ? current.stock : rec.stock;
        await tx.item.update({
          where: { id: current.id, tenantId },
          data: { ...Object.fromEntries(Object.entries(details).filter(([, value]) => value != null)), ...(rec.stock != null ? { stock: updatedStock } : {}) },
        });
        const change = updatedStock - current.stock;
        if (change !== 0) {
          await tx.inventoryMovement.create({
            data: {
              tenantId,
              itemId: current.id,
              type: "ADJUSTMENT",
              quantity: change,
              balance: updatedStock,
              note: "CSV在庫調整（移行・取込）",
            },
          });
        }
      });
    }
    result.updatedCount++;
    return;
  }
  if (!dryrun) {
    await prisma.$transaction(async (tx) => {
      const stock = rec.stock ?? 0;
      const created = await tx.item.create({
        data: { tenantId, code: rec.code, ...details, stock },
        select: { id: true },
      });
      if (stock !== 0) {
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            itemId: created.id,
            type: "ADJUSTMENT",
            quantity: stock,
            balance: stock,
            note: "CSV初期在庫（移行・取込）",
          },
        });
      }
    });
  }
  result.createdCount++;
}

/**
 * 受注 CSV：同じ orderNumber でグループ化し、明細をまとめて 1 注文として作成。
 * 既存の orderNumber は skip（重複登録防止）。
 */
async function importOrders(opts: {
  tenantId: string;
  headers: string[];
  data: string[][];
  config: ImportConfig;
  fields: FieldDef[];
  dryrun: boolean;
  result: ImportResult;
}): Promise<ImportResult> {
  const { tenantId, headers, data, config, fields, dryrun, result } = opts;
  const headerRow = config.headerRow;

  // 行 → record
  const records: { rowNum: number; rec: Record<string, any>; raw: string[] }[] = [];
  for (let i = 0; i < data.length; i++) {
    const rowNum = headerRow + 1 + (config.skipRows ?? 0) + i + 1;
    const row = data[i];
    const r = rowToRecord(row, headers, config.mapping, fields);
    if (!r.ok) {
      result.errorCount++;
      result.errors.push({ row: rowNum, reason: r.error, raw: row });
      continue;
    }
    records.push({ rowNum, rec: r.record, raw: row });
  }

  // orderNumber でグループ化
  const groups = new Map<string, typeof records>();
  for (const rec of records) {
    const key = rec.rec.orderNumber as string;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(rec);
  }

  for (const [orderNumber, rows] of groups) {
    const head = rows[0].rec;
    try {
      // 既存注文番号 → スキップ
      const existing = await prisma.order.findUnique({
        where: { tenantId_orderNumber: { tenantId, orderNumber } },
        select: { id: true },
      });
      if (existing) {
        result.skippedCount += rows.length;
        continue;
      }

      // 得意先解決
      let customer = await prisma.customer.findUnique({
        where: { tenantId_code: { tenantId, code: head.customerCode } },
        select: { id: true },
      });
      if (!customer) {
        // 得意先を自動作成（CSV から名前があれば）
        if (!head.customerName) {
          const reason = `得意先コード ${head.customerCode} が未登録（顧客名も無いため自動作成不可）`;
          rows.forEach((r) =>
            result.errors.push({ row: r.rowNum, reason, raw: r.raw })
          );
          result.errorCount += rows.length;
          continue;
        }
        // Customer creation is deferred to the same transaction as the validated order.
        customer = { id: "DRYRUN_NEW_CUSTOMER" };
      }

      // 明細
      const items: any[] = [];
      let subtotal = 0;
      let lineErr = false;
      for (const r of rows) {
        const itemRow = r.rec;
        const item = await prisma.item.findUnique({
          where: { tenantId_code: { tenantId, code: itemRow.itemCode } },
          select: { id: true, name: true, unit: true, spec: true, origin: true, costPrice: true },
        });
        if (!item) {
          result.errors.push({
            row: r.rowNum,
            reason: `商品コード ${itemRow.itemCode} が未登録`,
            raw: r.raw,
          });
          result.errorCount++;
          lineErr = true;
          continue;
        }
        const qty = itemRow.quantity ?? 0;
        const price = itemRow.unitPrice ?? 0;
        const amount = qty * price;
        if (!Number.isSafeInteger(qty) || qty <= 0 || !Number.isSafeInteger(price) ||
            price < 0 || !Number.isSafeInteger(amount)) {
          result.errors.push({
            row: r.rowNum,
            reason: "受注明細の数量・金額が不正です",
            raw: r.raw,
          });
          result.errorCount++;
          lineErr = true;
          continue;
        }
        subtotal += amount;
        items.push({
          itemId: item.id,
          itemName: itemRow.itemName ?? item.name,
          unit: itemRow.unit ?? item.unit,
          spec: itemRow.spec ?? item.spec,
          origin: item.origin,
          quantity: qty,
          unitPrice: price,
          costPrice: item.costPrice ?? 0,
          amount,
          remark: itemRow.remark,
        });
      }
      if (lineErr) continue;
      if (items.length === 0) continue;

      const taxRate = 10;
      const tax = Math.floor(subtotal * (taxRate / 100));
      const total = subtotal + tax;

      if (!dryrun) {
        await prisma.$transaction(async (tx) => {
          const customerId = customer!.id === "DRYRUN_NEW_CUSTOMER"
            ? (await tx.customer.upsert({
                where: { tenantId_code: { tenantId, code: head.customerCode } },
                update: {},
                create: { tenantId, code: head.customerCode, name: head.customerName },
                select: { id: true },
              })).id
            : customer!.id;
          await tx.order.create({
            data: {
              tenantId,
              orderNumber,
              customerId,
              orderDate: head.orderDate ?? new Date(),
              dueDate: head.dueDate,
              orderer: head.orderer,
              note: head.orderNote,
              status: "DRAFT",
              subtotal,
              taxRate,
              tax,
              total,
              items: { create: items },
            },
          });
        });
      }
      result.createdCount++;
      if (result.samples.length < 5) {
        result.samples.push({ orderNumber, lines: items.length, total });
      }
    } catch (e: any) {
      result.errorCount += rows.length;
      rows.forEach((r) =>
        result.errors.push({ row: r.rowNum, reason: e?.message ?? String(e), raw: r.raw })
      );
    }
  }
  return result;
}

/**
 * エラー行を CSV 文字列に変換（再アップロード→修正用）。
 * 元のヘッダ + "_error" 列を末尾に付与。
 */
export function buildErrorCsv(headers: string[], errors: ImportResult["errors"]): string {
  if (errors.length === 0) return "";
  const out: string[][] = [];
  out.push([...headers, "_error"]);
  for (const e of errors) {
    out.push([...e.raw, e.reason]);
  }
  return stringifyCsv(out);
}
