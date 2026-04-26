"use client";

export function PrintToolbar({ title }: { title: string }) {
  return (
    <div className="print-toolbar no-print flex items-center justify-between">
      <div className="text-sm text-slate-600">{title}</div>
      <div className="flex gap-2">
        <button onClick={() => window.print()} className="btn-primary">
          印刷 / PDF保存
        </button>
        <button onClick={() => window.history.back()} className="btn-secondary">
          戻る
        </button>
      </div>
    </div>
  );
}
