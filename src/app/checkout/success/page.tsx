import Link from "next/link";

export default function CheckoutSuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card w-full max-w-lg p-8 space-y-5 text-center">
        <h1 className="text-2xl font-bold text-emerald-700">お申し込みありがとうございます</h1>
        <p className="text-slate-700 leading-relaxed">
          決済が完了しました。<br />
          ご登録のメールアドレスに <strong>招待 URL</strong> をお送りします。
          数分以内に届かない場合は迷惑メールフォルダもご確認ください。
        </p>
        <p className="text-sm text-slate-500">
          届かない場合は{" "}
          <a href="mailto:support@nammoku-solutions.com" className="text-brand-600 hover:underline">
            support@nammoku-solutions.com
          </a>{" "}
          までご連絡ください。
        </p>
        <Link href="/" className="text-sm text-slate-600 hover:underline">
          ホームに戻る
        </Link>
      </div>
    </main>
  );
}
