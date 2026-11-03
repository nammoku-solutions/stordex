/**
 * Read-only check that Stordex item-current-stock CSV and movement CSV agree.
 * Never writes item stock or inventory movements and never calls Prisma.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { createInventoryCutoverManifest } from "@/lib/csv/inventory-cutover-manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES_PER_FILE = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const { tenantId, role } = await requireTenant();
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
    // Validate and fingerprint the EXACT uploaded bytes in one operation;
    // never validate one parsed source while hashing another.
    const { audit, manifest } = createInventoryCutoverManifest({
      tenantId,
      itemsCsv: new Uint8Array(await items.arrayBuffer()),
      movementsCsv: new Uint8Array(await movements.arrayBuffer()),
    });
    // The owner/admin may download the explicit cutover stock snapshot.
    // No source CSV rows or person names are returned, and no DB is mutated.
    const { summaries: _sourceItems, ...report } = audit;
    return NextResponse.json({
      ...report,
      manifest,
      message: audit.ok
        ? "在庫CSVの整合性検証が完了しました。データは変更していません"
        : "在庫CSVに不整合があります。データは変更していません",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({
      ok: false, error: "CSV形式の検証に失敗しました。データは変更していません",
    }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
