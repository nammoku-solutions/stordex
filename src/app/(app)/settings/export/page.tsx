import { PageHeader } from "@/components/PageHeader";
import { requireTenant } from "@/lib/session";

const EXPORTS = [
  ["customers", "得意先マスタ", "住所・連絡先・担当者・顧客コード"],
  ["suppliers", "仕入先マスタ", "取引先情報・連絡先・仕入先コード"],
  ["items", "商品・現在庫", "商品コード・価格・現在庫・発注点・仕入先"],
  ["orders", "受注と過去履歴", "受注ヘッダと明細（1明細につき1行）"],
  ["purchase-orders", "発注と過去履歴", "発注ヘッダと明細・入荷済数量"],
  ["movements", "入出庫履歴", "履歴日時・入出庫増減・記録後の残在庫"],
] as const;

export default async function ExportPage() {
  const { role } = await requireTenant();
  const manager = role === "OWNER" || role === "ADMIN";
  return (
    <>
      <PageHeader
        title="CSV エクスポート"
        description="既存システム移行・バックアップ・他システムへの移行用にデータを取得します"
      />
      {!manager ? (
        <div className="card p-5 text-amber-800">出力できるのは管理者（OWNER / ADMIN）のみです。</div>
      ) : (
        <div className="card p-5 space-y-3">
          {EXPORTS.map(([target, title, details]) => (
            <div key={target} className="py-3 border-b last:border-b-0 border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">{title}</h2>
                <p className="text-sm text-slate-500">{details}</p>
              </div>
              <a className="btn-primary" href={`/api/export/${target}`}>
                CSV ダウンロード
              </a>
            </div>
          ))}
        </div>
      )}
      <div className="mt-5 text-sm text-slate-600 space-y-2">
        <p>CSVはUTF-8（BOM付き）で出力します。1回の出力は最大10,000件／明細行までです。上限超過時にはエラーとなり、途中までのデータは出力されません。</p>
        <p>業務システムへの完全な移行には得意先・仕入先・商品・受発注・入出庫履歴の整合性確認が必要です。現在の出力は個別データの取得機能であり、一括移行・再取込の同一性検証までは未対応です。</p>
      </div>
    </>
  );
}
