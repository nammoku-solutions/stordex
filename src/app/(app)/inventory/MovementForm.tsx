"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordMovement } from "./actions";
import { ButtonPendingContent } from "@/components/ButtonPendingContent";

type Item = { id: string; code: string; name: string; unit: string; stock: number };
type MovementType = "INBOUND" | "OUTBOUND" | "ADJUSTMENT";

export function MovementForm({ items }: { items: Item[] }) {
  const [type, setType] = useState<MovementType>("INBOUND");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      id="movement-form"
      className="space-y-4"
      action={(fd) => {
        setError(null);
        setSuccess(null);
        start(async () => {
          try {
            const result = await recordMovement(fd);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            const form = document.getElementById("movement-form") as HTMLFormElement | null;
            form?.reset();
            setType("INBOUND");
            setSuccess("入出庫を記録しました");
            router.refresh();
          } catch {
            setError("通信またはサーバーで問題が発生しました。再読み込みしてから再試行してください");
          }
        });
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">区分</label>
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as MovementType)}
            className="input"
            disabled={pending}
          >
            <option value="INBOUND">入庫（仕入・返品受入）</option>
            <option value="OUTBOUND">出庫（出荷・廃棄）</option>
            <option value="ADJUSTMENT">調整（棚卸し）</option>
          </select>
        </div>
        <div>
          <label className="label">商品 *</label>
          <select name="itemId" required className="input" disabled={pending}>
            <option value="">選択してください</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} {item.name}（在庫{item.stock}）
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
            step="1"
            min={type === "ADJUSTMENT" ? 0 : 1}
            max={2147483647}
            disabled={pending}
            className="input"
          />
        </div>
        <div>
          <label className="label">参照（伝票番号など）</label>
          <input name="reference" className="input" maxLength={80} disabled={pending} />
        </div>
        <div className="md:col-span-2">
          <label className="label">備考</label>
          <input name="note" className="input" maxLength={500} disabled={pending} />
        </div>
      </div>
      {type === "ADJUSTMENT" && (
        <p className="text-xs text-slate-600">
          棚卸後の実際の在庫数を入力してください。0個も登録できます。
          商品の削除を目的として在庫数を変更しないでください。
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        <ButtonPendingContent pending={pending} pendingText="登録中…">記録する</ButtonPendingContent>
      </button>
    </form>
  );
}
