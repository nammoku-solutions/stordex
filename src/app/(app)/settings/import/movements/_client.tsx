"use client";

import { useState } from "react";
import Link from "next/link";

type Issue = { file: "items" | "movements"; row: number; field: string; message: string };
type CutoverManifest = {
  format: "stordex-inventory-cutover-v1";
  manifestId: string;
  generatedAt: string;
  tenantFingerprint: string;
  source: { itemsCsvSha256: string; movementsCsvSha256: string };
  checks: {
    itemCount: number; movementCount: number; reconciledItems: number;
    unverifiedItems: number; currentStockTotal: number;
    inferredHistoricalOpeningTotal: number;
  };
  cutover: {
    status: "NOT_CONFIRMED"; atomicSnapshotVerified: false;
    businessWritesPausedVerified: false; requiresManualCutoverApproval: true;
  };
  items: {
    code: string; cutoverStock: number;
    history: "RECONCILED_LEDGER" | "CUTOVER_ONLY_NO_HISTORY";
    movementCount: number; inferredHistoricalOpening: number | null;
    lastHistoricalBalance: number | null;
  }[];
};

type Result = {
  ok: boolean;
  message: string;
  manifest: CutoverManifest | null;
  itemCount: number;
  movementCount: number;
  reconciledItems: number;
  unverifiedItems: number;
  sourceStockTotal: number;
  openingStockTotal: number;
  errors: Issue[];
  warnings: Issue[];
};

export function InventoryLedgerPreflightClient() {
  const [items, setItems] = useState<File | null>(null);
  const [movements, setMovements] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function downloadManifest(manifest: CutoverManifest) {
    const blob = new Blob([JSON.stringify(manifest, null, 2) + "\n"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stordex-cutover-" + manifest.manifestId.slice(0, 12) + ".json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function runCheck() {
    setResult(null);
    setError(null);
    if (!items || !movements) {
      setError("2つのCSVファイルを選択してください");
      return;
    }
    if (items.size > 2 * 1024 * 1024 || movements.size > 2 * 1024 * 1024) {
      setError("CSVファイルはそれぞれ2MB以内にしてください");
      return;
    }
    const body = new FormData();
    body.set("items", items);
    body.set("movements", movements);
    setBusy(true);
    try {
      const response = await fetch("/api/import/movements/preflight", {
        method: "POST", body,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "CSVの検証に失敗しました");
      setResult(payload as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSVの検証に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <p className="text-sm text-slate-700">
          「CSV エクスポート」で<strong>商品・現在庫</strong>と
          <strong>入出庫履歴</strong>をダウンロードしてください。
          ここに2ファイルを選択すると、商品の現在庫と履歴の最後の残高、
          履歴内の増減、推定開始在庫を照合できます。
        </p>
        <p className="text-sm font-semibold text-amber-800">
          検証専用です。商品・仕入発注・在庫・入出庫履歴には一切書き込みません。
          PASSしても、履歴のない商品の過去在庫や完全復元の可否は保証しません。
        </p>
        <Link href="/settings/export" className="btn-secondary inline-flex">
          必要なCSVをダウンロードする
        </Link>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ledger-items-csv">① 商品・現在庫CSV（必須）</label>
            <input id="ledger-items-csv" type="file" accept=".csv,text/csv" className="input"
              disabled={busy}
              onChange={e => { setItems(e.target.files?.[0] ?? null); setResult(null); }} />
          </div>
          <div>
            <label className="label" htmlFor="ledger-movements-csv">② 入出庫履歴CSV（必須）</label>
            <input id="ledger-movements-csv" type="file" accept=".csv,text/csv" className="input"
              disabled={busy}
              onChange={e => { setMovements(e.target.files?.[0] ?? null); setResult(null); }} />
          </div>
        </div>
        <button type="button" className="btn-primary" onClick={runCheck}
          disabled={busy || !items || !movements}>
          {busy ? "照合中…" : "在庫と入出庫履歴を照合する（書き込みなし）"}
        </button>
      </div>
      {error && <div className="card p-4 text-red-700" role="alert">{error}</div>}
      {result && (
        <div className="card p-5 space-y-4" aria-live="polite">
          <p className={result.ok ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
            {result.ok ? "照合 PASS" : "照合 FAIL"} — {result.message}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <div><dt className="text-slate-500">商品数</dt><dd className="font-semibold">{result.itemCount}</dd></div>
            <div><dt className="text-slate-500">入出庫履歴数</dt><dd className="font-semibold">{result.movementCount}</dd></div>
            <div><dt className="text-slate-500">照合済み商品</dt><dd className="font-semibold">{result.reconciledItems}</dd></div>
            <div><dt className="text-slate-500">履歴がなく未検証の商品</dt><dd className="font-semibold">{result.unverifiedItems}</dd></div>
            <div><dt className="text-slate-500">CSV現在庫の合計</dt><dd className="font-semibold">{result.sourceStockTotal}</dd></div>
            <div><dt className="text-slate-500">履歴から推定した開始在庫の合計</dt><dd className="font-semibold">{result.openingStockTotal}</dd></div>
          </dl>
          {result.ok && result.unverifiedItems > 0 &&
            <p className="text-sm text-amber-800">
              履歴のない商品があります。完全移行には、それらの商品の開始在庫の確認が必要です。
            </p>}
          {result.ok && result.manifest && (
            <section className="space-y-3 border-t border-slate-200 pt-4">
              <h2 className="font-semibold">移行時在庫の検証記録（カットオーバー候補）</h2>
              <p className="text-sm text-slate-700">
                CSVのSHA-256、商品ごとの移行時残高、履歴の有無をJSONで保存できます。
                同じCSVを再度検証した場合は同じ記録IDになります。
              </p>
              <p className="text-sm font-semibold text-amber-800">
                これは開始在庫の履歴を証明するものではありません。
                取得ファイルは同一時点のDBスナップショットと保証されておらず、
                在庫確定・移行開始・復元承認はまだ行われていません。
              </p>
              <div className="font-mono text-xs text-slate-600 break-all">
                検証記録ID：{result.manifest.manifestId}
              </div>
              <button type="button" className="btn-secondary"
                onClick={() => result.manifest && downloadManifest(result.manifest)}>
                検証記録（JSON）をダウンロード
              </button>
            </section>
          )}
          {result.errors.length > 0 &&
            <section className="space-y-1">
              <h2 className="font-semibold text-red-700">不整合（最大50件表示）</h2>
              <ul className="list-disc pl-5 text-sm">
                {result.errors.map((e,i) =>
                  <li key={i}>{e.file === "items" ? "商品CSV" : "履歴CSV"}・{e.row}行目・{e.field}：{e.message}</li>)}
              </ul>
            </section>}
          {result.warnings.length > 0 &&
            <section className="space-y-1">
              <h2 className="font-semibold text-amber-800">注意事項（最大50件表示）</h2>
              <ul className="list-disc pl-5 text-sm">
                {result.warnings.map((e,i) =>
                  <li key={i}>{e.file === "items" ? "商品CSV" : "履歴CSV"}：{e.message}</li>)}
              </ul>
            </section>}
        </div>
      )}
    </div>
  );
}
