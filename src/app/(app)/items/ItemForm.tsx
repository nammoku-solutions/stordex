import type { Item, Supplier } from "@prisma/client";
import { SubmitButton } from "@/components/SubmitButton";

export function ItemForm({
  action,
  initial,
  suppliers,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: Partial<Item>;
  suppliers: Pick<Supplier, "id" | "name" | "code">[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="card p-6 space-y-5 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">商品コード *</label>
          <input
            name="code"
            required
            maxLength={40}
            defaultValue={initial?.code ?? ""}
            className="input font-mono"
          />
        </div>
        <div>
          <label className="label">商品名 *</label>
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={initial?.name ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label">フリガナ</label>
          <input name="nameKana" defaultValue={initial?.nameKana ?? ""} className="input" />
        </div>
        <div>
          <label className="label">単位</label>
          <input name="unit" defaultValue={initial?.unit ?? "個"} className="input" />
        </div>
        <div>
          <label className="label">仕入先</label>
          <select
            name="supplierId"
            defaultValue={initial?.supplierId ?? ""}
            className="input"
          >
            <option value="">（未指定）</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">カテゴリ</label>
          <input name="category" defaultValue={initial?.category ?? ""} className="input" />
        </div>
        <div>
          <label className="label">発注点（在庫アラート閾値）</label>
          <input
            name="reorderPoint"
            type="number"
            min={0}
            defaultValue={initial?.reorderPoint ?? 0}
            className="input"
          />
        </div>
        <div></div>
        <div>
          <label className="label">仕入単価（円）</label>
          <input
            name="costPrice"
            type="number"
            min={0}
            defaultValue={initial?.costPrice ?? 0}
            className="input"
          />
        </div>
        <div>
          <label className="label">販売単価（円）</label>
          <input
            name="salesPrice"
            type="number"
            min={0}
            defaultValue={initial?.salesPrice ?? 0}
            className="input"
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">備考</label>
          <textarea name="note" rows={3} defaultValue={initial?.note ?? ""} className="input" />
        </div>
      </div>
      {initial?.id && (
        <p className="text-xs text-slate-500">
          ※在庫数量は「在庫管理」画面から入出庫処理で変更してください
        </p>
      )}
      <div className="flex gap-3 pt-2">
        <SubmitButton pendingLabel="保存中...">
          {submitLabel}
        </SubmitButton>
        <a href="/items" className="btn-secondary">
          キャンセル
        </a>
      </div>
    </form>
  );
}
