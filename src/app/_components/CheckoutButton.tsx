"use client";

import { useState } from "react";

export default function CheckoutButton() {
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, companyName }),
      });
      const j = await res.json();
      if (!res.ok || !j.url) {
        setError(j.error ?? "決済開始に失敗しました");
        setBusy(false);
        return;
      }
      window.location.href = j.url; // Stripe Checkout に遷移
    } catch {
      setError("通信エラー");
      setBusy(false);
    }
  }

  if (!show) {
    return (
      <button onClick={() => setShow(true)} className="btn-primary">
        お申し込み（オンライン決済）
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
      className="space-y-3 text-left bg-white border rounded-lg p-5 w-full max-w-md mx-auto"
    >
      <h2 className="font-semibold">お申し込み情報</h2>
      <div>
        <label className="label">会社名</label>
        <input
          className="input"
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
      </div>
      <div>
        <label className="label">ご担当者メールアドレス</label>
        <input
          className="input"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "決済画面へ移動中..." : "Stripe で決済へ進む"}
      </button>
      <p className="text-xs text-slate-500">
        決済完了後、ご登録メール宛に招待 URL を送付します。
      </p>
    </form>
  );
}
