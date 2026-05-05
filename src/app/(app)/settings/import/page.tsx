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
      <ImportClient
        fieldsByTarget={fieldsByTarget}
        presetsByTarget={presetsByTarget}
      />
    </>
  );
}
