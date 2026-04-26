import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { SupplierForm } from "../SupplierForm";
import { updateSupplier } from "../actions";

export default async function EditSupplierPage({ params }: { params: { id: string } }) {
  const { tenantId } = await requireTenant();
  const supplier = await prisma.supplier.findFirst({
    where: { id: params.id, tenantId },
  });
  if (!supplier) notFound();
  const action = updateSupplier.bind(null, supplier.id);
  return (
    <>
      <PageHeader title={`仕入先 編集: ${supplier.name}`} />
      <SupplierForm action={action} initial={supplier} submitLabel="更新" />
    </>
  );
}
