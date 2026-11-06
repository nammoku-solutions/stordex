/**
 * Issue #82 — DRAFT-only independent review evidence.
 *
 * This service does NOT approve, issue, pay, refund, offset or mutate an
 * invoice/CreditNote. Do not expose it via Server Actions until #109 restore,
 * authorization and the full B2B migration chain have been approved.
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { lockBuyerPurchaseOrder, lockCompanyConnection } from "@/lib/b2b-locks";

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
type Action = "CHECKS_RECORDED" | "NEEDS_REVISION";

export class CreditReviewEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditReviewEvidenceError";
  }
}
function fail(message: string): never {
  throw new CreditReviewEvidenceError(message);
}
const hash = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");

type Input = {
  sellerTenantId: string;
  reviewerUserId: string;
  creditNoteId: string;
  eventId: string;
  action: Action;
  reviewNote: string;
};
type Result = {
  auditEventId: string;
  created: boolean;
  action: Action;
  status: "REVIEW_EVIDENCE_RECORDED_NOT_APPROVED";
};

/** Must be called only by a future Server Action that derives tenant and user
 * from the verified session. Client supplied actor identity is NEVER trusted. */
export async function recordIndependentCreditReviewEvidence(input: Input): Promise<Result> {
  if (!ID.test(input.sellerTenantId) || !ID.test(input.reviewerUserId) ||
      !ID.test(input.creditNoteId) || !UUID.test(input.eventId) ||
      !["CHECKS_RECORDED", "NEEDS_REVISION"].includes(input.action)) {
    fail("企業・レビュー担当・CreditNote・レビューイベントIDが不正です");
  }
  const eventId = input.eventId.toLowerCase();
  const reviewNote = input.reviewNote?.trim() ?? "";
  if (!reviewNote || reviewNote.length > 1000) {
    fail("レビューコメントは1〜1000文字で指定してください");
  }

  return prisma.$transaction(async tx => {
    const reviewer = await tx.user.findFirst({
      where: {
        id: input.reviewerUserId, tenantId: input.sellerTenantId,
        role: {in:["OWNER","ADMIN"]}, tenant: {status:"ACTIVE"},
      },
      select:{id:true},
    });
    if (!reviewer) fail("レビューは売り手企業の有効な管理者だけが実行できます");

    const source = await tx.b2BCreditNote.findFirst({
      where: {id:input.creditNoteId,sellerTenantId:input.sellerTenantId},
      select: {
        id:true,returnRequest: {select:{
          id:true,companyOrder:{select:{
            buyerTenantId:true,purchaseOrderId:true,connectionId:true,
          }},
        }},
      },
    });
    if (!source) fail("対象の下書きが見つかりません");
    const order = source.returnRequest.companyOrder;

    // Same global B2B write lock ordering, keeping mixed credit/return
    // operations from quietly racing.
    await lockBuyerPurchaseOrder(tx,order.buyerTenantId,order.purchaseOrderId);
    await lockCompanyConnection(tx,order.connectionId);
    const lockedRequest = await tx.$queryRaw<{id:string}[]>`
      SELECT id FROM "B2BReturnRequest"
      WHERE id = ${source.returnRequest.id} FOR UPDATE
    `;
    if (lockedRequest.length !== 1) fail("返品申請が変更されました");
    const lockedLines = await tx.$queryRaw<{id:string}[]>`
      SELECT id FROM "B2BReturnItem"
      WHERE "returnRequestId" = ${source.returnRequest.id}
      ORDER BY id FOR UPDATE
    `;
    if (!lockedLines.length || lockedLines.length > 100) {
      fail("返品明細の数量を照合できません");
    }
    const creditLock = await tx.$queryRaw<{id:string}[]>`
      SELECT id FROM "B2BCreditNote"
      WHERE id = ${input.creditNoteId} AND "sellerTenantId" = ${input.sellerTenantId}
      FOR UPDATE
    `;
    if (creditLock.length !== 1) fail("クレジットノートの状態が変更されました");

    const existing = await tx.b2BCreditReviewAudit.findUnique({
      where: {sellerTenantId_eventId:{
        sellerTenantId:input.sellerTenantId,eventId,
      }},
    });
    if (existing) {
      if (existing.creditNoteId !== input.creditNoteId ||
          existing.reviewerUserId !== input.reviewerUserId ||
          existing.action !== input.action ||
          existing.reviewNote !== reviewNote) {
        fail("同じイベントIDで異なるレビュー内容は保存できません");
      }
      return {
        auditEventId: existing.id,created:false,action:existing.action,
        status:"REVIEW_EVIDENCE_RECORDED_NOT_APPROVED" as const,
      };
    }
    const credit = await tx.b2BCreditNote.findFirst({
      where:{id:input.creditNoteId,sellerTenantId:input.sellerTenantId},
      include:{
        originalInvoice:{include:{orders:{select:{orderId:true}}}},
        returnRequest:{include:{
          companyOrder:{include:{
            connection:{select:{status:true}},
            purchaseOrder:{select:{status:true}},
            sellerOrder:{select:{id:true,tenantId:true,status:true}},
          }},
        }},
        lines:{orderBy:{returnItemId:"asc"}},
      },
    });
    if (!credit || credit.status!=="DRAFT" ||
        credit.createdByUserId===input.reviewerUserId) {
      fail("作成者本人の審査またはDRAFT以外のレビューは許可されません");
    }
    const inv=credit.originalInvoice;
    const linked=credit.returnRequest.companyOrder;
    if (inv.tenantId!==input.sellerTenantId ||
        !["ISSUED","PAID"].includes(inv.status) ||
        credit.originalInvoiceSubtotal!==inv.subtotal ||
        credit.originalInvoiceTax!==inv.tax ||
        credit.originalInvoiceTotal!==inv.total ||
        credit.originalInvoiceTaxRate!==inv.taxRate ||
        credit.originalInvoiceTaxPerOrder!==inv.taxPerOrder ||
        linked.status!=="ACCEPTED" ||
        linked.connection.status!=="ACTIVE" ||
        linked.purchaseOrder.status!=="RECEIVED" ||
        !linked.sellerOrder ||
        linked.sellerOrder.tenantId!==input.sellerTenantId ||
        linked.sellerOrder.id!==credit.sellerOrderId ||
        !inv.orders.some(o=>o.orderId===credit.sellerOrderId) ||
        !["SHIPPED","COMPLETED"].includes(linked.sellerOrder.status) ||
        credit.returnRequest.sellerTenantId!==input.sellerTenantId) {
      fail("元請求書・返品元・取引先の整合が取れていません");
    }
    if (!credit.lines.length || credit.lines.length>100 ||
        credit.lines.some(line=>line.returnRequestId!==credit.returnRequestId)) {
      fail("下書き明細が元返品申請と一致しません");
    }
    const ids=credit.lines.map(line=>line.returnItemId);
    const inspected=await tx.b2BReturnStockEvent.groupBy({
      by:["returnItemId"],where:{
        returnItemId:{in:ids},phase:"INSPECTION",
      },_sum:{quantity:true},
    });
    const allocations=await tx.b2BCreditNoteLine.groupBy({
      by:["returnItemId"],where:{returnItemId:{in:ids}},
      _sum:{creditedQuantity:true},
    });
    const physical=new Map(inspected.map(x=>[x.returnItemId,x._sum.quantity??0]));
    const reserved=new Map(allocations.map(x=>[x.returnItemId,x._sum.creditedQuantity??0]));
    for(const line of credit.lines){
      const actual=physical.get(line.returnItemId)??0;
      const allocated=reserved.get(line.returnItemId)??0;
      if(line.creditedQuantity<1 || line.creditedQuantity>actual ||
          allocated>actual) {
        fail("元返品の物理検品数と下書き割当が一致しません");
      }
    }
    // This is only basic proposed-monetary consistency. In particular it
    // does NOT validate national tax law, rounding, paid funds or consent.
    if(input.action==="CHECKS_RECORDED"){
      const amountFields=[
        credit.proposedSubtotal,credit.proposedTax,credit.proposedTotal,
      ];
      if(amountFields.some(x=>x===null) ||
          !credit.taxAllocationExplanation?.trim() ||
          credit.lines.some(line=>
            line.proposedSubtotal===null ||
            line.proposedTax===null ||
            line.proposedTotal===null)) {
        fail("金額・税額配賦根拠が未入力です。要修正として記録してください");
      }
      const lineTotals=credit.lines.reduce((tot,line)=>({
        subtotal:tot.subtotal+line.proposedSubtotal!,
        tax:tot.tax+line.proposedTax!,
        total:tot.total+line.proposedTotal!,
      }),{subtotal:0,tax:0,total:0});
      if(lineTotals.subtotal!==credit.proposedSubtotal ||
          lineTotals.tax!==credit.proposedTax ||
          lineTotals.total!==credit.proposedTotal ||
          credit.proposedTotal!>credit.originalInvoiceTotal) {
        fail("下書き金額・明細・元請求書の合計が一致しません");
      }
    }
    const sourceSnapshotHash=hash({
      schema:"b2b-credit-source-snapshot-v1",
      credit:{
        id:credit.id,status:credit.status,createdBy:credit.createdByUserId,
        tenant:credit.sellerTenantId,returnRequestId:credit.returnRequestId,
        invoice:credit.originalInvoiceId,currency:credit.currencyCode,
        amount:[credit.proposedSubtotal,credit.proposedTax,credit.proposedTotal],
        taxReason:credit.taxAllocationExplanation,
      },
      invoice:{
        id:inv.id,status:inv.status,subtotal:inv.subtotal,tax:inv.tax,
        total:inv.total,taxRate:inv.taxRate,taxPerOrder:inv.taxPerOrder,
      },
      lines:credit.lines.map(line=>({
        id:line.returnItemId,quantity:line.creditedQuantity,
        proposed:[line.proposedSubtotal,line.proposedTax,line.proposedTotal],
        inspected:physical.get(line.returnItemId)??0,
        reserved:reserved.get(line.returnItemId)??0,
      })),
    });
    const event=await tx.b2BCreditReviewAudit.create({data:{
      sellerTenantId:input.sellerTenantId,
      creditNoteId:credit.id,
      eventId,
      action:input.action,
      reviewerUserId:input.reviewerUserId,
      reviewNote,
      sourceSnapshotHash,
    }});
    return {
      auditEventId:event.id,created:true,action:event.action,
      status:"REVIEW_EVIDENCE_RECORDED_NOT_APPROVED" as const,
    };
  },{isolationLevel:"Serializable",timeout:15000});
}
