import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { prisma } from "@/lib/db";
import { yen } from "@/lib/format";
import { requireTenant } from "@/lib/session";
import {
  b2bCreditPreviewEnabled,
  hasManualJPYConfirmation,
  isSellerCreditPreviewManager,
} from "@/lib/b2b-credit-preview-feature";
import {
  previewB2BCreditAmounts,
  type CreditPreviewBlocker,
} from "@/lib/b2b-credit-readonly-amounts";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_LINES = 100;
const MAX_AMOUNT = 2_147_483_647;

const blockerLabels: Record<CreditPreviewBlocker, string> = {
  JPY_PROVENANCE_UNCONFIRMED: "元請求書の通貨がJPYであることを確認してください。",
  INVOICE_NOT_ISSUED: "元請求書が発行済み・入金済みではありません。",
  ALREADY_ACTIVE_CREDIT_NOTE: "この請求書には有効な別のCreditNoteがあります。重複調整を防ぐため試算を停止しました。",
  INVALID_SOURCE: "元の請求書または調整明細の形式を確認できません。",
  INVOICE_ORDERS_INCOMPLETE: "元請求書に紐づく伝票がすべて揃っていません。",
  ORIGINAL_TOTALS_MISMATCH: "元請求書・伝票・商品明細の金額や税額に不整合があります。",
  CREDIT_LINE_NOT_IN_INVOICE: "返品明細を元請求書の売り手伝票へ正しく紐付けできません。",
  INVALID_INSPECTED_QUANTITY: "返品の承認・検品・既存割当数量が一致しません。",
  CREDIT_EXCEEDS_ORIGINAL: "調整案の金額が元請求書の上限を超えています。",
};

type PreviewParams = {
  returnRequestId?: string | string[];
  currencyConfirmed?: string | string[];
};

/**
 * Seller-only, immutable-source read. A Repeatable Read snapshot avoids
 * mixing old invoice/return/allocation states in one UI calculation.
 * No insert/update/delete, DDL, action endpoint, or financial posting.
 */
export default async function CreditAmountPreviewPage({
  searchParams,
}: {
  searchParams: Promise<PreviewParams>;
}) {
  if (!b2bCreditPreviewEnabled()) notFound();
  const { tenantId, role } = await requireTenant();
  if (!isSellerCreditPreviewManager(role)) notFound();

  const query = await searchParams;
  const returnRequestId = query.returnRequestId;
  if (typeof returnRequestId !== "string" || !ID.test(returnRequestId)) {
    notFound();
  }
  const manuallyConfirmedJPY = hasManualJPYConfirmation(query.currencyConfirmed);

  const data = await prisma.$transaction(async tx => {
    const request = await tx.b2BReturnRequest.findFirst({
      where: { id: returnRequestId, sellerTenantId: tenantId },
      select: {
        id: true,
        requestNumber: true,
        status: true,
        companyOrder: {
          select: {
            poNumber: true,
            status: true,
            sellerTenantId: true,
            sellerOrderId: true,
            sellerOrder: { select: { tenantId: true, status: true } },
            connection: { select: { status: true } },
            purchaseOrder: { select: { status: true } },
          },
        },
        items: {
          orderBy: { id: "asc" },
          take: MAX_LINES + 1,
          select: {
            id: true,
            approvedQuantity: true,
            sourceLine: {
              select: {
                sellerOrderItemId: true,
                itemName: true,
                unit: true,
              },
            },
            stockEvents: {
              where: { phase: "INSPECTION" },
              select: { quantity: true },
            },
            creditLines: {
              where: { creditNote: { status: { not: "VOID" } } },
              select: { creditedQuantity: true },
            },
          },
        },
      },
    });
    if (!request) return { kind: "not-found" as const };

    const company = request.companyOrder;
    if (request.status !== "INSPECTED" ||
        company.status !== "ACCEPTED" ||
        company.sellerTenantId !== tenantId ||
        company.connection.status !== "ACTIVE" ||
        company.purchaseOrder.status !== "RECEIVED" ||
        !company.sellerOrderId ||
        company.sellerOrder?.tenantId !== tenantId ||
        !["SHIPPED", "COMPLETED"].includes(company.sellerOrder.status)) {
      return {
        kind: "blocked" as const,
        requestNumber: request.requestNumber,
        reason: "正式検品・企業間連携・入荷・売り手受注の状態が揃っていません。",
      };
    }
    const sellerOrderId = company.sellerOrderId;
    const invoices = await tx.invoice.findMany({
      where: {
        tenantId,
        status: { in: ["ISSUED", "PAID"] },
        orders: { some: { orderId: sellerOrderId } },
      },
      take: 2,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        subtotal: true,
        tax: true,
        total: true,
        taxRate: true,
        taxPerOrder: true,
        orders: {
          select: {
            orderId: true,
            order: {
              select: {
                id: true,
                subtotal: true,
                tax: true,
                total: true,
                taxRate: true,
                items: {
                  take: 501,
                  select: {
                    id: true,
                    quantity: true,
                    unitPrice: true,
                    amount: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (invoices.length !== 1) {
      return {
        kind: "blocked" as const,
        requestNumber: request.requestNumber,
        reason: "売り手受注に紐づく発行済み請求書を一意に特定できません。",
      };
    }
    const invoice = invoices[0];
    const otherActiveCreditNoteCount = await tx.b2BCreditNote.count({
      where: { originalInvoiceId: invoice.id, status: { not: "VOID" } },
    });
    return {
      kind: "ready" as const,
      request,
      invoice,
      sellerOrderId,
      otherActiveCreditNoteCount,
    };
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });

  if (data.kind === "not-found") notFound();
  if (data.kind === "blocked") {
    return (
      <>
        <PageHeader title="CreditNote金額の試算" description="読み取り専用・金額未確定" />
        <section className="card p-5 space-y-2" role="status">
          <h2 className="font-semibold">返品 {data.requestNumber} は現在試算できません</h2>
          <p className="text-sm">{data.reason}</p>
          <p className="text-sm">この確認ではCreditNote・請求書・在庫に変更を加えていません。</p>
          <Link href="/invoices" className="btn-secondary">請求書一覧に戻る</Link>
        </section>
      </>
    );
  }

  const { request, invoice, sellerOrderId } = data;
  const returns = request.items.map(item => {
    const inspected = item.stockEvents.reduce((sum, e) => sum + e.quantity, 0);
    const allocated = item.creditLines.reduce((sum, line) => sum + line.creditedQuantity, 0);
    return {
      id: item.id,
      sellerOrderItemId: item.sourceLine.sellerOrderItemId,
      itemName: item.sourceLine.itemName,
      unit: item.sourceLine.unit,
      approved: item.approvedQuantity,
      inspected,
      allocated,
      available: inspected - allocated,
    };
  });

  // Treat source mapping and quantities as untrusted until checked against
  // complete seller OrderItem snapshots by the pure calculator below.
  const invalidReturnLines = returns.length === 0 ||
    returns.length > MAX_LINES ||
    returns.some(line =>
      !Number.isSafeInteger(line.approved) || line.approved < 0 ||
      !Number.isSafeInteger(line.inspected) || line.inspected < 0 ||
      !Number.isSafeInteger(line.allocated) || line.allocated < 0 ||
      line.inspected > line.approved || line.allocated > line.inspected ||
      line.approved > MAX_AMOUNT);
  const availableLines = returns.filter(line => line.available > 0);
  const incompleteSourceMapping = availableLines.some(line => !line.sellerOrderItemId);
  const preview = invalidReturnLines || incompleteSourceMapping ||
    availableLines.length === 0
    ? null
    : previewB2BCreditAmounts({
        sellerConfirmedOriginalInvoiceJPY: manuallyConfirmedJPY,
        otherActiveCreditNoteCount: data.otherActiveCreditNoteCount,
        invoice: {
          id: invoice.id,
          status: invoice.status,
          subtotal: invoice.subtotal,
          tax: invoice.tax,
          total: invoice.total,
          taxRate: invoice.taxRate,
          taxPerOrder: invoice.taxPerOrder,
          orderIds: invoice.orders.map(io => io.orderId),
        },
        orders: invoice.orders.map(io => ({
          id: io.order.id,
          subtotal: io.order.subtotal,
          tax: io.order.tax,
          total: io.order.total,
          taxRate: io.order.taxRate,
          lines: io.order.items.map(line => ({
            id: line.id,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            amount: line.amount,
          })),
        })),
        allocations: availableLines.map(line => ({
          orderId: sellerOrderId,
          // Missing mapping is rejected above; calculator also checks
          // ownership against the complete sellerOrderId's lines.
          orderLineId: line.sellerOrderItemId!,
          creditedQuantity: line.available,
          approvedQuantity: line.approved,
          inspectedQuantity: line.inspected,
          otherActiveAllocatedQuantity: line.allocated,
        })),
      });

  const sellerOrder = invoice.orders.find(io => io.orderId === sellerOrderId);
  const priceBySellerLine = new Map(
    sellerOrder?.order.items.map(item => [item.id, item.unitPrice] as const) ?? [],
  );
  const blockedReason = invalidReturnLines
    ? "返品の承認・検品・既存割当数量を検証できません。"
    : incompleteSourceMapping
      ? "売り手側の元商品明細への紐付けがありません。"
      : availableLines.length === 0
        ? "検品済みの未割当数量がありません。"
        : preview && !preview.ready ? blockerLabels[preview.blocker] : null;

  return (
    <>
      <PageHeader
        title="CreditNote金額の試算（読み取り専用）"
        description={"返品 " + request.requestNumber + "・請求書 " + invoice.invoiceNumber}
        action={
          <Link href={"/invoices/" + invoice.id} className="btn-secondary">
            元の請求書に戻る
          </Link>
        }
      />
      <section className="rounded border border-amber-300 bg-amber-50 p-4 mb-5 text-sm text-amber-950 space-y-2">
        <strong>金額未確定・発行不可</strong>
        <p>
          この画面は確認時点の元請求書・返品・検品記録から参考金額を再計算するだけです。
          CreditNoteの金額欄への保存、正式発行、入金相殺、返金、在庫更新は一切行いません。
          別の操作が発生した場合、試算をやり直してください。
        </p>
        <p>
          元請求書は通貨コードをDBに保存していないため、ここでのJPY確認は
          管理者による一時的な自己申告です。通貨の証明・会計上の承認にはなりません。
        </p>
      </section>

      <section className="card p-5 mb-5 space-y-3">
        <h2 className="font-semibold">元請求書と課税方式</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><p className="text-xs text-slate-500">請求書番号</p><p>{invoice.invoiceNumber}</p></div>
          <div><p className="text-xs text-slate-500">元の小計</p><p>{yen(invoice.subtotal)}</p></div>
          <div><p className="text-xs text-slate-500">元の税額</p><p>{yen(invoice.tax)}</p></div>
          <div><p className="text-xs text-slate-500">元の合計</p><p>{yen(invoice.total)}</p></div>
        </div>
        <p className="text-sm">消費税：{invoice.taxPerOrder
          ? "伝票ごとに計算（各伝票の保存済み税額を合算）"
          : "請求書全体で計算（税率 " + invoice.taxRate + "%、円未満切捨て）"}</p>
        <p className="text-xs text-slate-600">
          元の税額をそのまま採用するか、金額調整に利用できるかは、別途会計確認が必要です。
        </p>
      </section>

      <section className="card p-5 mb-5 space-y-3">
        <h2 className="font-semibold">返品の検品・割当根拠</h2>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>元の商品</th>
              <th className="text-right">承認</th>
              <th className="text-right">検品済</th>
              <th className="text-right">有効割当</th>
              <th className="text-right">未割当</th>
              <th className="text-right">元の単価</th>
            </tr></thead>
            <tbody>{returns.map(line => (
              <tr key={line.id}>
                <td>{line.itemName}</td>
                <td className="text-right">{line.approved} {line.unit}</td>
                <td className="text-right">{line.inspected} {line.unit}</td>
                <td className="text-right">{line.allocated} {line.unit}</td>
                <td className="text-right">{line.available} {line.unit}</td>
                <td className="text-right">{manuallyConfirmedJPY &&
                  line.sellerOrderItemId &&
                  priceBySellerLine.has(line.sellerOrderItemId)
                  ? yen(priceBySellerLine.get(line.sellerOrderItemId)!)
                  : "確認後に表示"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="text-xs text-slate-600">
          仮の調整数量には、今回の返品申請に紐づく未割当の検品済み数量をすべて使用します。
          この画面から数量の変更・割当確保はできません。
        </p>
      </section>

      <form method="get" action="/credit-notes/preview"
        className="card p-5 mb-5 space-y-3"
        aria-label="元請求書の通貨に関する手動確認">
        <h2 className="font-semibold">通貨確認（表示用・保存しません）</h2>
        <input type="hidden" name="returnRequestId" value={request.id} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="currencyConfirmed" value="JPY"
            required defaultChecked={manuallyConfirmedJPY} className="mt-1" />
          <span>元請求書の原本を別途確認し、JPY建てであることを把握しました。
            これは試算表示のための確認であり、通貨証跡のDB登録・正式承認ではありません。</span>
        </label>
        <button className="btn-secondary" type="submit">
          JPY前提で参考金額を再計算
        </button>
      </form>

      {preview?.ready ? (
        <section className="card p-5 mb-5 space-y-3" aria-label="参考金額の試算結果">
          <h2 className="font-semibold">参考金額（未確定）</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><p className="text-xs text-slate-500">仮の調整小計</p><p className="font-semibold">{yen(preview.creditedSubtotal)}</p></div>
            <div><p className="text-xs text-slate-500">仮の調整税額</p><p className="font-semibold">{yen(preview.creditedTax)}</p></div>
            <div><p className="text-xs text-slate-500">仮の調整合計</p><p className="font-semibold">{yen(preview.creditedTotal)}</p></div>
          </div>
          <p className="text-sm">
            仮の残額：小計 {yen(preview.remainingInvoiceSubtotal)}、
            税額 {yen(preview.remainingInvoiceTax)}、
            合計 {yen(preview.remainingInvoiceTotal)}
          </p>
          <p className="text-sm">
            計算根拠：{preview.taxMode === "INVOICE_DIFFERENCE"
              ? "元請求税額 − floor(返品後の仮小計 × 請求税率 / 100)"
              : "各元伝票について [元税額 − floor(その伝票の仮残小計 × 伝票税率 / 100)] を計算して合算"}
          </p>
          <p className="text-xs text-slate-600">
            JPYの自己申告に基づく参考額です。正式な会計調整・返金額・発行済みCreditNoteではありません。
          </p>
        </section>
      ) : (
        <section className="card p-5 mb-5 space-y-2" role="status">
          <h2 className="font-semibold">参考金額の表示を保留しています</h2>
          <p className="text-sm">{blockedReason ?? "元請求書と検品記録を確認してください。"}</p>
          <p className="text-xs text-slate-600">
            試算が保留でも、元の返品申請・請求書・在庫は変更していません。
          </p>
        </section>
      )}
    </>
  );
}
