import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

const TARGET_LABEL: Record<string, string> = {
  ITEM: "商品",
  CUSTOMER: "得意先",
  SUPPLIER: "仕入先",
  ORDER: "受注",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "実行中",
  DRYRUN_OK: "ドライラン OK",
  DRYRUN_FAILED: "ドライラン エラー",
  COMMITTED: "完了",
  FAILED: "失敗",
};

const STATUS_COLOR: Record<string, string> = {
  DRYRUN_OK: "text-blue-700",
  DRYRUN_FAILED: "text-amber-700",
  COMMITTED: "text-green-700",
  FAILED: "text-red-700",
  PENDING: "text-slate-500",
};

export default async function ImportHistoryPage() {
  const { tenantId } = await requireTenant();
  const jobs = await prisma.importJob.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="CSV 取り込み履歴"
        description="直近 100 件の取り込み履歴です"
        action={
          <Link href="/settings/import" className="btn-secondary">
            取り込み画面へ
          </Link>
        }
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left px-3 py-2">日時</th>
              <th className="text-left px-3 py-2">対象</th>
              <th className="text-left px-3 py-2">ファイル</th>
              <th className="text-right px-3 py-2">行数</th>
              <th className="text-right px-3 py-2">新規</th>
              <th className="text-right px-3 py-2">更新</th>
              <th className="text-right px-3 py-2">スキップ</th>
              <th className="text-right px-3 py-2">エラー</th>
              <th className="text-left px-3 py-2">状態</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-slate-500 py-8">
                  まだ取り込み履歴がありません
                </td>
              </tr>
            )}
            {jobs.map((j) => (
              <tr key={j.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">
                  {j.createdAt.toLocaleString("ja-JP")}
                </td>
                <td className="px-3 py-2">{TARGET_LABEL[j.target]}</td>
                <td className="px-3 py-2 truncate max-w-[240px]">{j.fileName}</td>
                <td className="px-3 py-2 text-right">{j.rowCount}</td>
                <td className="px-3 py-2 text-right text-blue-700">{j.createdCount}</td>
                <td className="px-3 py-2 text-right text-amber-700">{j.updatedCount}</td>
                <td className="px-3 py-2 text-right text-slate-500">{j.skippedCount}</td>
                <td className="px-3 py-2 text-right text-red-700">{j.errorCount}</td>
                <td className={`px-3 py-2 ${STATUS_COLOR[j.status]}`}>
                  {STATUS_LABEL[j.status]}
                </td>
                <td className="px-3 py-2">
                  {j.errorCount > 0 && (
                    <a
                      href={`/api/import/jobs/${j.id}/errors`}
                      className="text-blue-600 underline text-xs"
                    >
                      エラーCSV
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
