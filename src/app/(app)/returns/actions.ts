"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/session";
import { b2bReturnFormsEnabled } from "@/lib/b2b-return-feature";
import {
  B2BReturnServiceError, submitB2BReturnRequest, reviewB2BReturnRequest,
} from "@/lib/b2b-return-service";
import { ReturnQuantityError } from "@/lib/b2b-return-quantity";
import { B2BReturnReviewError } from "@/lib/b2b-return-review";
import {
  B2BReturnFormError, parseReturnSubmission, parseReturnReview,
} from "@/lib/b2b-return-form";

export type ReturnFormState = { error: string | null };
const NOT_ENABLED = "返品申請・審査はまだ有効化されていません。";
function errorMessage(error: unknown): string {
  if (error instanceof B2BReturnServiceError ||
      error instanceof ReturnQuantityError ||
      error instanceof B2BReturnReviewError ||
      error instanceof B2BReturnFormError) {
    return error.message;
  }
  return "処理に失敗しました。再読み込みしてから再度お試しください。";
}
function canManage(role: string) {
  return role === "OWNER" || role === "ADMIN";
}

export async function submitB2BReturnForm(
  _state: ReturnFormState, formData: FormData,
): Promise<ReturnFormState> {
  if (!b2bReturnFormsEnabled()) return { error: NOT_ENABLED };
  const { tenantId, userId, role } = await requireTenant();
  if (!canManage(role)) return { error: "返品申請には企業の管理者権限が必要です。" };
  let requestId: string;
  try {
    const parsed = parseReturnSubmission(formData);
    const result = await submitB2BReturnRequest({
      buyerTenantId: tenantId,
      userId,
      intercompanyOrderId: parsed.companyId,
      idempotencyKey: parsed.idempotencyKey,
      lines: parsed.lines,
    });
    requestId = result.requestId;
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/returns");
  redirect("/returns/" + requestId);
}

export async function reviewB2BReturnForm(
  _state: ReturnFormState, formData: FormData,
): Promise<ReturnFormState> {
  if (!b2bReturnFormsEnabled()) return { error: NOT_ENABLED };
  const { tenantId, userId, role } = await requireTenant();
  if (!canManage(role)) return { error: "返品審査には企業の管理者権限が必要です。" };
  let requestId: string;
  try {
    const parsed = parseReturnReview(formData);
    const result = await reviewB2BReturnRequest({
      sellerTenantId: tenantId,
      userId,
      requestId: parsed.requestId,
      decisions: parsed.decisions,
      reviewNote: parsed.reviewNote,
    });
    requestId = result.requestId;
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/returns");
  revalidatePath("/returns/" + requestId);
  redirect("/returns/" + requestId);
}
