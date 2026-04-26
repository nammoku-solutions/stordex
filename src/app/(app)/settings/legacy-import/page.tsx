"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";

export default function LegacyImportPage() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const fd = new FormData(e.currentTarget);
      const r = await fetch("/api/migrate/legacy-xml", { method: "POST", body: fd });
      setResult(await r.json());
    } catch (err: any) {
      setResult({ ok: false, error: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="旧データ取り込み（XML）"
        description="旧 C# アプリで出力した XML（Customer/Supplier/Item/Order）をアップロードして取り込みます"
      />
      <form onSubmit={onSubmit} className="card p-6 space-y-4">
        <div>
          <label className="label">得意先 XML（Customer_data.xml）</label>
          <input type="file" name="customers" accept=".xml,text/xml" className="input" />
        </div>
        <div>
          <label className="label">仕入先 XML（Supplier_data.xml）</label>
          <input type="file" name="suppliers" accept=".xml,text/xml" className="input" />
        </div>
        <div>
          <label className="label">商品 XML（Item_data.xml）</label>
          <input type="file" name="items" accept=".xml,text/xml" className="input" />
        </div>
        <div>
          <label className="label">受注 XML（Order_data.xml）</label>
          <input type="file" name="orders" accept=".xml,text/xml" className="input" />
        </div>
        <div className="text-xs text-slate-500">
          ※ 得意先/仕入先/商品 → 受注 の順で取り込まれます。同じコードのものは重複作成されません。
        </div>
        <button disabled={submitting} className="btn-primary">
          {submitting ? "取込中..." : "取り込む"}
        </button>
      </form>

      {result && (
        <pre className="card p-4 mt-4 text-sm whitespace-pre-wrap">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </>
  );
}
