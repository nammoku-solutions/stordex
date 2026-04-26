import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">Stordex</h1>
        <p className="text-lg text-slate-600">
          物流・卸売業向け 受発注・在庫管理クラウドサービス
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/login" className="btn-primary">
            ログイン
          </Link>
          <Link href="/signup" className="btn-secondary">
            新規テナント登録
          </Link>
        </div>
      </div>
    </main>
  );
}
