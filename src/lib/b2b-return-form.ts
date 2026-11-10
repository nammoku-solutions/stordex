/**
 * Validate browser FormData before invoking the tenant-scoped return service.
 * This module is pure and never trusts hidden fields for authorization.
 */
export class B2BReturnFormError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "B2BReturnFormError";
  }
}

const MAX_LINES = 100;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const REASONS = ["DAMAGED", "WRONG_ITEM", "UNWANTED", "OTHER"] as const;
type Reason = (typeof REASONS)[number];

function textField(form: FormData, name: string, max = 128): string {
  const raw = form.get(name);
  if (typeof raw !== "string" || !raw.trim() || raw.trim().length > max) {
    throw new B2BReturnFormError("入力内容を確認してください: " + name);
  }
  return raw.trim();
}
function idsFrom(form: FormData): string[] {
  const raw = form.getAll("sourceLineId");
  if (!raw.length || raw.length > MAX_LINES) {
    throw new B2BReturnFormError("返品明細は1〜100件で指定してください");
  }
  const ids = raw.map(value => {
    if (typeof value !== "string" || !ID.test(value)) {
      throw new B2BReturnFormError("返品明細IDが不正です");
    }
    return value;
  });
  if (new Set(ids).size !== ids.length) {
    throw new B2BReturnFormError("返品明細IDが重複しています");
  }
  return ids;
}
function quantity(form: FormData, name: string, zeroAllowed: boolean): number {
  const raw = form.get(name);
  if (typeof raw !== "string" || !/^(0|[1-9]\d*)$/.test(raw)) {
    throw new B2BReturnFormError("返品・承認数量は0以上の整数を指定してください");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 2_147_483_647 ||
      (!zeroAllowed && value === 0)) {
    throw new B2BReturnFormError("数量が不正、または上限を超えています");
  }
  return value;
}

export function parseReturnSubmission(form: FormData) {
  const companyId = textField(form, "companyId");
  const idempotencyKey = textField(form, "idempotencyKey", 36);
  const lines = idsFrom(form).flatMap(sourceLineId => {
    const requestedQuantity = quantity(form, `quantity_${sourceLineId}`, true);
    if (requestedQuantity === 0) return [];
    const reason = textField(form, `reason_${sourceLineId}`, 24);
    if (!REASONS.includes(reason as Reason)) {
      throw new B2BReturnFormError("返品理由が不正です");
    }
    const rawNote = form.get(`note_${sourceLineId}`);
    if (typeof rawNote !== "string" || rawNote.trim().length > 500) {
      throw new B2BReturnFormError("返品の備考は500文字以内にしてください");
    }
    return [{
      sourceLineId, requestedQuantity, reason: reason as Reason,
      note: rawNote.trim() || null,
    }];
  });
  if (!lines.length) {
    throw new B2BReturnFormError("返品する明細を少なくとも1件指定してください");
  }
  return { companyId, idempotencyKey, lines };
}

export function parseReturnReview(form: FormData) {
  const requestId = textField(form, "requestId");
  const lines = idsFrom(form).map(sourceLineId => ({
    sourceLineId,
    approvedQuantity: quantity(form, `approved_${sourceLineId}`, true),
  }));
  const note = form.get("reviewNote");
  if (typeof note !== "string" || note.trim().length > 500) {
    throw new B2BReturnFormError("審査コメントは500文字以内にしてください");
  }
  return { requestId, decisions: lines, reviewNote: note.trim() || null };
}
