import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireTenant } from "@/lib/session";
import { InventoryLedgerPreflightClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function InventoryLedgerPreflightPage() {
  const { role } = await requireTenant();
  return (
    <>
      <PageHeader
        title="在庫・入出庫履歴CSVの整合性確認"
        description="商品現在庫と入出庫履歴の残高を照合します。検証専用で、データを変更しません。"
        action={<Link href="/settings/import" className="btn-secondary">CSV取り込みへ戻る</Link>}
      />
      {role === "OWNER" || role === "ADMIN" ? (
        <InventoryLedgerPreflightClient />
      ) : (
        <div className="card p-5 text-amber-800">
          CSV照合は管理者（OWNER / ADMIN）のみ実施できます。
        </div>
      )}
    </>
  );
}
