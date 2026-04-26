import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { BusinessUnitForm } from "../BusinessUnitForm";
import { updateBusinessUnit, deleteBusinessUnit } from "../actions";
import { DeleteButton } from "./DeleteButton";

export default async function EditBusinessUnitPage({ params }: { params: { id: string } }) {
  const { tenantId } = await requireTenant();
  const unit = await prisma.businessUnit.findFirst({ where: { id: params.id, tenantId } });
  if (!unit) notFound();
  const update = updateBusinessUnit.bind(null, unit.id);
  return (
    <>
      <PageHeader
        title={`事業所 ${unit.name}`}
        action={<DeleteButton id={unit.id} />}
      />
      <BusinessUnitForm action={update} unit={unit} />
    </>
  );
}
