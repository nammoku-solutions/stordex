import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireTenant } from "@/lib/session";
import { PurchaseOrderPreflightClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderImportPreflightPage() {
  const { role } = await requireTenant();
  return (
    <>
      <PageHeader
        title="仕入発注CSVの事前検証"
        description="Stordexから出力した仕入発注CSVの列・数量・入数・金額・日付の整合性を確認します。DBへの書き込みは行いません。"
        action={<Link href="/settings/import" className="btn-secondary">CSV取り込みへ戻る</Link>}
      />
      {role === "OWNER" || role === "ADMIN" ? (
        <PurchaseOrderPreflightClient />
      ) : (
        <div className="card p-5 text-amber-800">
          CSVの検証は管理者（OWNER / ADMIN）のみ実施できます。
        </div>
      )}
    </>
  );
}
