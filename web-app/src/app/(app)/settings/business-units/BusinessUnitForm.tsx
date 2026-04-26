type BU = {
  id?: string;
  name?: string;
  postalCode?: string | null;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  bankInfo?: string | null;
  isDefault?: boolean;
};

export function BusinessUnitForm({
  action,
  unit,
}: {
  action: (formData: FormData) => Promise<void>;
  unit?: BU;
}) {
  return (
    <form action={action} className="space-y-6">
      <div className="card p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="label">事業所名 *</label>
          <input name="name" required defaultValue={unit?.name ?? ""} className="input" />
        </div>
        <div>
          <label className="label">郵便番号</label>
          <input name="postalCode" defaultValue={unit?.postalCode ?? ""} className="input" />
        </div>
        <div>
          <label className="label">電話</label>
          <input name="phone" defaultValue={unit?.phone ?? ""} className="input" />
        </div>
        <div className="md:col-span-2">
          <label className="label">住所</label>
          <input name="address" defaultValue={unit?.address ?? ""} className="input" />
        </div>
        <div>
          <label className="label">FAX</label>
          <input name="fax" defaultValue={unit?.fax ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" name="email" defaultValue={unit?.email ?? ""} className="input" />
        </div>
        <div className="md:col-span-2">
          <label className="label">振込先情報（請求書に記載）</label>
          <textarea name="bankInfo" rows={3} defaultValue={unit?.bankInfo ?? ""} className="input" />
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isDefault" defaultChecked={unit?.isDefault ?? false} />
            <span>既定の事業所にする</span>
          </label>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="submit" className="btn-primary">保存</button>
        <a href="/settings/business-units" className="btn-secondary">キャンセル</a>
      </div>
    </form>
  );
}
