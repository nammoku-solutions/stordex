import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { CustomerForm } from "../CustomerForm";
import { updateCustomer } from "../actions";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenantId } = await requireTenant();
  const customer = await prisma.customer.findFirst({
    where: { id: id, tenantId },
  });
  if (!customer) notFound();

  const action = updateCustomer.bind(null, customer.id);

  return (
    <>
      <PageHeader title={`得意先 編集: ${customer.name}`} />
      <CustomerForm action={action} initial={customer} submitLabel="更新" />
    </>
  );
}
