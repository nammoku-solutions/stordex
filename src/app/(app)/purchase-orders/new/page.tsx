import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { PurchaseOrderForm } from "../PurchaseOrderForm";
import { createPurchaseOrder } from "../actions";

export default async function NewPurchaseOrderPage() {
  const { tenantId } = await requireTenant();
  const [suppliers, items] = await Promise.all([
    prisma.supplier.findMany({
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
        costPrice: true,
        supplierId: true,
        purchaseMode: true,
        caseQty: true,
        orderUnit: true,
      },
      orderBy: { code: "asc" },
    }),
  ]);
  if (suppliers.length === 0) {
    return (
      <>
        <PageHeader title="新規発注" />
        <div className="card p-6 text-slate-600">先に「仕入先」を登録してください。</div>
      </>
    );
  }
  return (
    <>
      <PageHeader title="新規発注" />
      <PurchaseOrderForm action={createPurchaseOrder} suppliers={suppliers} items={items} />
    </>
  );
}
