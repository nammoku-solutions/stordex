# Stripe セットアップ手順（運用者向け）

> Stordex に Stripe Checkout (Phase 1) を組み込み済みです。  
> このドキュメントは Nammoku Solutions 側で実際に Stripe を有効化するための手順書です。

## 1. Stripe アカウント作成（無料）

1. https://dashboard.stripe.com/register でアカウント作成
2. Dashboard 右上で **テストモード** に切り替え（最初はずっとテストでOK）
3. 「開発者 → API キー」から **公開キー (`pk_test_...`)** と **シークレットキー (`sk_test_...`)** を控える

## 2. 商品（Product）と価格（Price）を作成

1. Dashboard → 商品カタログ → **商品を追加**
2. 例:
   - 名前: `Stordex Standard プラン`
   - 価格: `100,000円` / 一括（Phase 1 は買い切り型）
   - 通貨: `JPY`
3. 作成後、価格 ID（`price_xxx`）をコピー

## 3. ローカル環境変数を設定

`.env` に以下を追加:

```bash
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PRICE_ID_STANDARD="price_..."
# Webhook を有効化するときに追加（次のステップ）
# STRIPE_WEBHOOK_SECRET="whsec_..."
```

## 4. Stripe CLI でローカル Webhook 転送

ローカル開発時、Stripe からの Webhook をローカルに転送する CLI を使う。

```bash
# 1. インストール
brew install stripe/stripe-cli/stripe

# 2. 認証
stripe login

# 3. Webhook 転送（dev サーバ起動中の別ターミナルで）
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

実行すると `Ready! Your webhook signing secret is whsec_xxxxx` と表示されるので、
これを `.env` の `STRIPE_WEBHOOK_SECRET` に設定して `npm run dev` を再起動。

## 5. テスト決済

1. `npm run dev` でアプリ起動
2. http://localhost:3000 → **お申し込み（オンライン決済）** をクリック
3. 会社名・メール入力 → Stripe Checkout に遷移
4. テストカードで決済:
   - カード番号: `4242 4242 4242 4242`
   - 有効期限: 任意の将来日付
   - CVC: 任意の3桁
   - 郵便番号: 任意（例: 123-4567）
5. 決済成功 → `/checkout/success` にリダイレクト
6. ターミナル（`stripe listen` 側）に `checkout.session.completed` イベント
7. ターミナル（`npm run dev` 側）に「招待発行」ログ + `/signup?token=xxx` URL
8. その URL を開いてテナント登録ができることを確認

## 6. 招待メール送信を実装する（任意 / 推奨）

現在は Webhook がコンソールに招待 URL をログ出力するだけ。  
顧客に自動でメールが届くようにするには [Resend](https://resend.com) などを統合:

```bash
npm install resend
```

`.env`:
```bash
RESEND_API_KEY="re_..."
MAIL_FROM="Stordex <noreply@nammoku-solutions.com>"
```

`src/app/api/stripe/webhook/route.ts` の `console.log("[stripe webhook] 招待発行..."` の箇所で:

```ts
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);
await resend.emails.send({
  from: process.env.MAIL_FROM!,
  to: email,
  subject: "Stordex お申し込みありがとうございます",
  html: `<p>${companyName} 様</p>
    <p>下記の URL からテナント登録をお願いします（14日間有効）。</p>
    <p><a href="${signupUrl}">${signupUrl}</a></p>`,
});
```

## 7. 本番化

- Stripe Dashboard 右上を **Live モード** に切り替え
- 会社情報・本人確認・銀行口座を登録
- Live モードの API キー (`sk_live_...`) と Price ID を本番環境変数に設定
- 本番 URL の Webhook エンドポイントを Dashboard で登録
  - URL: `https://app.example.com/api/stripe/webhook`
  - イベント: `checkout.session.completed`
  - 表示された `whsec_...` を本番環境変数に設定
- 利用規約・プライバシーポリシー・特定商取引法に基づく表記を整備

## 8. 既存の招待トークン手動発行は引き続き有効

Stripe 経由の自動発行に加え、特殊ケース（紙の請求書払い、検証用テナント等）は引き続き
手動 CLI で発行できます:

```bash
npm run issue-token -- --company "South Logistics" --email "x@example.com" --days 14
```

---

## トラブルシューティング

| 症状 | 対応 |
| --- | --- |
| `/api/checkout/create` が 503 | `STRIPE_SECRET_KEY` または `STRIPE_PRICE_ID_STANDARD` が未設定 |
| Webhook が 400 (signature) | `STRIPE_WEBHOOK_SECRET` が間違い／古い／本番とテストの取り違え |
| 招待 URL が届かない | メール送信を実装していない場合、サーバーログに URL が出る。手動で送付 |
| 決済成功したのにテナント作れない | DB にトークンが入っているか `psql -d stordex_dev -c "SELECT * FROM \"SignupInvitation\";"` で確認 |
