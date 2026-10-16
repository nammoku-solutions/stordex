"use client";

import { useMemo, useState } from "react";
import type { ImportTarget } from "@/generated/prisma/client";
import type { FieldDef } from "@/lib/csv/schema";
import type { BuiltInPreset } from "@/lib/csv/presets";

interface Props {
  fieldsByTarget: Record<ImportTarget, FieldDef[]>;
  presetsByTarget: Record<ImportTarget, BuiltInPreset[]>;
}

const TARGET_LABEL: Record<ImportTarget, string> = {
  ITEM: "商品マスタ",
  CUSTOMER: "得意先",
  SUPPLIER: "仕入先",
  ORDER: "受注",
};

const TARGETS: ImportTarget[] = ["ITEM", "CUSTOMER", "SUPPLIER", "ORDER"];

interface PreviewState {
  headers: string[];
  sample: string[][];
  totalRows: number;
  encoding: string;
}

interface RunResult {
  ok: boolean;
  jobId: string;
  status: string;
  result: {
    rowCount: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    errors: { row: number; reason: string; raw: string[] }[];
    samples: any[];
    hasErrorCsv: boolean;
  };
}

export function ImportClient({ fieldsByTarget, presetsByTarget }: Props) {
  const [target, setTarget] = useState<ImportTarget>("ITEM");
  const [file, setFile] = useState<File | null>(null);
  const [encoding, setEncoding] = useState<"auto" | "utf-8" | "shift_jis">("auto");
  const [delimiter, setDelimiter] = useState<"," | "\t" | ";">(",");
  const [headerRow, setHeaderRow] = useState(0);
  const [upsertMode, setUpsertMode] = useState<"skip" | "update">("update");
  const [presetKey, setPresetKey] = useState<string>("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fields = fieldsByTarget[target];
  const presets = presetsByTarget[target];

  const buildForm = (mode: "preview" | "dryrun" | "commit") => {
    const fd = new FormData();
    if (file) fd.append("file", file);
    fd.append("target", target);
    fd.append("mode", mode);
    fd.append("encoding", encoding);
    fd.append("delimiter", delimiter);
    fd.append("headerRow", String(headerRow));
    fd.append("upsertMode", upsertMode);
    fd.append("mapping", JSON.stringify(mapping));
    return fd;
  };

  async function onPreview() {
    if (!file) {
      setErr("CSV ファイルを選択してください");
      return;
    }
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await fetch("/api/import", { method: "POST", body: buildForm("preview") });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "preview に失敗");
      setPreview({
        headers: j.headers,
        sample: j.sample,
        totalRows: j.totalRows,
        encoding: j.encoding,
      });
      // プリセット指定ありならそのマッピングを初期値に、なければ autoMap を
      if (presetKey) {
        const p = presets.find((p) => p.key === presetKey);
        if (p && Object.keys(p.mapping).length > 0) {
          setMapping({ ...p.mapping });
        } else {
          setMapping({ ...j.autoMap });
        }
      } else {
        setMapping({ ...j.autoMap });
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onRun(mode: "dryrun" | "commit") {
    if (!file) return;
    if (mode === "commit" && !confirm("本番取込します。よろしいですか？")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/import", { method: "POST", body: buildForm(mode) });
      const j = (await r.json()) as RunResult & { error?: string };
      // A failed preflight contains per-row diagnostics and no DB writes.
      // Show those details instead of hiding them behind a generic alert.
      if (!r.ok && j.result) {
        setResult(j);
        setErr(j.error ?? "取り込み前の検証に失敗しました");
        return;
      }
      if (!r.ok) throw new Error(j.error ?? "取り込みに失敗しました");
      setResult(j);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function applyPreset(key: string) {
    setPresetKey(key);
    if (!key) return;
    const p = presets.find((p) => p.key === key);
    if (!p) return;
    setEncoding(p.encoding === "shift_jis" ? "shift_jis" : p.encoding === "utf-8" ? "utf-8" : "auto");
    setDelimiter(p.delimiter as any);
    setHeaderRow(p.headerRow);
    setUpsertMode(p.upsertMode);
    if (Object.keys(p.mapping).length > 0) setMapping({ ...p.mapping });
  }

  const headerOptions = preview?.headers ?? [];

  return (
    <div className="space-y-6">
      {/* ターゲット選択タブ */}
      <div className="flex gap-2 border-b">
        {TARGETS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTarget(t);
              setPreview(null);
              setMapping({});
              setResult(null);
              setPresetKey("");
            }}
            className={`px-4 py-2 text-sm ${
              target === t
                ? "border-b-2 border-blue-600 font-bold text-blue-700"
                : "text-slate-500"
            }`}
          >
            {TARGET_LABEL[t]}
          </button>
        ))}
      </div>

      {/* ファイル選択 + パース設定 */}
      <div className="card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">CSV ファイル</label>
            <input
              type="file"
              accept=".csv,.txt,text/csv"
              className="input"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <label className="label">プリセット</label>
            <select
              className="input"
              value={presetKey}
              onChange={(e) => applyPreset(e.target.value)}
            >
              <option value="">(なし／汎用 自動推測)</option>
              {presets.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">文字コード</label>
            <select
              className="input"
              value={encoding}
              onChange={(e) => setEncoding(e.target.value as any)}
            >
              <option value="auto">自動判定</option>
              <option value="utf-8">UTF-8</option>
              <option value="shift_jis">Shift_JIS / CP932</option>
            </select>
          </div>
          <div>
            <label className="label">区切り文字</label>
            <select
              className="input"
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value as any)}
            >
              <option value=",">カンマ ,</option>
              <option value={"\t"}>タブ</option>
              <option value=";">セミコロン ;</option>
            </select>
          </div>
          <div>
            <label className="label">ヘッダ行 (0始まり)</label>
            <input
              type="number"
              min={0}
              className="input"
              value={headerRow}
              onChange={(e) => setHeaderRow(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div>
            <label className="label">同コードが既にある場合</label>
            <select
              className="input"
              value={upsertMode}
              onChange={(e) => setUpsertMode(e.target.value as any)}
            >
              <option value="skip">スキップ</option>
              <option value="update">更新</option>
            </select>
          </div>
        </div>
        <div>
          <button onClick={onPreview} disabled={busy || !file} className="btn-primary">
            {busy ? "解析中..." : "プレビュー / 列を読み込む"}
          </button>
        </div>
      </div>

      {err && (
        <div className="card p-4 bg-red-50 border-red-200 text-red-700 text-sm">
          {err}
        </div>
      )}

      {/* プレビュー & マッピング */}
      {preview && (
        <>
          <div className="card p-6 space-y-3">
            <div className="text-sm text-slate-600">
              検出: 全 <b>{preview.totalRows}</b> 行 / 列 <b>{preview.headers.length}</b> /{" "}
              文字コード <b>{preview.encoding}</b>
            </div>
            <div className="overflow-x-auto">
              <table className="table-auto text-xs border">
                <thead className="bg-slate-100">
                  <tr>
                    {preview.headers.map((h, i) => (
                      <th key={i} className="border px-2 py-1 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((row, i) => (
                    <tr key={i}>
                      {row.map((c, j) => (
                        <td key={j} className="border px-2 py-1 whitespace-nowrap">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-6 space-y-3">
            <h3 className="font-semibold">列マッピング</h3>
            <p className="text-xs text-slate-500">
              Stordex 内部の項目に CSV のどの列を当てるか設定します。
              <span className="text-red-500">*</span> は必須。
            </p>
            <div className="grid grid-cols-2 gap-3">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <label className="w-32 text-sm">
                    {f.label}
                    {f.required && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    className="input flex-1"
                    value={mapping[f.key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [f.key]: e.target.value }))
                    }
                  >
                    <option value="">(対応なし)</option>
                    {headerOptions.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => onRun("dryrun")} disabled={busy} className="btn-secondary">
                {busy ? "..." : "ドライラン (検証のみ)"}
              </button>
              <button onClick={() => onRun("commit")} disabled={busy} className="btn-primary">
                {busy ? "..." : "本番取込"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 結果 */}
      {result && (
        <div className="card p-6 space-y-2">
          <h3 className="font-semibold">
            {result.status} —{" "}
            {result.ok ? (
              <span className="text-green-700">エラーなし</span>
            ) : (
              <span className="text-red-700">エラーあり</span>
            )}
          </h3>
          <div className="grid grid-cols-5 gap-3 text-center text-sm">
            <Metric label="行数" value={result.result.rowCount} />
            <Metric label="新規" value={result.result.createdCount} color="text-blue-700" />
            <Metric label="更新" value={result.result.updatedCount} color="text-amber-700" />
            <Metric label="スキップ" value={result.result.skippedCount} color="text-slate-500" />
            <Metric label="エラー" value={result.result.errorCount} color="text-red-700" />
          </div>
          {result.result.errors.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-sm font-semibold">
                エラー (先頭 {result.result.errors.length} 件)
              </div>
              <div className="max-h-64 overflow-y-auto border rounded p-2 text-xs space-y-1">
                {result.result.errors.map((e, i) => (
                  <div key={i}>
                    <span className="text-slate-500">行 {e.row}:</span> {e.reason}
                  </div>
                ))}
              </div>
              {result.result.hasErrorCsv && (
                <a
                  href={`/api/import/jobs/${result.jobId}/errors`}
                  className="btn-secondary inline-block mt-2"
                >
                  エラー行を CSV でダウンロード
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${color ?? ""}`}>{value}</div>
    </div>
  );
}
