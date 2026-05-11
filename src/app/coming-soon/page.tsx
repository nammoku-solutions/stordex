import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stordex — Coming Soon",
  description: "Stordex は近日公開予定です。",
  robots: { index: false, follow: false },
};

export default function ComingSoonPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 px-4">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-lg p-8 sm:p-12 text-center">
        <div className="text-sm font-semibold tracking-widest text-slate-500 uppercase">
          Stordex
        </div>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900">
          Coming Soon
        </h1>
        <p className="mt-4 text-slate-600 leading-relaxed">
          受発注・在庫管理クラウド「Stordex」は近日公開予定です。
          <br />
          公開までいましばらくお待ちください。
        </p>
        <div className="mt-8 inline-flex items-center gap-2 text-sm text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          準備中
        </div>
      </div>
    </main>
  );
}
