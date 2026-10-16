import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import {
  requestTradingConnection,
  respondTradingConnection,
  revokeTradingConnection,
} from "./actions";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  invalid: "操作内容を確認してください。",
  "not-found": "指定した企業は見つからないか、利用できません。",
  already: "申請済み、またはすでに接続されています。",
  invited: "接続申請を送信しました。先方の承認をお待ちください。",
  accepted: "取引先との接続を承認しました。",
  declined: "申請を辞退しました。",
  revoked: "接続を解除しました。",
};

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { tenantId, role } = await requireTenant();
  const manager = role === "OWNER" || role === "ADMIN";
  const { notice } = await searchParams;
  const connections = await prisma.tradingConnection.findMany({
    where: { OR: [{ tenantAId: tenantId }, { tenantBId: tenantId }] },
    include: {
      tenantA: { select: { name: true, slug: true } },
      tenantB: { select: { name: true, slug: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="企業間取引・接続管理"
        description="Stordexを利用する企業同士を双方の承認で安全に接続します。"
      />
      {notice && messages[notice] && (
        <p role="status" className="card p-3 mb-5 text-sm">{messages[notice]}</p>
      )}
      <div className="card p-5 mb-6">
        <h2 className="text-lg font-semibold mb-2">企業を招待する</h2>
        <p className="text-sm text-slate-600 mb-4">
          先方のテナントID（例：demo / acme）を入力してください。
          承認前に相手企業の注文や商品情報が公開されることはありません。
        </p>
        {manager ? (
          <form action={requestTradingConnection} className="flex flex-wrap gap-3 items-end">
            <div className="w-full sm:max-w-sm">
              <label className="label">接続先テナントID</label>
              <input name="partnerSlug" className="input" required maxLength={63}
                autoComplete="off" placeholder="例: acme" />
            </div>
            <button className="btn-primary">接続を申請</button>
          </form>
        ) : (
          <p className="text-sm text-slate-500">接続申請・承認は管理者（OWNER / ADMIN）のみ操作できます。</p>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold mb-3">企業との接続状況</h2>
        <div className="space-y-3">
          {connections.map((link) => {
            const other = link.tenantAId === tenantId ? link.tenantB : link.tenantA;
            const received = link.requestedByTenantId !== tenantId;
            return (
              <div key={link.id} className="border border-slate-200 rounded-md p-4 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <p className="font-medium">{other.name}</p>
                  <p className="text-sm text-slate-500">{other.slug}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {link.status === "ACTIVE" ? "接続済み" :
                      link.status === "PENDING" ? (received ? "承認待ち（受信）" : "承認待ち（送信）") :
                      link.status === "DECLINED" ? "辞退済み" : "解除済み"}
                  </p>
                </div>
                {manager && link.status === "PENDING" && received && (
                  <form action={respondTradingConnection} className="flex gap-2">
                    <input type="hidden" name="id" value={link.id} />
                    <button name="decision" value="accept" className="btn-primary">承認</button>
                    <button name="decision" value="decline" className="btn-secondary">辞退</button>
                  </form>
                )}
                {manager && link.status === "ACTIVE" && (
                  <form action={revokeTradingConnection}>
                    <input type="hidden" name="id" value={link.id} />
                    <button className="btn-secondary">接続解除</button>
                  </form>
                )}
              </div>
            );
          })}
          {connections.length === 0 && (
            <p className="text-sm text-slate-500">接続先はまだありません。</p>
          )}
        </div>
      </div>
      <p className="mt-5 text-sm text-slate-600">
        現在の段階では企業の接続・承認まで対応しています。
        発注情報の送信と受注への自動取り込みは次の開発段階で追加します。
      </p>
    </>
  );
}
