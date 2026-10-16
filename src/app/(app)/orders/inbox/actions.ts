"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { acceptCompanyPurchaseOrder } from "@/lib/b2b-accept";

function manager(role: string) {
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new Error("企業間受注の承認には管理者権限が必要です");
  }
}

export async function acceptInboundPurchaseOrder(formData: FormData) {
  const { tenantId, role } = await requireTenant();
  manager(role);
  const sellerOrderId = await acceptCompanyPurchaseOrder({ tenantId, formData });
  revalidatePath("/orders/inbox");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  redirect(`/orders/${sellerOrderId}`);
}

export async function rejectInboundPurchaseOrder(formData: FormData) {
  const { tenantId, role } = await requireTenant();
  manager(role);
  const id = String(formData.get("inboundId") ?? "");
  if (!id) throw new Error("受信発注が指定されていません");
  const rejected = await prisma.intercompanyOrder.updateMany({
    where: { id, sellerTenantId: tenantId, status: "SENT" },
    data: { status: "REJECTED" },
  });
  if (rejected.count !== 1) throw new Error("対象の注文は処理済みです");
  revalidatePath("/orders/inbox");
  redirect("/orders/inbox");
}
