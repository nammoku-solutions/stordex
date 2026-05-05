import type { Customer } from "@prisma/client";
import { SubmitButton } from "@/components/SubmitButton";

export function CustomerForm({
  action,
  initial,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: Partial<Customer>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="card p-6 space-y-5 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">得意先コード *</label>
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
          <input
            name="nameKana"
            maxLength={120}
            defaultValue={initial?.nameKana ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label">担当者</label>
          <input
            name="contact"
            maxLength={80}
            defaultValue={initial?.contact ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label">郵便番号</label>
          <input
            name="postalCode"
            maxLength={20}
            defaultValue={initial?.postalCode ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label">電話</label>
          <input
            name="phone"
            maxLength={40}
            defaultValue={initial?.phone ?? ""}
            className="input"
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">住所</label>
          <input
            name="address"
            maxLength={200}
            defaultValue={initial?.address ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label">FAX</label>
          <input
            name="fax"
            maxLength={40}
            defaultValue={initial?.fax ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label">メール</label>
          <input
            name="email"
            type="email"
            maxLength={120}
            defaultValue={initial?.email ?? ""}
            className="input"
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">備考</label>
          <textarea
            name="note"
            maxLength={1000}
            rows={3}
            defaultValue={initial?.note ?? ""}
            className="input"
          />
        </div>
        <div className="md:col-span-2">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name="active"
              defaultChecked={initial?.active ?? true}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">有効</span>
          </label>
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <SubmitButton pendingLabel="保存中...">
          {submitLabel}
        </SubmitButton>
        <a href="/customers" className="btn-secondary">
          キャンセル
        </a>
      </div>
    </form>
  );
}
