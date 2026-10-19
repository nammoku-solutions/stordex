"use client";

import { useState } from "react";
import { SubmitPendingButton } from "@/components/SubmitPendingButton";
import type { Item, Supplier } from "@/generated/prisma/client";

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
  const [stockPolicy, setStockPolicy] = useState(initial?.stockPolicy ?? "STOCKED");
  const [purchaseMode, setPurchaseMode] = useState(initial?.purchaseMode ?? "UNIT");
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
        <div className="md:col-span-2 rounded-md bg-slate-50 p-4 space-y-3">
          <h2 className="font-semibold">在庫管理方針</h2>
          <label className="label">商品区分 *</label>
          <select name="stockPolicy" className="input" value={stockPolicy}
            onChange={(e) => setStockPolicy(e.target.value as "STOCKED" | "ON_DEMAND")}>
            <option value="STOCKED">常備在庫品：最低在庫を維持する商品</option>
            <option value="ON_DEMAND">受注後仕入品：在庫を原則持たず、余剰を監視する商品</option>
          </select>
          {stockPolicy === "STOCKED" ? (
            <div>
              <label className="label">最低在庫（この数を下回ると警告）</label>
              <input name="reorderPoint" type="number" min={0}
                defaultValue={initial?.reorderPoint ?? 0} className="input" />
              <p className="text-xs text-slate-500 mt-1">0の場合は最低在庫を設定していないものとして扱います。</p>
            </div>
          ) : (
            <>
              <input type="hidden" name="reorderPoint" value={initial?.reorderPoint ?? 0} />
              <p className="text-sm text-slate-600">余剰となった実在庫をダッシュボードに表示します。通常の最低在庫アラートは出しません。</p>
            </>
          )}
        </div>
        <div className="md:col-span-2 rounded-md bg-slate-50 p-4 space-y-3">
          <h2 className="font-semibold">仕入単位</h2>
          <p className="text-xs text-slate-600">販売・在庫は上記の「単位」で計算し、仕入先の荷姿だけ別に管理します。</p>
          <label className="label">仕入方法 *</label>
          <select name="purchaseMode" className="input" value={purchaseMode}
            onChange={(e) => setPurchaseMode(e.target.value as "UNIT" | "PACK")}>
            <option value="UNIT">個別単位で仕入可能</option>
            <option value="PACK">パック・箱単位でのみ仕入可能</option>
          </select>
          {purchaseMode === "PACK" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">1パック・1箱の入数 *</label>
                <input type="number" name="caseQty" min={2} step={1} required
                  defaultValue={initial?.caseQty ?? ""} className="input" />
              </div>
              <div>
                <label className="label">仕入単位名 *</label>
                <input name="orderUnit" maxLength={20} required placeholder="パック / 箱 / ケース"
                  defaultValue={initial?.orderUnit ?? "パック"} className="input" />
              </div>
            </div>
          )}
          {purchaseMode === "UNIT" && (
            <>
              <input type="hidden" name="caseQty" value={initial?.caseQty ?? ""} />
              <input type="hidden" name="orderUnit" value={initial?.orderUnit ?? ""} />
            </>
          )}
        </div>
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
        <SubmitPendingButton pendingText={submitLabel === "更新" ? "商品を更新中…" : "商品を登録中…"}>
          {submitLabel}
        </SubmitPendingButton>
        <a href="/items" className="btn-secondary">
          キャンセル
        </a>
      </div>
    </form>
  );
}
