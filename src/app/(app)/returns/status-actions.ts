"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/session";
import { b2bReturnStatusReconcileEnabled } from "@/lib/b2b-return-status-reconcile-feature";
import {
  recordPhysicalReturnStatus, B2BReturnStatusWriteError,
} from "@/lib/b2b-return-status-service";
import { B2BReturnTransitionError } from "@/lib/b2b-return-transition";
import { ReturnProgressError } from "@/lib/b2b-return-progress";
import {
  parseReturnStatusReconcileForm, ReturnStatusReconcileFormError,
} from "@/lib/b2b-return-status-reconcile-form";

export type ReturnStatusFormState = { error: string | null };
const DISABLED = "返品ステータスの同期機能は現在無効です。";
const DENIED = "このステータス変更には所属企業の管理者権限が必要です。";

function safeError(error: unknown): string {
  if (error instanceof B2BReturnStatusWriteError ||
      error instanceof B2BReturnTransitionError ||
      error instanceof ReturnProgressError ||
      error instanceof ReturnStatusReconcileFormError) {
    return error.message;
  }
  return "ステータス同期に失敗しました。画面を更新し、履歴を確認してから再度お試しください。";
}

/**
 * An explicit manual reconciliation command, never triggered during render.
 * Auth/role, source states and physical event evidence are revalidated by
 * the internal SERIALIZABLE service, and the DB trigger enforces append-only.
 */
export async function reconcilePhysicalReturnStatusForm(
  _previous: ReturnStatusFormState,
  formData: FormData,
): Promise<ReturnStatusFormState> {
  if (!b2bReturnStatusReconcileEnabled()) return { error: DISABLED };
  const { tenantId, userId, role } = await requireTenant();
  if (role !== "OWNER" && role !== "ADMIN") return { error: DENIED };
  let requestId: string;
  try {
    const input = parseReturnStatusReconcileForm(formData);
    requestId = input.returnRequestId;
    await recordPhysicalReturnStatus({
      tenantId, userId,
      returnRequestId: input.returnRequestId,
      eventId: input.eventId,
      expectedStatus: input.expectedStatus,
      targetStatus: input.targetStatus,
    });
  } catch (error) {
    return { error: safeError(error) };
  }
  revalidatePath("/returns");
  revalidatePath("/returns/" + requestId);
  redirect("/returns/" + requestId);
}
