"use client";

import { useMemo, useState } from "react";
import { SubmitPendingButton } from "@/components/SubmitPendingButton";

type Item = {
  id: string;
  code: string;
  name: string;
  unit: string;
  costPrice: number;
  supplierId: string | null;
};
type Supplier = { id: string; code: string; name: string };

type Line = {
  key: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export function PurchaseOrderForm({
  action,
  suppliers,
  items,
}: {
  action: (formData: FormData) => Promise<void>;
  suppliers: Supplier[];
  items: Item[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [taxRate, setTaxRate] = useState(10);
  const [lines, setLines] = useState<Line[]>([]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const filteredItems = useMemo(
    () => items.filter((i) => !i.supplierId || i.supplierId === supplierId),
    [items, supplierId]
  );

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const tax = Math.floor((subtotal * taxRate) / 100);
  const total = subtotal + tax;

  function addLine() {
    setLines((p) => [
      ...p,
      { key: uid(), itemId: "", itemName: "", unit: "個", quantity: 1, unitPrice: 0 },
    ]);
  }
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
            next.unitPrice = it.costPrice;
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
          .filter((l) => l.itemId && l.quantity > 0)
          .map((l) => ({
            itemId: l.itemId,
            itemName: l.itemName,
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
          <label className="label">仕入先 *</label>
          <select
            name="supplierId"
            required
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              setLines([]);
            }}
            className="input"
          >
            <option value="">選択してください</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.code} {s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">発注日 *</label>
          <input type="date" name="orderDate" required defaultValue={today} className="input" />
        </div>
        <div>
          <label className="label">引取予定日</label>
          <input type="date" name="pickupDate" className="input" />
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
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">明細</h2>
          <button type="button" onClick={addLine} className="btn-secondary" disabled={!supplierId}>
            ＋ 行追加
          </button>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>商品 *</th>
                <th className="text-right" style={{ width: 100 }}>数量</th>
                <th style={{ width: 70 }}>単位</th>
                <th className="text-right" style={{ width: 130 }}>仕入単価</th>
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
                      required
                    >
                      <option value="">選択</option>
                      {filteredItems.map((i) => (
                        <option key={i.id} value={i.id}>{i.code} {i.name}</option>
                      ))}
                    </select>
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
                      onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                      className="text-red-600 text-sm hover:underline"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-6">
                    {supplierId ? "「行追加」で明細を入力してください" : "先に仕入先を選択してください"}
                  </td>
                </tr>
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} className="text-right font-medium">小計</td>
                  <td className="text-right">¥{subtotal.toLocaleString("ja-JP")}</td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={4} className="text-right font-medium">消費税</td>
                  <td className="text-right">¥{tax.toLocaleString("ja-JP")}</td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={4} className="text-right font-bold text-lg">合計</td>
                  <td className="text-right font-bold text-lg">¥{total.toLocaleString("ja-JP")}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="card p-6">
        <label className="label">備考</label>
        <textarea name="note" rows={3} className="input" />
      </div>

      <div className="flex gap-3">
        <SubmitPendingButton disabled={lines.length === 0} pendingText="発注書を登録しています…">
          発注書を登録
        </SubmitPendingButton>
        <a href="/purchase-orders" className="btn-secondary">キャンセル</a>
      </div>
    </form>
  );
}
