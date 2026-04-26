import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { ItemForm } from "../ItemForm";
import { updateItem } from "../actions";

export default async function EditItemPage({ params }: { params: { id: string } }) {
  const { tenantId } = await requireTenant();
  const [item, suppliers] = await Promise.all([
    prisma.item.findFirst({ where: { id: params.id, tenantId } }),
    prisma.supplier.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    }),
  ]);
  if (!item) notFound();
  const action = updateItem.bind(null, item.id);
  return (
    <>
      <PageHeader title={`商品 編集: ${item.name}`} />
      <ItemForm action={action} initial={item} suppliers={suppliers} submitLabel="更新" />
    </>
  );
}
