"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/session";
import { sendOrderToCompany } from "@/lib/b2b-send";

export async function sendPurchaseOrderToPartner(formData: FormData) {
  const { tenantId, role } = await requireTenant();
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new Error("企業間への発注送信には管理者権限が必要です");
  }
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  const partnerId = String(formData.get("partnerId") ?? "");
  if (!purchaseOrderId || !partnerId || partnerId === tenantId ||
      formData.get("confirmRecipient") !== "yes") {
    throw new Error("発注先企業を確認し、送信内容を承認してください");
  }
  await sendOrderToCompany({ tenantId, partnerId, purchaseOrderId });

  revalidatePath("/purchase-orders");
  revalidatePath("/orders/inbox");
  revalidatePath(`/purchase-orders/${purchaseOrderId}`);
  redirect(`/purchase-orders/${purchaseOrderId}?sent=1`);
}
