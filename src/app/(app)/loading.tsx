/** Instant fallback while Next.js streams the next authenticated screen. */
export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="max-w-5xl space-y-5 animate-pulse">
      <div className="flex items-center gap-3 text-slate-600 text-sm">
        <span className="h-5 w-5 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" aria-hidden="true" />
        画面を読み込み中…
      </div>
      <div className="h-7 w-52 bg-slate-200 rounded" />
      <div className="h-24 rounded-lg bg-slate-200/70" />
      <div className="h-48 rounded-lg bg-slate-200/70" />
    </div>
  );
}
