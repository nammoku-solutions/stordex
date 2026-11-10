/** Strict validation of untrusted return dispatch / inspection form data. */
export class ReturnStockFormError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReturnStockFormError";
  }
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX = 2_147_483_647;

function field(data: FormData, name: string): string {
  const values = data.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new ReturnStockFormError(name + "の入力が不正です");
  }
  return values[0];
}

function identifier(data: FormData, name: string): string {
  const value = field(data, name);
  if (!ID.test(value)) throw new ReturnStockFormError(name + "が不正です");
  return value;
}

function integer(data: FormData, name: string, min: number): number {
  const raw = field(data, name);
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new ReturnStockFormError(name + "は整数で入力してください");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > MAX) {
    throw new ReturnStockFormError(name + "が許容範囲を超えています");
  }
  return value;
}

function common(data: FormData) {
  const requestId = identifier(data, "requestId");
  const returnItemId = identifier(data, "returnItemId");
  const eventId = field(data, "eventId");
  if (!UUID.test(eventId)) {
    throw new ReturnStockFormError("操作IDはUUIDで指定してください");
  }
  if (field(data, "confirmed") !== "yes") {
    throw new ReturnStockFormError("在庫変更への確認が必要です");
  }
  return { requestId, returnItemId, eventId: eventId.toLowerCase() };
}

export function parseBuyerReturnDispatch(data: FormData) {
  return { ...common(data), quantity: integer(data, "quantity", 1) };
}

export function parseSellerReturnInspection(data: FormData) {
  const base = common(data);
  const receivedNow = integer(data, "receivedNow", 1);
  const saleable = integer(data, "saleable", 0);
  const unsaleable = integer(data, "unsaleable", 0);
  if (saleable + unsaleable !== receivedNow) {
    throw new ReturnStockFormError("良品数と不良品数の合計が受領数量と一致しません");
  }
  return { ...base, receivedNow, saleable, unsaleable };
}
