/**
 * Read-only upload validation for Stordex's own purchase-order CSV export.
 * No Prisma writes, no order status transitions, no stock changes.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { parseCsv, decodeCsvBuffer } from "@/lib/csv/parse";
import { preflightPurchaseOrderExport } from "@/lib/csv/purchase-order-preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const { role } = await requireTenant();
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "管理者権限が必要です" }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "仕入発注CSVファイルを選択してください" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ ok: false, error: "2MBを超えるCSVは検証できません" }, { status: 413 });
    }

    // Existing Stordex exporter always emits BOM-marked UTF-8 CSV.
    const { text } = decodeCsvBuffer(new Uint8Array(await file.arrayBuffer()), "utf-8");
    const report = preflightPurchaseOrderExport(parseCsv(text));
    // Never send the full source document or raw file content back to the client.
    const { documents: _validatedDocuments, ...summary } = report;
    return NextResponse.json({
      ...summary,
      message: summary.ok
        ? "CSV構造の事前検証が完了しました（DBへの書き込みは行っていません）"
        : "CSVに不整合があります。データは取り込まれていません",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      ok: false,
      error: "CSV検証に失敗しました。ファイル形式を確認してください。データは取り込まれていません",
    }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
