import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { OrderForm } from "../OrderForm";
import { createOrder } from "../actions";

export default async function NewOrderPage() {
  const { tenantId } = await requireTenant();
  const [customers, items] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId, active: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.item.findMany({
      where: { tenantId, active: true },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        salesPrice: true,
        stock: true,
      },
      orderBy: { code: "asc" },
    }),
  ]);

  if (customers.length === 0) {
    return (
      <>
        <PageHeader title="新規注文" />
        <div className="card p-6 text-slate-600">
          先に「得意先」を登録してください。
        </div>
      </>
    );
  }
  if (items.length === 0) {
    return (
      <>
        <PageHeader title="新規注文" />
        <div className="card p-6 text-slate-600">
          先に「商品マスタ」を登録してください。
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="新規注文" />
      <OrderForm action={createOrder} customers={customers} items={items} />
    </>
  );
}
