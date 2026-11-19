"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { EvidenceSummary } from "@/lib/b2b-credit-evidence-http";

const labels = {
  PENDING: "審査待ち", VERIFIED: "確認済み", REJECTED: "却下", REVOKED: "取り消し済み",
  UNAVAILABLE: "元請求書が変更済み、または審査対象外",
};
const requestHeader = { "x-stordex-evidence-request": "1" };

export function InvoiceEvidencePanel({ invoiceId, canSubmit }: { invoiceId: string; canSubmit: boolean }) {
  const endpoint = `/api/invoices/${encodeURIComponent(invoiceId)}/evidence`;
  const [entries, setEntries] = useState<EvidenceSummary[] | null>(null);
  const [selection, setSelection] = useState<{ id: string; ticket: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const lastCommand = useRef<{ key: string; eventId: string } | null>(null);

  async function refresh() {
    const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("List unavailable");
    setEntries((await response.json()).entries);
  }
  async function run(task: () => Promise<void>, failure: string) {
    setBusy(true);
    setNotice("");
    setError("");
    try { await task(); }
    catch { setError(failure); }
    finally { setBusy(false); }
  }
  function command(input: object) {
    return fetch(endpoint, { method: "POST", credentials: "same-origin", headers: {
      ...requestHeader, "Content-Type": "application/json",
    }, body: JSON.stringify(input) });
  }
  async function updateList(message: string) {
    setSelection(null);
    setNotice(message);
    try { await refresh(); }
    catch { setEntries(null); setError("一覧を更新できませんでした。もう一度、一覧を読み込んでください。"); }
  }

  function submitPdf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("pdf");
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) {
      setError("10 MB 以下の PDF を選んでください。");
      return;
    }
    form.reset();
    void run(async () => {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin",
        headers: { ...requestHeader, "Content-Type": "application/pdf" }, body: file });
      if (response.status === 202) {
        await updateList("提出結果を確認中です。同じ PDF は再提出せず、運用担当者へ確認してください。");
      } else if (response.status === 201) {
        await updateList("証拠を提出しました。別の審査担当者で確認してください。");
      } else if (response.status === 422) {
        setError("PDF を受け付けられませんでした。ファイルと提出権限を確認してください。");
      } else throw new Error("Upload response unavailable");
    }, "提出結果を確認できませんでした。再提出する前に、一覧と運用担当者への確認をお願いします。");
  }

  function download(id: string) {
    setSelection(null);
    void run(async () => {
      const response = await command({ operation: "download", evidenceId: id });
      const ticket = response.headers.get("x-stordex-review-ticket");
      if (!response.ok || !ticket || response.headers.get("content-type") !== "application/pdf") {
        throw new Error("PDF unavailable");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "stordex-original-invoice.pdf";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setSelection({ id, ticket });
      setNotice("保存した PDF を開いて確認してください。審査入力はダウンロードから15分間有効です。");
    }, "PDF を取得できませんでした。審査状況や権限を確認し、一覧を読み直してください。");
  }
  function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection) return;
    const data = new FormData(event.currentTarget);
    const form = {
      evidenceId: selection.id,
      reason: String(data.get("reason") ?? "").trim(),
      ...(selection.ticket ? {
        operation: "decide",
        reviewTicket: selection.ticket,
        decision: String(data.get("decision") ?? ""),
        observation: { originalInvoiceNumber: String(data.get("invoiceNumber") ?? ""),
          explicitCurrency: String(data.get("currency") ?? ""), inspectedOriginal: data.get("inspected") === "on" },
      } : { operation: "revoke" }),
    };
    if (form.reason.length < 8) {
      setError("理由は8文字以上で入力してください。");
      return;
    }
    // Repeat the same event ID if its outcome was not acknowledged. Never retry automatically.
    const key = JSON.stringify(form);
    if (lastCommand.current?.key !== key) lastCommand.current = { key, eventId: crypto.randomUUID() };
    const eventId = lastCommand.current.eventId;
    void run(async () => {
      const response = await command({ ...form, eventId });
      if (!response.ok) throw new Error("Decision not acknowledged");
      lastCommand.current = null;
      await updateList(form.operation === "revoke" ? "確認を取り消しました。過去の履歴は残ります。" : "審査結果を記録しました。");
    }, "記録結果を確認できませんでした。入力内容と最新の審査状況を確認してください。");
  }

  function field(label: string, control: ReactNode) {
    return <label className="grid gap-1 text-sm">{label}{control}</label>;
  }

  return (
    <section className="card mb-5 space-y-4 p-5" aria-label="原本請求書の証拠審査">
      <div>
        <h2 className="font-semibold">原本請求書の証拠審査</h2>
        <p className="mt-1 text-sm text-slate-600">Staging 検証用です。ここでの審査は CreditNote の承認や発行ではありません。</p>
      </div>
      {canSubmit && (
        <form method="post" onSubmit={submitPdf} className="flex flex-wrap items-end gap-3">
          {field("原本 PDF（最大10 MB）", <input name="pdf" type="file" accept="application/pdf,.pdf" required disabled={busy} />)}
          <button type="submit" className="btn-primary" disabled={busy}>証拠を提出</button>
        </form>
      )}
      <div>
        <button type="button" className="btn-secondary" disabled={busy}
          onClick={() => void run(refresh, "証拠の一覧を取得できませんでした。")}>証拠の一覧を読み込む</button>
        {entries?.length === 0 && <p className="mt-2 text-sm">この請求書に提出された証拠はありません。</p>}
        {entries && entries.length > 0 && (
          <ul className="mt-3 divide-y" aria-label="証拠の一覧">
            {entries.map(entry => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div><span className="font-medium">{labels[entry.state]}</span>
                  <div className="break-all font-mono text-xs text-slate-600">{entry.id}</div></div>
                {entry.canReview && <button type="button" className="btn-secondary" disabled={busy}
                  onClick={() => download(entry.id)}>原本を取得して審査</button>}
                {entry.canRevoke && <button type="button" className="btn-secondary" disabled={busy}
                  onClick={() => { setSelection({ id: entry.id, ticket: null }); setError(""); setNotice(""); }}>確認を取り消す</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {selection && (
        <form method="post" key={selection.id + String(!!selection.ticket)} onSubmit={submitDecision} className="grid max-w-lg gap-3 border-t pt-4">
          <h3 className="font-medium">{selection.ticket ? "審査結果を記録" : "取り消し理由を記録"}</h3>
          <p className="break-all font-mono text-xs text-slate-600">{selection.id}</p>
          {selection.ticket && <>
            {field("審査結果", <select name="decision" className="input" required>
              <option value="">選択してください</option><option value="VERIFIED">JPY と請求書番号を確認</option><option value="REJECTED">却下</option>
            </select>)}
            {field("原本に記載された請求書番号", <input name="invoiceNumber" className="input" maxLength={128} />)}
            {field("原本に記載された通貨コード", <input name="currency" className="input" maxLength={12} />)}
            <label className="flex items-center gap-2 text-sm"><input name="inspected" type="checkbox" required />取得した原本 PDF を開いて確認しました</label>
          </>}
          {field("理由（8〜500文字）", <textarea name="reason" className="input" minLength={8} maxLength={500} required />)}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>{selection.ticket ? "審査を記録" : "取り消しを記録"}</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setSelection(null)}>閉じる</button>
          </div>
        </form>
      )}
      {(busy || notice) && <p role="status" className="text-sm">{busy ? "処理しています…" : notice}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
