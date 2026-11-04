import { z } from "zod";

export const MAX_INVENTORY_STOCK = 2_147_483_647;

export class ManualInventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualInventoryError";
  }
}

const schema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["INBOUND", "OUTBOUND", "ADJUSTMENT"]),
  // Explicit string parsing: z.coerce.number() would silently treat "" as zero.
  quantity: z.string().regex(/^(0|[1-9][0-9]*)$/)
    .transform(Number)
    .pipe(z.number().int().max(MAX_INVENTORY_STOCK)),
  reference: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
});

export type ManualInventoryInput = {
  itemId: string;
  type: "INBOUND" | "OUTBOUND" | "ADJUSTMENT";
  quantity: number;
  reference: string | null;
  note: string | null;
};

/** A physical inventory count may legitimately be zero; movements may not. */
export function parseManualInventoryInput(input: Record<string, unknown>): ManualInventoryInput {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ManualInventoryError(
      "商品・区分・数量を確認してください。数量は0以上の整数で、入庫・出庫は1以上が必要です",
    );
  }
  if (result.data.type !== "ADJUSTMENT" && result.data.quantity === 0) {
    throw new ManualInventoryError("入庫・出庫の数量は1以上を入力してください");
  }
  return {
    itemId: result.data.itemId,
    type: result.data.type,
    quantity: result.data.quantity,
    reference: result.data.reference?.trim() || null,
    note: result.data.note?.trim() || null,
  };
}
