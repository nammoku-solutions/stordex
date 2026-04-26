import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card w-full max-w-lg p-8 space-y-5 text-center">
        <h1 className="text-2xl font-bold">決済をキャンセルしました</h1>
        <p className="text-slate-600">
          ご不明点がございましたらお気軽にお問い合わせください。
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="btn-secondary">
            ホームに戻る
          </Link>
          <a href="mailto:support@nammoku-solutions.com" className="btn-primary">
            問い合わせ
          </a>
        </div>
      </div>
    </main>
  );
}
