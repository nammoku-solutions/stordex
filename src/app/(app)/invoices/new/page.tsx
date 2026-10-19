import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { createInvoice } from "../actions";
import { SubmitPendingButton } from "@/components/SubmitPendingButton";

export default async function NewInvoicePage() {
  const { tenantId } = await requireTenant();
  const [customers, businessUnits] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId, active: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.businessUnit.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const now = new Date();
  // default: 前月（月次締めは前月分が一般的）
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return (
    <>
      <PageHeader title="新規請求書（月次集計）" />
      <form action={createInvoice} className="space-y-6">
        <div className="card p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">得意先 *</label>
            <select name="customerId" required className="input">
              <option value="">選択してください</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.code} {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">請求事業所</label>
            <select name="businessUnitId" className="input">
              <option value="">（未設定）</option>
              {businessUnits.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">請求年 *</label>
            <input type="number" name="periodYear" required defaultValue={prev.getFullYear()} className="input" />
          </div>
          <div>
            <label className="label">請求月 *</label>
            <input type="number" name="periodMonth" min={1} max={12} required defaultValue={prev.getMonth() + 1} className="input" />
          </div>
          <div>
            <label className="label">支払期限</label>
            <input type="date" name="dueDate" className="input" />
          </div>
          <div>
            <label className="label">消費税率（%）</label>
            <input type="number" name="taxRate" min={0} max={100} defaultValue={10} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="taxPerOrder" />
              <span>伝票ごとに消費税計算する（旧アプリのチェック相当）</span>
            </label>
            <p className="text-xs text-slate-500 mt-1">
              チェックなし = 月次合算で消費税。チェックあり = 各受注の税額を合算。
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="label">備考</label>
            <textarea name="note" rows={3} className="input" />
          </div>
        </div>
        <div className="flex gap-3">
          <SubmitPendingButton pendingText="請求書を作成中…">請求書を作成</SubmitPendingButton>
          <a href="/invoices" className="btn-secondary">キャンセル</a>
        </div>
      </form>
    </>
  );
}
