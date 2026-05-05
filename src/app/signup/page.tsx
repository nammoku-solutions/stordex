"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [form, setForm] = useState({
    tenantName: "",
    tenantSlug: "",
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // --- トークン無し: 申込ページとして案内のみ表示 ---
  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
        <div className="card w-full max-w-lg p-6 sm:p-8 space-y-5 text-center">
          <h1 className="text-xl sm:text-2xl font-bold">Stordex のお申し込み</h1>
          <p className="text-slate-600 leading-relaxed">
            Stordex は有償サービスです。<br />
            ご利用には Nammoku Solutions との契約および招待コードが必要です。
          </p>
          <div className="bg-slate-50 border rounded-lg p-4 text-sm text-slate-700 space-y-1">
            <p>お申し込み・お見積りはこちら：</p>
            <p>
              <a
                href="mailto:support@nammoku-solutions.com?subject=Stordex%20%E5%88%A9%E7%94%A8%E7%94%B3%E3%81%97%E8%BE%BC%E3%81%BF"
                className="text-brand-600 hover:underline font-semibold"
              >
                support@nammoku-solutions.com
              </a>
            </p>
          </div>
          <p className="text-xs text-slate-500">
            お申し込み後、メールで招待用 URL（招待コード付き）をお送りします。
          </p>
          <p className="text-sm text-slate-500">
            既にアカウントをお持ちの方は{" "}
            <Link href="/login" className="text-brand-600 hover:underline">
              ログイン
            </Link>
          </p>
        </div>
      </main>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, token }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "登録に失敗しました");
      setBusy(false);
      return;
    }
    const r = await signIn("credentials", {
      tenantSlug: form.tenantSlug,
      email: form.email,
      password: form.password,
      redirect: false,
    });
    setBusy(false);
    if (r?.error) {
      setError("自動ログインに失敗しました。ログイン画面からログインしてください。");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="card w-full max-w-lg p-6 sm:p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-bold">新規テナント登録</h1>
          <p className="text-sm text-slate-500 mt-1">
            会社（テナント）と最初の管理者ユーザーを作成します
          </p>
          <p className="text-xs text-emerald-700 mt-2">✓ 招待コードを確認しました</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">会社名</label>
              <input
                className="input"
                required
                value={form.tenantName}
                onChange={(e) => update("tenantName", e.target.value)}
              />
            </div>
            <div>
              <label className="label">テナントID（半角英数）</label>
              <input
                className="input"
                required
                pattern="[a-z0-9-]+"
                value={form.tenantSlug}
                onChange={(e) => update("tenantSlug", e.target.value.toLowerCase())}
                placeholder="例: your-company"
              />
            </div>
          </div>
          <div>
            <label className="label">担当者名</label>
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>
          <div>
            <label className="label">メールアドレス</label>
            <input
              className="input"
              type="email"
              required
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </div>
          <div>
            <label className="label">パスワード（8文字以上）</label>
            <input
              className="input"
              type="password"
              minLength={8}
              required
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "作成中..." : "登録する"}
          </button>
        </form>
        <p className="text-sm text-slate-500 text-center">
          既にアカウントをお持ちの方は{" "}
          <Link href="/login" className="text-brand-600 hover:underline">
            ログイン
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
