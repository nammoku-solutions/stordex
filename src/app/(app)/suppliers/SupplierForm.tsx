import type { Supplier } from "@/generated/prisma/client";

export function SupplierForm({
  action,
  initial,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: Partial<Supplier>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="card p-6 space-y-5 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">仕入先コード *</label>
          <input
            name="code"
            required
            maxLength={40}
            defaultValue={initial?.code ?? ""}
            className="input font-mono"
          />
        </div>
        <div>
          <label className="label">名称 *</label>
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={initial?.name ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label">フリガナ</label>
          <input name="nameKana" defaultValue={initial?.nameKana ?? ""} className="input" />
        </div>
        <div>
          <label className="label">担当者</label>
          <input name="contact" defaultValue={initial?.contact ?? ""} className="input" />
        </div>
        <div>
          <label className="label">郵便番号</label>
          <input name="postalCode" defaultValue={initial?.postalCode ?? ""} className="input" />
        </div>
        <div>
          <label className="label">電話</label>
          <input name="phone" defaultValue={initial?.phone ?? ""} className="input" />
        </div>
        <div className="md:col-span-2">
          <label className="label">住所</label>
          <input name="address" defaultValue={initial?.address ?? ""} className="input" />
        </div>
        <div>
          <label className="label">FAX</label>
          <input name="fax" defaultValue={initial?.fax ?? ""} className="input" />
        </div>
        <div>
          <label className="label">メール</label>
          <input name="email" type="email" defaultValue={initial?.email ?? ""} className="input" />
        </div>
        <div className="md:col-span-2">
          <label className="label">備考</label>
          <textarea name="note" rows={3} defaultValue={initial?.note ?? ""} className="input" />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary">
          {submitLabel}
        </button>
        <a href="/suppliers" className="btn-secondary">
          キャンセル
        </a>
      </div>
    </form>
  );
}
