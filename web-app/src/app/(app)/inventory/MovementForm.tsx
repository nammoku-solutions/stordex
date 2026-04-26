"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordMovement } from "./actions";

type Item = { id: string; code: string; name: string; unit: string; stock: number };

export function MovementForm({ items }: { items: Item[] }) {
  const [type, setType] = useState<"INBOUND" | "OUTBOUND" | "ADJUSTMENT">("INBOUND");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      action={(fd) => {
        setError(null);
        start(async () => {
          try {
            await recordMovement(fd);
            const f = (document.getElementById("movement-form") as HTMLFormElement) || null;
            f?.reset();
            setType("INBOUND");
            router.refresh();
          } catch (e: any) {
            setError(e?.message ?? "登録に失敗しました");
          }
        });
      }}
      id="movement-form"
      className="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">区分</label>
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="input"
          >
            <option value="INBOUND">入庫（仕入・返品受入）</option>
            <option value="OUTBOUND">出庫（出荷・廃棄）</option>
            <option value="ADJUSTMENT">調整（棚卸し）</option>
          </select>
        </div>
        <div>
          <label className="label">商品 *</label>
          <select name="itemId" required className="input">
            <option value="">選択してください</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.code} {i.name}（在庫{i.stock}）
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">
            {type === "ADJUSTMENT" ? "棚卸後の数量 *" : "数量 *"}
          </label>
          <input
            type="number"
            name="quantity"
            required
            min={type === "ADJUSTMENT" ? 0 : 1}
            className="input"
          />
        </div>
        <div>
          <label className="label">参照（伝票番号など）</label>
          <input name="reference" className="input" maxLength={80} />
        </div>
        <div className="md:col-span-2">
          <label className="label">備考</label>
          <input name="note" className="input" maxLength={500} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "登録中..." : "記録する"}
      </button>
    </form>
  );
}
