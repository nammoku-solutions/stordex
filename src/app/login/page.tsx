"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") || "/dashboard";
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", {
      tenantSlug,
      email,
      password,
      redirect: false,
      callbackUrl,
    });
    setBusy(false);
    if (!res || res.error) {
      setError("テナント・メール・パスワードをご確認ください");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

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
