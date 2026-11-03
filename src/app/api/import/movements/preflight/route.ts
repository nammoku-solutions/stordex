/**
 * Read-only check that Stordex item-current-stock CSV and movement CSV agree.
 * Never writes item stock or inventory movements and never calls Prisma.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { decodeCsvBuffer, parseCsv } from "@/lib/csv/parse";
import { preflightInventoryLedgerExports } from "@/lib/csv/inventory-ledger-preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES_PER_FILE = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const { role } = await requireTenant();
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "管理者権限が必要です" }, { status: 403 });
  }
  try {
    const body = await request.formData();
    const items = body.get("items");
    const movements = body.get("movements");
    if (!items || typeof items === "string" || !movements ||
        typeof movements === "string") {
      return NextResponse.json({
        ok: false, error: "商品・現在庫CSVと入出庫履歴CSVの2ファイルが必要です",
      }, { status: 400 });
    }
    if (items.size === 0 || movements.size === 0) {
      return NextResponse.json({ ok: false, error: "空のCSVファイルは検証できません" }, { status: 400 });
    }
    if (items.size > MAX_BYTES_PER_FILE || movements.size > MAX_BYTES_PER_FILE) {
      return NextResponse.json({
        ok: false, error: "各CSVファイルは2MB以内にしてください",
      }, { status: 413 });
    }
    const read = async (file: File) => {
      const decoded = decodeCsvBuffer(new Uint8Array(await file.arrayBuffer()), "utf-8");
      return parseCsv(decoded.text);
    };
    const result = preflightInventoryLedgerExports({
      items: await read(items),
      movements: await read(movements),
    });
    // Do not echo source rows, product names or sensitive history fields.
    const { summaries: _sourceItems, ...report } = result;
    return NextResponse.json({
      ...report,
      message: result.ok
        ? "在庫CSVの整合性検証が完了しました。データは変更していません"
        : "在庫CSVに不整合があります。データは変更していません",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      ok: false, error: "CSV形式の検証に失敗しました。データは変更していません",
    }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
