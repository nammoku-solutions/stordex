/**
 * 失敗行 CSV のダウンロード。
 * GET /api/import/jobs/:id/errors
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const { tenantId } = await requireTenant();
  const job = await prisma.importJob.findFirst({
    where: { id: ctx.params.id, tenantId },
    select: { errorCsv: true, fileName: true },
  });
  if (!job || !job.errorCsv) {
    return NextResponse.json({ ok: false, error: "エラー CSV はありません" }, { status: 404 });
  }
  // BOM を付けて Excel でも文字化けしないようにする
  const body = "\uFEFF" + job.errorCsv;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="errors-${ctx.params.id}.csv"`,
    },
  });
}
