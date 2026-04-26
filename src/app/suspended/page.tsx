import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SuspendedPage() {
  const session = await getServerSession(authOptions);
  let tenantName: string | null = null;
  let reason: string | null = null;
  if (session?.user?.tenantId) {
    const t = await prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true, status: true, suspendedReason: true },
    });
    tenantName = t?.name ?? null;
    reason = t?.suspendedReason ?? null;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="card max-w-xl w-full p-8 space-y-5 text-center">
        <h1 className="text-2xl font-bold text-red-700">
          ご利用が一時停止されています
        </h1>
        {tenantName && (
          <p className="text-sm text-slate-600">テナント: {tenantName}</p>
        )}
        <div className="text-left text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded p-4 space-y-2">
          <p>
            本アカウントは現在ご利用を一時停止しております。
            ご請求金額の未入金が原因の可能性があります。
          </p>
          {reason && (
            <p className="text-slate-500">
              停止理由: <span className="font-mono">{reason}</span>
            </p>
          )}
          <p>
            お振込状況をご確認の上、以下までご連絡ください。入金確認後、即時で再開いたします。
          </p>
          <p className="font-medium">
            連絡先:{" "}
            <a
              href="mailto:support@nammoku-solutions.com"
              className="text-brand-600 hover:underline"
            >
              support@nammoku-solutions.com
            </a>
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <Link href="/api/auth/signout" className="btn-secondary">
            ログアウト
          </Link>
        </div>
        <p className="text-xs text-slate-400">提供元: Nammoku Solutions</p>
      </div>
    </main>
  );
}
