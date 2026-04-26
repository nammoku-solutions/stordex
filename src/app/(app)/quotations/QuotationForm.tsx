"use client";

import { useMemo, useState } from "react";

type Item = { id: string; code: string; name: string; unit: string; salesPrice: number };
type Customer = { id: string; code: string; name: string };

type Line = {
  key: string;
  itemId: string;
  itemName: string;
  spec: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export function QuotationForm({
  action,
  customers,
  items,
}: {
  action: (formData: FormData) => Promise<void>;
  customers: Customer[];
  items: Item[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [lines, setLines] = useState<Line[]>([
    { key: uid(), itemId: "", itemName: "", spec: "", unit: "個", quantity: 1, unitPrice: 0 },
  ]);
  const [taxRate, setTaxRate] = useState(10);

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const tax = Math.floor((subtotal * taxRate) / 100);
  const total = subtotal + tax;

  function setLine(key: string, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.itemId !== undefined && patch.itemId !== l.itemId) {
          const it = itemMap.get(patch.itemId || "");
          if (it) {
            next.itemName = it.name;
            next.unit = it.unit;
            next.unitPrice = it.salesPrice;
          }
        }
        return next;
      })
    );
  }

  function handleSubmit(formData: FormData) {
    formData.set(
      "lines",
      JSON.stringify(
        lines
          .filter((l) => l.itemName.trim() && l.quantity > 0)
          .map((l) => ({
            itemId: l.itemId || null,
            itemName: l.itemName,
            spec: l.spec || null,
            unit: l.unit,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          }))
      )
    );
    return action(formData);
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <div className="card p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="label">得意先 *</label>
          <select name="customerId" required className="input">
            <option value="">選択してください</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">状態</label>
          <select name="status" defaultValue="DRAFT" className="input">
            <option value="DRAFT">下書き</option>
            <option value="SENT">送付済</option>
          </select>
        </div>
        <div>
          <label className="label">発行日 *</label>
          <input type="date" name="issueDate" required defaultValue={today} className="input" />
        </div>
        <div>
          <label className="label">有効期限</label>
          <input type="date" name="validUntil" className="input" />
        </div>
        <div>
          <label className="label">消費税率（%）</label>
          <input
            type="number"
            name="taxRate"
            min={0}
            max={100}
            value={taxRate}
            onChange={(e) => setTaxRate(parseInt(e.target.value || "0", 10))}
            className="input"
          />
        </div>
        <div>
          <label className="label">担当者名</label>
          <input name="contactName" className="input" />
        </div>
        <div>
          <label className="label">担当者TEL</label>
          <input name="contactPhone" className="input" />
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">明細</h2>
          <button
            type="button"
            onClick={() =>
              setLines((p) => [
                ...p,
                { key: uid(), itemId: "", itemName: "", spec: "", unit: "個", quantity: 1, unitPrice: 0 },
              ])
            }
            className="btn-secondary"
          >
            ＋ 行追加
          </button>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>商品</th>
                <th>商品名 / 規格</th>
                <th className="text-right" style={{ width: 100 }}>数量</th>
                <th style={{ width: 70 }}>単位</th>
                <th className="text-right" style={{ width: 130 }}>単価</th>
                <th className="text-right" style={{ width: 130 }}>金額</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key}>
                  <td>
                    <select
                      value={l.itemId}
                      onChange={(e) => setLine(l.key, { itemId: e.target.value })}
                      className="input"
                    >
                      <option value="">手入力</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.code} {i.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={l.itemName}
                      onChange={(e) => setLine(l.key, { itemName: e.target.value })}
                      placeholder="商品名"
                      className="input"
                      required
                    />
                    <input
                      value={l.spec}
                      onChange={(e) => setLine(l.key, { spec: e.target.value })}
                      placeholder="規格（任意）"
                      className="input mt-1 text-xs"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) => setLine(l.key, { quantity: parseInt(e.target.value || "0", 10) })}
                      className="input text-right"
                    />
                  </td>
                  <td>
                    <input
                      value={l.unit}
                      onChange={(e) => setLine(l.key, { unit: e.target.value })}
                      className="input"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={l.unitPrice}
                      onChange={(e) => setLine(l.key, { unitPrice: parseInt(e.target.value || "0", 10) })}
                      className="input text-right"
                    />
                  </td>
                  <td className="text-right font-medium">
                    ¥{(l.quantity * l.unitPrice).toLocaleString("ja-JP")}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => setLines((p) => (p.length > 1 ? p.filter((x) => x.key !== l.key) : p))}
                      className="text-red-600 text-sm hover:underline"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="text-right font-medium">小計</td>
                <td className="text-right">¥{subtotal.toLocaleString("ja-JP")}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={5} className="text-right font-medium">消費税（{taxRate}%）</td>
                <td className="text-right">¥{tax.toLocaleString("ja-JP")}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={5} className="text-right font-bold text-lg">合計</td>
                <td className="text-right font-bold text-lg">¥{total.toLocaleString("ja-JP")}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="card p-6">
        <label className="label">備考</label>
        <textarea name="note" rows={3} className="input" />
      </div>

      <div className="flex gap-3">
        <button type="submit" className="btn-primary">見積書を登録</button>
        <a href="/quotations" className="btn-secondary">キャンセル</a>
      </div>
    </form>
  );
}
