"use client";

import { useState } from "react";
import Link from "next/link";

type Issue = { row: number; field: string; message: string };
type Report = {
  ok: boolean;
  rowCount: number;
  documentCount: number;
  lineCount: number;
  sourceTotals: { subtotal: number; tax: number; total: number; received: number };
  errors: Issue[];
  warnings: Issue[];
  message: string;
};

export function PurchaseOrderPreflightClient() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onCheck() {
    setReport(null);
    setError(null);
    if (!file) return setError("仕入発注CSVファイルを選択してください");
    if (file.size > 2 * 1024 * 1024) return setError("2MB以内のCSVを選択してください");
    const form = new FormData();
    form.set("file", file);
    setBusy(true);
    try {
      const response = await fetch("/api/import/purchase-orders/preflight", {
        method: "POST", body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "検証に失敗しました");
      setReport(data as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "検証に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <div className="text-sm text-slate-700">
          <strong>操作方法：</strong>「CSV エクスポート」から「仕入発注と過去履歴」をダウンロードし、
          そのCSVをここで選択して「検証する」を押してください。
          <strong>この画面は読み取り・検証専用です。</strong>
          仕入発注、入荷数、在庫は追加・更新されません。
        </div>
        <Link href="/settings/export" className="btn-secondary inline-flex">
          仕入発注CSVをダウンロードする
        </Link>
        <div>
          <label htmlFor="purchase-order-csv" className="label">仕入発注CSVファイル（2MB以内・UTF-8）</label>
          <input id="purchase-order-csv" type="file" accept=".csv,text/csv" className="input"
            disabled={busy}
            onChange={event => {
              setFile(event.target.files?.[0] ?? null);
              setReport(null);
              setError(null);
            }} />
        </div>
        <button type="button" className="btn-primary" disabled={busy || !file} onClick={onCheck}>
          {busy ? "CSVを検証中…" : "CSVを検証する（書き込みなし）"}
        </button>
      </div>
      {error && <p className="card p-4 text-red-700" role="alert">{error}</p>}
      {report && (
        <div className="card p-5 space-y-4" aria-live="polite">
          <p className={report.ok ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
            {report.ok ? "形式検証 PASS" : "形式検証 FAIL"} — {report.message}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-slate-500">CSV明細行</dt><dd className="font-semibold">{report.rowCount}</dd></div>
            <div><dt className="text-slate-500">発注伝票</dt><dd className="font-semibold">{report.documentCount}</dd></div>
            <div><dt className="text-slate-500">有効な明細</dt><dd className="font-semibold">{report.lineCount}</dd></div>
            <div><dt className="text-slate-500">入荷済合計（個）</dt><dd className="font-semibold">{report.sourceTotals.received}</dd></div>
          </dl>
          {report.ok && (
            <p className="text-sm text-amber-800">
              このPASSはCSV形式と伝票内金額の整合性だけを示します。仕入先・商品の照合、
              在庫履歴との一致、移行先での復元可能性はまだ保証していません。
            </p>
          )}
          {report.errors.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold text-red-700">エラー（最大50件表示）</h2>
              <ul className="list-disc pl-6 text-sm space-y-1">
                {report.errors.map((issue, i) => <li key={i}>
                  {issue.row}行目・{issue.field}: {issue.message}
                </li>)}
              </ul>
            </section>
          )}
          {report.warnings.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold text-amber-800">要確認（最大50件表示）</h2>
              <ul className="list-disc pl-6 text-sm space-y-1">
                {report.warnings.map((issue, i) => <li key={i}>
                  {issue.row}行目・{issue.field}: {issue.message}
                </li>)}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
