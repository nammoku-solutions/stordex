import { PageHeader } from "@/components/PageHeader";
import { SupplierForm } from "../SupplierForm";
import { createSupplier } from "../actions";

export default function NewSupplierPage() {
  return (
    <>
      <PageHeader title="仕入先 新規登録" />
      <SupplierForm action={createSupplier} submitLabel="登録" />
    </>
  );
}
