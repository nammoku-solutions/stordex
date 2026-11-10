"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { b2bReturnStockEnabled } from "@/lib/b2b-return-stock-feature";
import {
  B2BReturnPostingError, postBuyerReturnDispatch, postSellerReturnInspection,
} from "@/lib/b2b-return-stock-posting";
import { ReturnQuantityError } from "@/lib/b2b-return-quantity";
import { ReturnEventPlanError } from "@/lib/b2b-return-event-plans";
import {
  ReturnStockFormError, parseBuyerReturnDispatch, parseSellerReturnInspection,
} from "@/lib/b2b-return-stock-form";

export type StockFormState = { error: string | null };
const NOT_ENABLED = "返送・検品はまだ有効化されていません。";
const DENIED = "返送・検品には企業の管理者権限が必要です。";

function canManage(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}
function safeError(error: unknown): string {
  if (error instanceof B2BReturnPostingError ||
      error instanceof ReturnQuantityError ||
      error instanceof ReturnEventPlanError ||
      error instanceof ReturnStockFormError) {
    return error.message;
  }
  return "在庫更新に失敗しました。画面を更新し、在庫を確認してから再度お試しください。";
}

/** Idempotency on a retry is enforced in the service; the request ID used to
 * redirect is resolved from the recorded event, never from untrusted form data.
 */
async function verifiedReturnId(eventId: string, tenantId: string): Promise<string> {
  const event = await prisma.b2BReturnStockEvent.findFirst({
    where: { id: eventId, tenantId },
    select: { returnItem: { select: { returnRequestId: true } } },
  });
  if (!event) throw new Error("Recorded physical return event was not found");
  return event.returnItem.returnRequestId;
}

async function assertReturnItemLink(input: {
  tenantId: string; requestId: string; returnItemId: string;
  side: "BUYER" | "SELLER";
}) {
  const match = await prisma.b2BReturnItem.findFirst({
    where: {
      id: input.returnItemId,
      returnRequestId: input.requestId,
      returnRequest: input.side === "BUYER"
        ? { buyerTenantId: input.tenantId }
        : { sellerTenantId: input.tenantId },
    },
    select: { id: true },
  });
  if (!match) {
    throw new ReturnStockFormError("返品申請と明細が一致しないか、操作権限がありません");
  }
}

export async function dispatchB2BReturnForm(
  _state: StockFormState, formData: FormData,
): Promise<StockFormState> {
  if (!b2bReturnStockEnabled()) return { error: NOT_ENABLED };
  const { tenantId, userId, role } = await requireTenant();
  if (!canManage(role)) return { error: DENIED };
  let requestId: string;
  try {
    const parsed = parseBuyerReturnDispatch(formData);
    await assertReturnItemLink({
      tenantId, requestId: parsed.requestId,
      returnItemId: parsed.returnItemId, side: "BUYER",
    });
    const result = await postBuyerReturnDispatch({
      tenantId, userId, returnItemId: parsed.returnItemId,
      eventId: parsed.eventId, quantity: parsed.quantity,
    });
    requestId = await verifiedReturnId(result.stockEventId, tenantId);
    if (requestId !== parsed.requestId) throw new ReturnStockFormError("返品申請IDが一致しません");
  } catch (error) {
    return { error: safeError(error) };
  }
  revalidatePath("/returns");
  revalidatePath("/returns/" + requestId);
  revalidatePath("/items");
  redirect("/returns/" + requestId);
}

export async function inspectB2BReturnForm(
  _state: StockFormState, formData: FormData,
): Promise<StockFormState> {
  if (!b2bReturnStockEnabled()) return { error: NOT_ENABLED };
  const { tenantId, userId, role } = await requireTenant();
  if (!canManage(role)) return { error: DENIED };
  let requestId: string;
  try {
    const parsed = parseSellerReturnInspection(formData);
    await assertReturnItemLink({
      tenantId, requestId: parsed.requestId,
      returnItemId: parsed.returnItemId, side: "SELLER",
    });
    const result = await postSellerReturnInspection({
      tenantId, userId, returnItemId: parsed.returnItemId,
      eventId: parsed.eventId, receivedNow: parsed.receivedNow,
      saleable: parsed.saleable, unsaleable: parsed.unsaleable,
    });
    requestId = await verifiedReturnId(result.stockEventId, tenantId);
    if (requestId !== parsed.requestId) throw new ReturnStockFormError("返品申請IDが一致しません");
  } catch (error) {
    return { error: safeError(error) };
  }
  revalidatePath("/returns");
  revalidatePath("/returns/" + requestId);
  revalidatePath("/items");
  redirect("/returns/" + requestId);
}
