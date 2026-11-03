import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireTenant } from "@/lib/session";
import { ImportClient } from "./_client";
import {
  CUSTOMER_FIELDS,
  ITEM_FIELDS,
  ORDER_FIELDS,
  SUPPLIER_FIELDS,
} from "@/lib/csv/schema";
import { builtInPresetsFor } from "@/lib/csv/presets";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireTenant();
  const fieldsByTarget = {
    ITEM: ITEM_FIELDS,
    CUSTOMER: CUSTOMER_FIELDS,
    SUPPLIER: SUPPLIER_FIELDS,
    ORDER: ORDER_FIELDS,
  };
  const presetsByTarget = {
    ITEM: builtInPresetsFor("ITEM"),
    CUSTOMER: builtInPresetsFor("CUSTOMER"),
    SUPPLIER: builtInPresetsFor("SUPPLIER"),
    ORDER: builtInPresetsFor("ORDER"),
  };

  return (
    <>
      <PageHeader
        title="CSV 取り込み"
        description="商品 / 得意先 / 仕入先 / 受注の CSV をアップロード、列マッピングを確認して取り込みます"
        action={
          <Link href="/settings/import/history" className="btn-secondary">
            履歴
          </Link>
        }
      />
      <div className="card mb-5 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">仕入発注CSVの事前検証（データ変更なし）</h2>
          <p className="text-sm text-slate-600">
            「CSVエクスポート」→「仕入発注と過去履歴」からダウンロードしたCSVを検証します。仕入発注の復元機能はまだありません。
          </p>
        </div>
        <Link href="/settings/import/purchase-orders" className="btn-secondary">
          仕入発注CSVを検証する
        </Link>
      </div>
      <div className="card mb-5 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">在庫・入出庫履歴CSVを照合（データ変更なし）</h2>
          <p className="text-sm text-slate-600">
            「商品・現在庫」と「入出庫履歴」の2つのCSVを比較し、履歴の連続性・現在庫・推定開始在庫を検証します。
          </p>
        </div>
        <Link href="/settings/import/movements" className="btn-secondary">
          在庫と履歴を照合する
        </Link>
      </div>
      <ImportClient
        fieldsByTarget={fieldsByTarget}
        presetsByTarget={presetsByTarget}
      />
    </>
  );
}
