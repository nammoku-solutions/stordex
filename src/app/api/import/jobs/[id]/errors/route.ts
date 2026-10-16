/**
 * 失敗行 CSV のダウンロード。
 * GET /api/import/jobs/:id/errors
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { tenantId, role } = await requireTenant();
  if (role !== "OWNER" && role !== "ADMIN") return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  const { id } = await ctx.params;
  const job = await prisma.importJob.findFirst({
    where: { id: id, tenantId },
    select: { errorCsv: true, fileName: true },
  });
  if (!job || !job.errorCsv) {
    return NextResponse.json({ ok: false, error: "エラー CSV はありません" }, { status: 404 });
  }
  // BOM を付けて Excel でも文字化けしないようにする
  const body = job.errorCsv;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="errors-${id}.csv"`,
    },
  });
}
