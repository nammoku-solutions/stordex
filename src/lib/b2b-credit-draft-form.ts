/** Strict server-side parsing of untrusted CreditNote draft allocation form. */
export class CreditDraftFormError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditDraftFormError";
  }
}
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX=2_147_483_647;
function single(form:FormData,key:string):string {
  const v=form.getAll(key);
  if(v.length!==1 || typeof v[0]!=="string") {
    throw new CreditDraftFormError(key+"の入力に誤りがあります");
  }
  return v[0];
}
export function parseCreditDraftForm(form: FormData): {
  returnRequestId: string;
  originalInvoiceId: string;
  idempotencyKey: string;
  lines: {returnItemId:string;creditedQuantity:number}[];
} {
  const returnRequestId=single(form,"returnRequestId");
  const originalInvoiceId=single(form,"originalInvoiceId");
  const idempotencyKey=single(form,"idempotencyKey").toLowerCase();
  if(!ID.test(returnRequestId)||!ID.test(originalInvoiceId)||!UUID.test(idempotencyKey)||
     single(form,"confirmed")!=="yes") {
    throw new CreditDraftFormError("元請求書・返品申請・承認チェックを確認してください");
  }
  const ids=form.getAll("returnItemId");
  const counts=form.getAll("creditedQuantity");
  if(ids.length<1||ids.length>100||ids.length!==counts.length) {
    throw new CreditDraftFormError("調整数量は1〜100明細で指定してください");
  }
  const seen=new Set<string>();
  const lines:{returnItemId:string;creditedQuantity:number}[]=[];
  for(let i=0;i<ids.length;i++) {
    const id=ids[i],qty=counts[i];
    if(typeof id!=="string"||typeof qty!=="string"||!ID.test(id)||seen.has(id)||
       !/^(0|[1-9][0-9]{0,9})$/.test(qty)) {
      throw new CreditDraftFormError("明細IDまたは数量の入力に誤りがあります");
    }
    seen.add(id);
    const n=Number(qty);
    if(!Number.isSafeInteger(n)||n>MAX) throw new CreditDraftFormError("数量が上限を超えています");
    if(n>0)lines.push({returnItemId:id,creditedQuantity:n});
  }
  if(lines.length===0) throw new CreditDraftFormError("1件以上の調整数量を入力してください");
  return {returnRequestId,originalInvoiceId,idempotencyKey,lines};
}
