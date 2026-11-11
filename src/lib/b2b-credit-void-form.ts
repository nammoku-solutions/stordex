export class CreditVoidFormError extends Error {
  constructor(message:string){super(message);this.name="CreditVoidFormError";}
}
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function exactlyOne(form:FormData,name:string):string {
  const values=form.getAll(name);
  if(values.length!==1||typeof values[0]!=="string") {
    throw new CreditVoidFormError("取消情報の項目数が不正です");
  }
  return values[0];
}
export function parseCreditVoidForm(form:FormData):{
  creditNoteId:string;eventId:string;reason:string;
}{
  const creditNoteId=exactlyOne(form,"creditNoteId");
  const eventId=exactlyOne(form,"eventId").toLowerCase();
  const reason=exactlyOne(form,"reason").trim();
  const consent=exactlyOne(form,"confirmed");
  if(!ID.test(creditNoteId)||!UUID.test(eventId)||consent!=="yes"||
     reason.length<8||reason.length>500){
    throw new CreditVoidFormError("下書きID・取消理由（8〜500文字）・確認チェックを見直してください");
  }
  return {creditNoteId,eventId,reason};
}
