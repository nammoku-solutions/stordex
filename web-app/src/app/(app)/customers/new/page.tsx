import { PageHeader } from "@/components/PageHeader";
import { CustomerForm } from "../CustomerForm";
import { createCustomer } from "../actions";

export default function NewCustomerPage() {
  return (
    <>
      <PageHeader title="得意先 新規登録" />
      <CustomerForm action={createCustomer} submitLabel="登録" />
    </>
  );
}
