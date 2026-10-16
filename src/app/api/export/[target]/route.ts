import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { toCsv, exportDate, exportTimestamp, type CsvCell } from "@/lib/csv-export";

export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

type Dataset = { headers: string[]; rows: CsvCell[][] };
const MAX_RECORDS = 10000;
const TOO_LARGE = "EXPORT_LIMIT_EXCEEDED";

function checkCount(rows: unknown[]) {
  if (rows.length > MAX_RECORDS) throw new Error(TOO_LARGE);
}
function checkLines(rows: unknown[]) {
  if (rows.length > MAX_RECORDS) throw new Error(TOO_LARGE);
}

async function loadDataset(tenantId: string, target: string): Promise<Dataset | null> {
  switch (target) {
    case "customers": {
      const records = await prisma.customer.findMany({
        where: { tenantId },
        orderBy: { code: "asc" },
        take: MAX_RECORDS + 1,
      });
      checkCount(records);
      return {
        headers: ["code", "name", "nameKana", "nameEn", "branch", "groupName",
          "postalCode", "address", "phone", "fax", "email", "contact",
          "nextDayOrder", "note", "active", "createdAt", "updatedAt"],
        rows: records.map(r => [r.code, r.name, r.nameKana, r.nameEn, r.branch,
          r.groupName, r.postalCode, r.address, r.phone, r.fax, r.email,
          r.contact, r.nextDayOrder, r.note, r.active,
          exportTimestamp(r.createdAt), exportTimestamp(r.updatedAt)]),
      };
    }
    case "suppliers": {
      const records = await prisma.supplier.findMany({
        where: { tenantId },
        orderBy: { code: "asc" },
        take: MAX_RECORDS + 1,
      });
      checkCount(records);
      return {
        headers: ["code", "name", "nameKana", "postalCode", "address",
          "phone", "fax", "email", "contact", "note", "active", "createdAt", "updatedAt"],
        rows: records.map(r => [r.code, r.name, r.nameKana, r.postalCode,
          r.address, r.phone, r.fax, r.email, r.contact, r.note, r.active,
          exportTimestamp(r.createdAt), exportTimestamp(r.updatedAt)]),
      };
    }
    case "items": {
      const records = await prisma.item.findMany({
        where: { tenantId },
        include: { supplier: { select: { code: true } } },
        orderBy: { code: "asc" },
        take: MAX_RECORDS + 1,
      });
      checkCount(records);
      return {
        headers: ["code", "name", "nameKana", "nameEn", "unit", "spec", "origin",
          "caseQty", "orderUnit", "isImported", "deliveryCycle", "barcode",
          "stock", "reorderPoint", "reorderPeak", "costPrice", "salesPrice",
          "supplierCode", "category", "note", "active", "createdAt", "updatedAt"],
        rows: records.map(r => [r.code, r.name, r.nameKana, r.nameEn, r.unit,
          r.spec, r.origin, r.caseQty, r.orderUnit, r.isImported, r.deliveryCycle,
          r.barcode, r.stock, r.reorderPoint, r.reorderPeak, r.costPrice, r.salesPrice,
          r.supplier?.code, r.category, r.note, r.active,
          exportTimestamp(r.createdAt), exportTimestamp(r.updatedAt)]),
      };
    }
    case "orders": {
      const records = await prisma.order.findMany({
        where: { tenantId },
        include: { customer: { select: { code: true, name: true } },
          items: { include: { item: { select: { code: true } } } } },
        orderBy: [{ orderDate: "asc" }, { orderNumber: "asc" }],
        take: MAX_RECORDS + 1,
      });
      checkCount(records);
      const rows: CsvCell[][] = records.flatMap(o =>
        (o.items.length ? o.items : [null]).map(line => [
          o.orderNumber, o.customer.code, o.customer.name,
          exportDate(o.orderDate), exportDate(o.dueDate), o.status, o.orderer, o.note,
          o.taxRate, o.subtotal, o.tax, o.total,
          line?.item?.code, line?.itemName, line?.spec, line?.origin, line?.unit,
          line?.quantity, line?.unitPrice, line?.costPrice, line?.amount, line?.remark,
          exportTimestamp(o.createdAt), exportTimestamp(o.updatedAt),
        ]));
      checkLines(rows);
      return {
        headers: ["orderNumber", "customerCode", "customerName",
          "orderDate", "dueDate", "status", "orderer", "orderNote",
          "taxRate", "subtotal", "tax", "total", "itemCode", "itemName",
          "spec", "origin", "unit", "quantity", "unitPrice", "costPrice",
          "amount", "remark", "createdAt", "updatedAt"],
        rows,
      };
    }
    case "purchase-orders": {
      const records = await prisma.purchaseOrder.findMany({
        where: { tenantId },
        include: { supplier: { select: { code: true, name: true } },
          items: { include: { item: { select: { code: true } } } } },
        orderBy: [{ orderDate: "asc" }, { poNumber: "asc" }],
        take: MAX_RECORDS + 1,
      });
      checkCount(records);
      const rows: CsvCell[][] = records.flatMap(po =>
        (po.items.length ? po.items : [null]).map(line => [
          po.poNumber, po.supplier.code, po.supplier.name, exportDate(po.orderDate),
          exportDate(po.pickupDate), po.status, po.note, po.taxRate,
          po.subtotal, po.tax, po.total, line?.item?.code, line?.itemName,
          line?.unit, line?.quantity, line?.unitPrice, line?.amount,
          line?.received, exportTimestamp(po.createdAt), exportTimestamp(po.updatedAt),
        ]));
      checkLines(rows);
      return {
        headers: ["poNumber", "supplierCode", "supplierName",
          "orderDate", "pickupDate", "status", "note", "taxRate",
          "subtotal", "tax", "total", "itemCode", "itemName", "unit",
          "quantity", "unitPrice", "amount", "received",
          "createdAt", "updatedAt"],
        rows,
      };
    }
    case "movements": {
      const records = await prisma.inventoryMovement.findMany({
        where: { tenantId },
        include: { item: { select: { code: true, name: true } },
          warehouse: { select: { code: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: MAX_RECORDS + 1,
      });
      checkCount(records);
      return {
        headers: ["movementId", "createdAt", "itemCode", "itemName", "type",
          "quantity", "balance", "warehouseCode", "lotNumber", "expiryDate",
          "location", "reference", "note"],
        rows: records.map(r => [
          r.id, exportTimestamp(r.createdAt), r.item.code, r.item.name, r.type,
          r.quantity, r.balance, r.warehouse?.code, r.lotNumber,
          exportDate(r.expiryDate), r.location, r.reference, r.note,
        ]),
      };
    }
    default:
      return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ target: string }> },
) {
  const { tenantId, role } = await requireTenant();
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }
  const { target } = await params;
  if (!["customers", "suppliers", "items", "orders", "purchase-orders", "movements"]
    .includes(target)) {
    return NextResponse.json({ error: "不正な出力対象です" }, { status: 400 });
  }
  try {
    const dataset = await loadDataset(tenantId, target);
    if (!dataset) return NextResponse.json({ error: "不正な出力対象です" }, { status: 400 });
    const csv = toCsv(dataset.headers, dataset.rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="stordex-' + target + '.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === TOO_LARGE) {
      return NextResponse.json({
        error: "10,000件を超えるデータはこの画面から一括出力できません。分割出力機能を追加予定です。",
      }, { status: 413 });
    }
    console.error("CSV export failed", { target, tenantId });
    return NextResponse.json({ error: "CSV出力に失敗しました" }, { status: 500 });
  }
}
