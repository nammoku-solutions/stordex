"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";

const Schema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["INBOUND", "OUTBOUND", "ADJUSTMENT"]),
  quantity: z.coerce.number().int().min(1),
  reference: z.string().max(80).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export async function recordMovement(formData: FormData) {
  const { tenantId, userId } = await requireTenant();
  const obj = Object.fromEntries(formData.entries()) as Record<string, string>;
  const data = Schema.parse({
    itemId: obj.itemId,
    type: obj.type,
    quantity: obj.quantity,
    reference: obj.reference || null,
    note: obj.note || null,
  });

  await prisma.$transaction(async (tx) => {
    const item = await tx.item.findFirst({
      where: { id: data.itemId, tenantId },
    });
    if (!item) throw new Error("商品が見つかりません");

    let newStock: number;
    if (data.type === "INBOUND") newStock = item.stock + data.quantity;
    else if (data.type === "OUTBOUND") newStock = item.stock - data.quantity;
    else newStock = data.quantity; // ADJUSTMENT: set absolute count

    await tx.item.update({
      where: { id: item.id },
      data: { stock: newStock },
    });

    await tx.inventoryMovement.create({
      data: {
        tenantId,
        itemId: item.id,
        type: data.type,
        quantity: data.type === "ADJUSTMENT" ? data.quantity - item.stock : data.quantity,
        balance: newStock,
        reference: data.reference,
        note: data.note,
        createdBy: userId,
      },
    });
  });

  revalidatePath("/inventory");
  revalidatePath("/items");
  revalidatePath("/dashboard");
}
