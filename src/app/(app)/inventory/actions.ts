"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/session";
import { applyManualInventoryMovement } from "@/lib/manual-inventory-movement";
import {
  ManualInventoryError,
  parseManualInventoryInput,
} from "@/lib/manual-inventory-input";

export type RecordMovementResult =
  | { ok: true }
  | { ok: false; message: string };

export async function recordMovement(formData: FormData): Promise<RecordMovementResult> {
  const { tenantId, userId } = await requireTenant();
  try {
    const data = parseManualInventoryInput({
      itemId: formData.get("itemId"),
      type: formData.get("type"),
      quantity: formData.get("quantity"),
      reference: formData.get("reference") ?? "",
      note: formData.get("note") ?? "",
    });
    await applyManualInventoryMovement({ ...data, tenantId, userId });
  } catch (error: unknown) {
    if (error instanceof ManualInventoryError) {
      return { ok: false, message: error.message };
    }
    // A serialization conflict is a safe retry, not a reason to leak a
    // minified React Server Components exception into the form.
    if (typeof error === "object" && error !== null && "code" in error &&
        (error.code === "P2034" || error.code === "P2028")) {
      return { ok: false, message: "在庫が同時に更新されました。画面を再読み込みしてから再試行してください" };
    }
    console.error("Manual inventory update failed", error);
    return { ok: false, message: "入出庫を記録できませんでした。画面を更新して再試行してください" };
  }

  revalidatePath("/inventory");
  revalidatePath("/items");
  revalidatePath("/dashboard");
  return { ok: true };
}
