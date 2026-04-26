import { PageHeader } from "@/components/PageHeader";
import { BusinessUnitForm } from "../BusinessUnitForm";
import { createBusinessUnit } from "../actions";

export default function NewBusinessUnitPage() {
  return (
    <>
      <PageHeader title="事業所を追加" />
      <BusinessUnitForm action={createBusinessUnit} />
    </>
  );
}
