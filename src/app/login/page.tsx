"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";

function LoginForm() {
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") || "/dashboard";
  // next-auth が ?error=... を URL に付けてリダイレクトしてくる
  const urlError = sp.get("error");
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  function errorMessage(code: string | null): string | null {
    if (!code) return null;
    if (code === "SUSPENDED") {
      return "本アカウントは現在停止中です（ご請求未入金の可能性）。経理ご担当者様に振込状況をご確認の上、support@nammoku-solutions.com までご連絡ください。";
    }
    if (code === "TERMINATED") {
      return "本アカウントは解約済みのためログインできません。再開をご希望の場合は support@nammoku-solutions.com までご連絡ください。";
    }
    return "テナント・メール・パスワードをご確認ください";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // redirect: true で next-auth に完全制御を任せる。
    //   - 成功時: callbackUrl へフルページ遷移（Cookie が確実にセットされた状態）
    //   - 失敗時: /login?error=... へリダイレクト → 再マウントされ busy=false に戻り、URL の error を表示
    // これにより「ログイン → ログイン中 → ログイン」のチラつきを防ぐ。
    await signIn("credentials", {
      tenantSlug,
      email,
      password,
      redirect: true,
      callbackUrl,
    });
    // ここに到達することは通常ない（signIn が画面遷移を発火するため）
  }

  const error = errorMessage(urlError);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Stordex ログイン</h1>
          <p className="text-sm text-slate-500 mt-1">受発注・在庫管理システム</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">テナントID</label>
            <input
              className="input"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              required
              placeholder="例: nanki"
              autoComplete="organization"
              disabled={busy}
            />
          </div>
          <div>
            <label className="label">メールアドレス</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={busy}
            />
          </div>
          <div>
            <label className="label">パスワード</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={busy}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "ログイン中..." : "ログイン"}
          </button>
        </form>
        <p className="text-sm text-slate-500 text-center">
          初めての方は{" "}
          <Link href="/signup" className="text-brand-600 hover:underline">
            新規テナント登録
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
