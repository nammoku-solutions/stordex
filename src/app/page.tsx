import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// トップページで getServerSession が例外を投げても 500 にせず
// ゲストとして LP を表示する。NEXTAUTH_SECRET 不足等の設定ミスでも
// ユーザーには適切にログインへ誠導されるようにしておく。
async function safeGetSession() {
  try {
    return await getServerSession(authOptions);
  } catch (e) {
    console.error("[home] getServerSession failed:", e);
    return null;
  }
}

export default async function Home() {
  const session = await safeGetSession();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center space-y-6">
        <Image
          src="/logo.svg"
          alt="Stordex"
          width={96}
          height={96}
          priority
          className="mx-auto"
        />
        <h1 className="text-4xl font-bold tracking-tight">Stordex</h1>
        <p className="text-lg text-slate-600">
          物流・卸売業向け 受発注・在庫管理クラウドサービス
        </p>
        <p className="text-sm text-slate-500">提供元: Nammoku Solutions</p>
        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <Link href="/login" className="btn-primary">
            ログイン
          </Link>
          <a
            href="mailto:support@nammoku-solutions.com?subject=Stordex%20%E5%88%A9%E7%94%A8%E7%94%B3%E3%81%97%E8%BE%BC%E3%81%BF"
            className="btn-secondary"
          >
            お申し込み（メール）
          </a>
        </div>
        <p className="text-xs text-slate-500">
          ご利用には Nammoku Solutions との契約（月額・銀行振込）が必要です。
        </p>
      </div>
    </main>
  );
}
