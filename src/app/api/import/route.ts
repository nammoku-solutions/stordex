/**
 * CSV インポート用 API。
 *
 * 受信: multipart/form-data
 *   - file:       CSV ファイル本体
 *   - target:     "CUSTOMER" | "SUPPLIER" | "ITEM" | "ORDER"
 *   - mode:       "preview" | "dryrun" | "commit"
 *   - encoding:   "auto" | "utf-8" | "shift_jis" (任意)
 *   - delimiter:  "," | "\t" | ";"             (任意)
 *   - headerRow:  number                       (任意)
 *   - skipRows:   number                       (任意)
 *   - upsertMode: "skip" | "update"            (任意)
 *   - mapping:    JSON string                  (preview 以外で必須)
 *
 * 返却: JSON
 *   - preview: { headers, sample, autoMap, encoding }
 *   - dryrun/commit: { result: ImportResult, jobId? }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { decodeCsvBuffer, parseCsv } from "@/lib/csv/parse";
import { autoMap } from "@/lib/csv/schema";
import { runImport, buildErrorCsv, type ImportConfig } from "@/lib/csv/import";
import type { ImportTarget } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 大きい CSV をハンドルするため body サイズの上限を緩める
export const maxDuration = 60;

const VALID_TARGETS: ImportTarget[] = ["CUSTOMER", "SUPPLIER", "ITEM", "ORDER"];

export async function POST(req: NextRequest) {
  const { tenantId, userId } = await requireTenant();
  const form = await req.formData();
  const file = form.get("file");
  const target = String(form.get("target") ?? "") as ImportTarget;
  const mode = String(form.get("mode") ?? "preview");

  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "file が必要です" }, { status: 400 });
  }
  if (!VALID_TARGETS.includes(target)) {
    return NextResponse.json({ ok: false, error: "target が不正です" }, { status: 400 });
  }
  if (!["preview", "dryrun", "commit"].includes(mode)) {
    return NextResponse.json({ ok: false, error: "mode が不正です" }, { status: 400 });
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const encodingOpt = String(form.get("encoding") ?? "auto") as any;
  const { text, encoding } = decodeCsvBuffer(buf, encodingOpt);
  const delimiter = String(form.get("delimiter") ?? ",");
  const rows = parseCsv(text, delimiter);
  const headerRow = parseInt(String(form.get("headerRow") ?? "0"), 10) || 0;
  const skipRows = parseInt(String(form.get("skipRows") ?? "0"), 10) || 0;
  const headers = rows[headerRow] ?? [];

  if (mode === "preview") {
    return NextResponse.json({
      ok: true,
      headers,
      sample: rows.slice(headerRow + 1, headerRow + 1 + 10),
      totalRows: Math.max(0, rows.length - headerRow - 1),
      autoMap: autoMap(target, headers),
      encoding,
    });
  }

  // dryrun / commit
  let mapping: Record<string, string> = {};
  try {
    mapping = JSON.parse(String(form.get("mapping") ?? "{}"));
  } catch {
    return NextResponse.json({ ok: false, error: "mapping JSON が不正です" }, { status: 400 });
  }
  const upsertMode = (String(form.get("upsertMode") ?? "skip") as "skip" | "update");

  const config: ImportConfig = {
    target,
    mapping,
    headerRow,
    skipRows,
    upsertMode,
  };

  const dryrun = mode === "dryrun";
  const result = await runImport({ tenantId, rows, config, dryrun });

  // ImportJob を記録
  const errorCsv = result.errors.length > 0 ? buildErrorCsv(headers, result.errors) : null;
  const status =
    result.errorCount > 0 && dryrun
      ? "DRYRUN_FAILED"
      : dryrun
      ? "DRYRUN_OK"
      : result.errorCount > 0
      ? "FAILED"
      : "COMMITTED";

  const job = await prisma.importJob.create({
    data: {
      tenantId,
      userId,
      target,
      fileName: (file as any).name ?? "import.csv",
      rowCount: result.rowCount,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
      status,
      errorCsv,
      summary: dryrun
        ? `[ドライラン] 新規 ${result.createdCount} / 更新 ${result.updatedCount} / スキップ ${result.skippedCount} / エラー ${result.errorCount}`
        : `新規 ${result.createdCount} / 更新 ${result.updatedCount} / スキップ ${result.skippedCount} / エラー ${result.errorCount}`,
    },
  });

  return NextResponse.json({
    ok: result.errorCount === 0,
    jobId: job.id,
    status,
    result: {
      rowCount: result.rowCount,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
      errors: result.errors.slice(0, 50), // 大量エラーは UI 上で 50 件まで
      samples: result.samples,
      hasErrorCsv: !!errorCsv,
    },
  });
}
