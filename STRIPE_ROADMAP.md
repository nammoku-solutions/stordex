# Stripe 課金導入ロードマップ

> Stordex の有償化を Stripe で運用する計画書。

提供元: Nammoku Solutions

---

## 目次

1. [Stripe のコスト](#1-stripe-のコスト)
2. [現在の課金フロー（招待トークン制）](#2-現在の課金フロー招待トークン制)
3. [Phase 1: Stripe Checkout（一括前払い・最小実装）](#3-phase-1-stripe-checkout一括前払い最小実装)
4. [Phase 2: Stripe Subscription（月額自動継続 + 未払い停止）](#4-phase-2-stripe-subscription月額自動継続--未払い停止)
5. [Phase 3: 高度な機能（複数プラン、追加ユーザー、利用量課金）](#5-phase-3-高度な機能)
6. [運用上の注意](#6-運用上の注意)
7. [スキーマ拡張案](#7-スキーマ拡張案)
8. [実装チェックリスト](#8-実装チェックリスト)

---

## 1. Stripe のコスト

### 無料の範囲

- アカウント作成・維持費 → **¥0**
- API 呼び出し / Dashboard / Webhook → **¥0**
- テストモード（API キー `sk_test_...` で完結） → **¥0**

### 有料になる箇所（本番取引のみ）

| 項目 | 日本 |
| --- | --- |
| カード決済（Visa / Master / JCB / AMEX 等） | 売上の **3.6%** |
| 海外発行カード | +1.0%（合計 4.6%） |
| 銀行振込 / コンビニ決済 / 口座振替 | プランごとに別途 |
| 返金 | 売上手数料は返却されない |
| Stripe Tax（自動税計算） | 取引額の 0.5%（オプション） |
| Radar for Fraud Teams | 1 件 ¥7（オプション） |

> 結論: **アカウント開設〜テスト〜本番リリース直前まで完全無料**。実取引が発生したときだけ手数料が引かれます。

### 始め方

1. https://dashboard.stripe.com/register でアカウント作成（無料）
2. テストモードで API キー取得 (`sk_test_...`, `pk_test_...`)
3. Webhook エンドポイント登録
4. 開発・テストは無料
5. 本番化（Live モード）には会社情報・本人確認・銀行口座登録が必要

---

## 2. 現在の課金フロー（招待トークン制）

実装済み（[`prisma/schema.prisma`](prisma/schema.prisma) の `SignupInvitation` モデル + [`scripts/issue-signup-token.ts`](scripts/issue-signup-token.ts)）。

```
顧客が問合せ ─→ Nammoku Solutions が見積・契約・入金確認
              └→ npm run issue-token でトークン発行
                  └→ 顧客に招待 URL をメール送付
                      └→ 顧客が /signup?token=xxx でテナント作成
```

**メリット**: ¥0 で開始でき、顧客数が少ないうちは手作業で十分。  
**デメリット**: 月額継続課金や未払い停止は手動運用。スケールしない。

---

## 3. Phase 1: Stripe Checkout（一括前払い・最小実装）

> 顧客が増えてきて手作業が辛くなったら導入。**Stripe Subscription はまだ使わず、年額一括前払い**で始める案。

### 3-1. フロー

```
[Landing Page] 「お申し込み」ボタン
    │
    ▼
[Server] /api/checkout/create
    Stripe Checkout Session 作成 (mode=payment, 価格=年額)
    metadata に companyName / email / plan を埋め込む
    │
    ▼
[Stripe Checkout 画面] カード入力 → 決済成功
    │
    ▼
[Stripe → Webhook] checkout.session.completed
    /api/stripe/webhook で受信
    │
    ▼
[Server] SignupInvitation を自動発行
    → メールで招待 URL を顧客に送付（Resend / SES）
    │
    ▼
[顧客] /signup?token=xxx でテナント作成（既存フロー流用）
```

### 3-2. 必要な実装

#### 環境変数 (`.env`)

```bash
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_ID_STANDARD="price_..."   # Stripe Dashboard で作成
RESEND_API_KEY="re_..."                # 招待メール送信用（任意）
```

#### 新規ファイル

```
src/app/api/checkout/create/route.ts   # Checkout Session 作成
src/app/api/stripe/webhook/route.ts    # Webhook 受信
src/lib/stripe.ts                      # Stripe client
src/lib/mail.ts                        # 招待メール送信ヘルパー
```

#### `src/lib/stripe.ts`

```ts
import Stripe from "stripe";
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
});
```

#### `src/app/api/checkout/create/route.ts`（イメージ）

```ts
import { stripe } from "@/lib/stripe";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { email, companyName } = await req.json();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: process.env.STRIPE_PRICE_ID_STANDARD!, quantity: 1 }],
    customer_email: email,
    metadata: { companyName, plan: "standard" },
    success_url: `${process.env.NEXTAUTH_URL}/signup/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXTAUTH_URL}/signup`,
  });
  return NextResponse.json({ url: session.url });
}
```

#### `src/app/api/stripe/webhook/route.ts`（イメージ）

```ts
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const token = randomBytes(24).toString("base64url");
    await prisma.signupInvitation.create({
      data: {
        token,
        companyName: session.metadata?.companyName ?? null,
        allowedEmail: session.customer_email?.toLowerCase(),
        plan: session.metadata?.plan ?? "standard",
        expiresAt: new Date(Date.now() + 14 * 86_400_000),
        createdBy: "stripe-webhook",
      },
    });
    // TODO: Resend で招待 URL をメール送付
  }
  return NextResponse.json({ received: true });
}
```

> **既存の `SignupInvitation` モデル + `/signup` フロー**をそのまま再利用できるのがポイント。

### 3-3. 必要な作業

1. `npm install stripe`
2. Stripe Dashboard で商品（Product）と価格（Price）を作成
3. Webhook エンドポイントを Stripe Dashboard に登録（`/api/stripe/webhook`）
4. メール送信サービス契約（Resend / SES / SendGrid）
5. ランディングページに「お申し込み」ボタン追加

---

## 4. Phase 2: Stripe Subscription（月額自動継続 + 未払い停止）

> 顧客が増えて、月額継続課金が必要になったら。

### 4-1. 追加されるイベント

```
checkout.session.completed         # 初回登録 → SignupInvitation 発行
customer.subscription.created      # サブスク開始 → Tenant.subscriptionStatus = "active"
customer.subscription.updated      # プラン変更
invoice.payment_succeeded          # 月次支払成功 → currentPeriodEnd 更新
invoice.payment_failed             # 支払失敗 → 7 日後に past_due
customer.subscription.deleted      # 解約 → suspendedAt 設定
```

### 4-2. テナント停止フロー

1. Webhook で `Tenant.subscriptionStatus` を更新
2. `middleware.ts` で `subscriptionStatus` が `active` / `trialing` 以外のテナントは `/billing/suspended` へリダイレクト
3. 管理者は `/billing` 画面で Stripe Customer Portal にアクセス → カード更新で復活

### 4-3. Stripe Customer Portal

- Stripe が標準提供する顧客向け管理画面
- カード変更・請求書ダウンロード・解約まですべて Stripe が UI を用意
- 自前でカード登録 UI を作る必要なし
- 設定は Dashboard → Settings → Billing → Customer portal

```ts
// /api/billing/portal
const session = await stripe.billingPortal.sessions.create({
  customer: tenant.stripeCustomerId,
  return_url: `${process.env.NEXTAUTH_URL}/settings/billing`,
});
return NextResponse.json({ url: session.url });
```

---

## 5. Phase 3: 高度な機能

| 機能 | Stripe 機能 | いつ |
| --- | --- | --- |
| プラン変更（Free / Pro / Enterprise） | Price と Tier 切替 | 顧客 ~50 |
| ユーザー数に応じた従量課金 | Subscription quantity / metered usage | 顧客 ~100 |
| 利用量課金（API コール、ストレージ等） | usage_records | 規模拡大時 |
| クーポン・トライアル | coupon / trial_period_days | マーケ施策時 |
| インボイス自動発行（PDF） | Invoice 機能 | B2B 案件 |
| 税金自動計算 | Stripe Tax（売上の 0.5%） | 海外顧客対応時 |
| 不正検知 | Radar | チャージバック多発時 |

---

## 6. 運用上の注意

### セキュリティ

- **Webhook 署名検証** は必須（`stripe-signature` ヘッダ + `STRIPE_WEBHOOK_SECRET`）
- Stripe API キーは `.env` のみ。**絶対に Git にコミットしない**（`.env` は `.gitignore` 済み）
- フロントエンドには `pk_...`（公開キー）のみ。`sk_...` はサーバ側のみ

### テスト

- テストカード `4242 4242 4242 4242`（任意の将来日付・任意の CVC）で全フロー検証可能
- Stripe CLI で Webhook をローカル転送:
  ```bash
  brew install stripe/stripe-cli/stripe
  stripe login
  stripe listen --forward-to localhost:3000/api/stripe/webhook
  ```

### 本番化前のチェック

- [ ] Stripe Dashboard で会社情報・本人確認・銀行口座登録
- [ ] 利用規約 / プライバシーポリシー / 特定商取引法に基づく表記を Web に掲載
- [ ] テストモードで全シナリオ通過（成功・失敗・解約・再開）
- [ ] Webhook の retry 耐性（idempotency key で重複処理防止）
- [ ] 領収書 / 請求書 PDF を Stripe で発行 or 自社で発行のどちらか決定

### 失敗パターン

- Webhook を受け損ねて DB が同期しない → 重要イベントは `dlq` テーブルに保存し、cron で再処理
- 同時刷新で二重課金 → Stripe の `idempotency_key` を使う
- カード期限切れで `invoice.payment_failed` が連発 → 顧客にメール通知 + Customer Portal 誘導

---

## 7. スキーマ拡張案

### Phase 1 では既存の `SignupInvitation` を流用するため変更不要

### Phase 2（Subscription）導入時

```prisma
model Tenant {
  // ...既存...
  stripeCustomerId      String?   @unique
  stripeSubscriptionId  String?   @unique
  subscriptionStatus    String?   // active / trialing / past_due / canceled / suspended
  currentPeriodEnd      DateTime?
  suspendedAt           DateTime?
  trialEndsAt           DateTime?
}

model BillingEvent {
  id          String   @id @default(cuid())
  tenantId    String?
  stripeEventId String @unique  // 重複処理防止
  type        String
  payload     Json
  receivedAt  DateTime @default(now())
}
```

---

## 8. 実装チェックリスト

### Phase 1 (Stripe Checkout)

- [ ] Stripe アカウント作成（テストモードのまま）
- [ ] `npm install stripe`
- [ ] Stripe Dashboard で Product / Price 作成
- [ ] `src/lib/stripe.ts` 作成
- [ ] `/api/checkout/create` 実装
- [ ] `/api/stripe/webhook` 実装（署名検証 + SignupInvitation 発行）
- [ ] Stripe CLI でローカルテスト
- [ ] メール送信実装（Resend 推奨、月 3,000 通まで無料）
- [ ] ランディングページに「お申し込み」ボタン
- [ ] 利用規約・プラポリ・特商法表記を整備
- [ ] Stripe を Live モードに切替

### Phase 2 (Subscription)

- [ ] `Tenant` に課金カラム追加 + マイグレーション
- [ ] Subscription 用 Webhook イベント処理（5 種類）
- [ ] `middleware.ts` で停止中テナントを `/billing/suspended` へ
- [ ] Customer Portal 連携（`/api/billing/portal`）
- [ ] 設定画面に「請求情報」リンク
- [ ] 障害時のリトライ / DLQ
- [ ] BillingEvent ログ + 監査画面

---

## 参考リンク

- Stripe 料金（日本）: https://stripe.com/jp/pricing
- Stripe Checkout ドキュメント: https://docs.stripe.com/payments/checkout
- Stripe Subscription: https://docs.stripe.com/billing/subscriptions/overview
- Stripe Customer Portal: https://docs.stripe.com/customer-management
- Webhook ベストプラクティス: https://docs.stripe.com/webhooks/best-practices
