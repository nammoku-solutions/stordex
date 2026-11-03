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
          <h2 className="font-semibold">仕入発注CSVを復元する前の事前検証</h2>
          <p className="text-sm text-slate-600">
            発注履歴CSVの構造・入数・金額をデータ変更なしで検証できます。仕入発注の復元機能はまだありません。
          </p>
        </div>
        <Link href="/settings/import/purchase-orders" className="btn-secondary">
          仕入発注CSVを検証する
        </Link>
      </div>
      <ImportClient
        fieldsByTarget={fieldsByTarget}
        presetsByTarget={presetsByTarget}
      />
    </>
  );
}
