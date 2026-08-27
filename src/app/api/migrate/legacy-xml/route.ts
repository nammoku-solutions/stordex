import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TOTAL_IMPORT_BYTES = 8_000_000;
const MAX_FILE_BYTES = 2_000_000;

/**
 * 旧アプリ（C# Windows Forms）の Customer_data.xml / Item_data.xml /
 * Supplier_data.xml / Order_data.xml を読み込み、現テナント配下に作成する。
 *
 * 受信形式: multipart/form-data
 *   - customers: Customer_data.xml
 *   - items:     Item_data.xml
 *   - suppliers: Supplier_data.xml
 *   - orders:    Order_data.xml
 *
 * すべて任意。提供されたファイルだけインポートする。重複コードはスキップ。
 */
export async function POST(req: NextRequest) {
  const { tenantId, role } = await requireTenant();
  if (role === "STAFF") {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_TOTAL_IMPORT_BYTES) {
    return NextResponse.json({ error: "アップロードサイズが大きすぎます" }, { status: 413 });
  }

  const form = await req.formData();
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    processEntities: false,
  });

  const stats = {
    customers: { created: 0, skipped: 0 },
    suppliers: { created: 0, skipped: 0 },
    items: { created: 0, skipped: 0 },
    orders: { created: 0, skipped: 0 },
  };

  async function asText(field: string) {
    const f = form.get(field);
    if (!f || typeof f === "string") return null;
    if (f.size > MAX_FILE_BYTES) {
      throw new Error(`${field}: file too large`);
    }
    return await f.text();
  }
  function rows(xml: string, tableName: string): any[] {
    const j = parser.parse(xml);
    let arr: any[] = [];
    const walk = (o: any) => {
      if (!o || typeof o !== "object") return;
      for (const [k, v] of Object.entries(o)) {
        if (k === tableName) {
          arr = arr.concat(Array.isArray(v) ? v : [v]);
        } else if (typeof v === "object") {
          walk(v);
        }
      }
    };
    walk(j);
    return arr;
  }
  const pickStr = (r: any, ...keys: string[]) => {
    for (const k of keys) {
      const v = r?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return null;
  };
  const pickInt = (r: any, ...keys: string[]) => {
    const s = pickStr(r, ...keys);
    if (!s) return null;
    const n = parseInt(s.replace(/[^\d-]/g, ""), 10);
    return isNaN(n) ? null : n;
  };

  const cxml = await asText("customers");
  if (cxml) {
    const data = rows(cxml, "Customer").concat(rows(cxml, "得意先"));
    for (const r of data) {
      const code = pickStr(r, "Code", "得意先コード", "ID", "顧客コード");
      const name = pickStr(r, "Name", "得意先名", "顧客名");
      if (!code || !name) {
        stats.customers.skipped++;
        continue;
      }
      const exists = await prisma.customer.findUnique({
        where: { tenantId_code: { tenantId, code } },
      });
      if (exists) {
        stats.customers.skipped++;
        continue;
      }
      await prisma.customer.create({
        data: {
          tenantId,
          code,
          name,
          phone: pickStr(r, "Phone", "電話", "TEL"),
          fax: pickStr(r, "Fax", "FAX"),
          email: pickStr(r, "Email", "メール"),
          postalCode: pickStr(r, "Zip", "PostalCode", "郵便番号"),
          address: pickStr(r, "Address", "住所"),
          note: pickStr(r, "Note", "Memo", "備考"),
        },
      });
      stats.customers.created++;
    }
  }

  const sxml = await asText("suppliers");
  if (sxml) {
    const data = rows(sxml, "Supplier").concat(rows(sxml, "仕入先"));
    for (const r of data) {
      const code = pickStr(r, "Code", "仕入先コード");
      const name = pickStr(r, "Name", "仕入先名");
      if (!code || !name) {
        stats.suppliers.skipped++;
        continue;
      }
      const exists = await prisma.supplier.findUnique({
        where: { tenantId_code: { tenantId, code } },
      });
      if (exists) {
        stats.suppliers.skipped++;
        continue;
      }
      await prisma.supplier.create({
        data: {
          tenantId,
          code,
          name,
          phone: pickStr(r, "Phone", "電話", "TEL"),
          fax: pickStr(r, "Fax", "FAX"),
          email: pickStr(r, "Email"),
          postalCode: pickStr(r, "Zip", "PostalCode", "郵便番号"),
          address: pickStr(r, "Address", "住所"),
          note: pickStr(r, "Note", "備考"),
        },
      });
      stats.suppliers.created++;
    }
  }

  const ixml = await asText("items");
  if (ixml) {
    const data = rows(ixml, "Item").concat(rows(ixml, "商品"));
    for (const r of data) {
      const code = pickStr(r, "Code", "商品コード", "ItemCode");
      const name = pickStr(r, "Name", "商品名");
      if (!code || !name) {
        stats.items.skipped++;
        continue;
      }
      const exists = await prisma.item.findUnique({
        where: { tenantId_code: { tenantId, code } },
      });
      if (exists) {
        stats.items.skipped++;
        continue;
      }
      const supplierCode = pickStr(r, "SupplierCode", "仕入先コード");
      let supplierId: string | null = null;
      if (supplierCode) {
        const s = await prisma.supplier.findUnique({
          where: { tenantId_code: { tenantId, code: supplierCode } },
        });
        supplierId = s?.id ?? null;
      }
      await prisma.item.create({
        data: {
          tenantId,
          code,
          name,
          unit: pickStr(r, "Unit", "単位") || "個",
          costPrice: pickInt(r, "CostPrice", "Cost", "仕入単価", "原価") ?? 0,
          salesPrice: pickInt(r, "SalesPrice", "Price", "売価", "販売単価") ?? 0,
          stock: pickInt(r, "Stock", "在庫") ?? 0,
          supplierId,
          note: pickStr(r, "Note", "備考"),
        },
      });
      stats.items.created++;
    }
  }

  const oxml = await asText("orders");
  if (oxml) {
    const data = rows(oxml, "Order").concat(rows(oxml, "注文"), rows(oxml, "受注"));
    const groups = new Map<string, any[]>();
    for (const r of data) {
      const num = pickStr(r, "OrderNumber", "OrderNo", "注文番号", "伝票番号");
      if (!num) continue;
      if (!groups.has(num)) groups.set(num, []);
      groups.get(num)!.push(r);
    }
    for (const [num, list] of groups) {
      const head = list[0];
      const customerCode = pickStr(head, "CustomerCode", "得意先コード");
      if (!customerCode) {
        stats.orders.skipped++;
        continue;
      }
      const customer = await prisma.customer.findUnique({
        where: { tenantId_code: { tenantId, code: customerCode } },
      });
      if (!customer) {
        stats.orders.skipped++;
        continue;
      }
      const exists = await prisma.order.findUnique({
        where: { tenantId_orderNumber: { tenantId, orderNumber: num } },
      });
      if (exists) {
        stats.orders.skipped++;
        continue;
      }
      const orderDate = pickStr(head, "OrderDate", "注文日") || new Date().toISOString();
      const dueDate = pickStr(head, "DueDate", "納品日");
      const lines: any[] = [];
      let subtotal = 0;
      for (const r of list) {
        const itemCode = pickStr(r, "ItemCode", "商品コード");
        const qty = pickInt(r, "Quantity", "Qty", "数量");
        if (!itemCode || !qty) continue;
        const item = await prisma.item.findUnique({
          where: { tenantId_code: { tenantId, code: itemCode } },
        });
        if (!item) continue;
        const unitPrice = pickInt(r, "UnitPrice", "Price", "単価") ?? item.salesPrice;
        const amount = unitPrice * qty;
        subtotal += amount;
        lines.push({
          itemId: item.id,
          itemName: item.name,
          unit: item.unit,
          quantity: qty,
          unitPrice,
          amount,
        });
      }
      if (lines.length === 0) {
        stats.orders.skipped++;
        continue;
      }
      const taxRate = 10;
      const tax = Math.floor((subtotal * taxRate) / 100);
      await prisma.order.create({
        data: {
          tenantId,
          orderNumber: num,
          customerId: customer.id,
          orderDate: new Date(orderDate),
          dueDate: dueDate ? new Date(dueDate) : null,
          status: "COMPLETED",
          subtotal,
          taxRate,
          tax,
          total: subtotal + tax,
          items: { create: lines },
        },
      });
      stats.orders.created++;
    }
  }

  return NextResponse.json({ ok: true, stats });
}
