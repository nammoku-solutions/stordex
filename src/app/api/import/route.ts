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
import { autoMap, fieldsFor } from "@/lib/csv/schema";
import { runImport, buildErrorCsv, type ImportConfig } from "@/lib/csv/import";
import type { ImportTarget } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "sin1";
// 大きい CSV をハンドルするため body サイズの上限を緩める
export const maxDuration = 60;

const VALID_TARGETS: ImportTarget[] = ["CUSTOMER", "SUPPLIER", "ITEM", "ORDER"];

export async function POST(req: NextRequest) {
  const { tenantId, userId, role } = await requireTenant();
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "CSV取り込みには管理者権限が必要です" }, { status: 403 });
  }
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

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "CSV は2MB以内にしてください" }, { status: 413 });
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const encodingOpt = String(form.get("encoding") ?? "auto") as any;
  const { text, encoding } = decodeCsvBuffer(buf, encodingOpt);
  if (!["auto", "utf-8", "shift_jis"].includes(encodingOpt)) {
    return NextResponse.json({ ok: false, error: "文字コード設定が不正です" }, { status: 400 });
  }
  const delimiter = String(form.get("delimiter") ?? ",");
  if (![",", ";", "\t"].includes(delimiter)) {
    return NextResponse.json({ ok: false, error: "CSV区切り文字が不正です" }, { status: 400 });
  }
  const rows = parseCsv(text, delimiter);
  const headerRow = parseInt(String(form.get("headerRow") ?? "0"), 10) || 0;
  const skipRows = parseInt(String(form.get("skipRows") ?? "0"), 10) || 0;
  if (headerRow < 0 || headerRow >= rows.length || skipRows < 0 || skipRows > 1000 ||
      rows.length - headerRow - 1 - skipRows > 1000 || rows.length > 1100) {
    return NextResponse.json({ ok: false, error: "CSVは最大1000明細行まで取り込めます" }, { status: 413 });
  }
  const headers = rows[headerRow] ?? [];
  if (!headers.length || headers.length > 100) {
    return NextResponse.json({ ok: false, error: "CSVの列数は1～100列です" }, { status: 400 });
  }

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
  if (!["skip", "update"].includes(upsertMode)) {
    return NextResponse.json({ ok: false, error: "上書きモードが不正です" }, { status: 400 });
  }
  const fieldKeys = new Set(fieldsFor(target).map(f => f.key));
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping) ||
      Object.entries(mapping).some(([key, value]) =>
        !fieldKeys.has(key) || typeof value !== "string" || !headers.includes(value))) {
    return NextResponse.json({ ok: false, error: "列マッピングが不正です" }, { status: 400 });
  }

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
