import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { ItemForm } from "../ItemForm";
import { createItem } from "../actions";

export default async function NewItemPage() {
  const { tenantId } = await requireTenant();
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true, code: true },
    orderBy: { code: "asc" },
  });
  return (
    <>
      <PageHeader title="商品 新規登録" />
      <ItemForm action={createItem} suppliers={suppliers} submitLabel="登録" />
    </>
  );
}
