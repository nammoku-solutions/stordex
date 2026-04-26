"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card w-full max-w-lg p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">新規テナント登録</h1>
          <p className="text-sm text-slate-500 mt-1">
            会社（テナント）と最初の管理者ユーザーを作成します
          </p>
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
                placeholder="例: nanki"
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
