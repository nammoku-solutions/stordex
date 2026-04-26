# Stordex — AWS デプロイ手順（SST v3 / OpenNext + Aurora Serverless v2）

Next.js を **Lambda + CloudFront + S3**、DB を **Aurora Serverless v2 (PostgreSQL)** で運用します。

## 構成

```
ユーザー
  │
  ▼
CloudFront ──► S3 (静的アセット)
  │
  ▼
Lambda (Next.js / OpenNext)
  │  VPC
  ▼
Aurora Serverless v2 (PostgreSQL 16)
```

## 月額コスト目安（東京リージョン / 1 ユーザー社内利用）

| サービス | 内容 | 概算 |
|---------|------|-----|
| Lambda | リクエスト数百〜数千/日 | 〜¥500 |
| CloudFront | 数 GB 転送 | 〜¥1,000 |
| S3 | 〜1GB | 〜¥30 |
| Aurora Serverless v2 | min 0.5 ACU 24h 稼働 | **¥6,000〜8,000** |
| VPC NAT Gateway | 1 個 | **¥4,500〜** |
| Secrets Manager | 数件 | 〜¥150 |
| **合計** | | **¥11,000〜15,000/月** |

> **コスト削減オプション**
> - 開発・検証ステージは `min: "0 ACU"`（自動 pause）で約 ¥0/月（コールドスタート数秒）
> - NAT Gateway を NAT インスタンス（t4g.nano, ¥600/月）に置換
> - 個人運用なら Neon Free + Lambda + CloudFront で **¥1,000/月以下** に縮小可

## 前提

- AWS アカウント / IAM ユーザー（`AdministratorAccess` または同等）
- AWS CLI 設定済み (`aws configure`)
- Node.js 20+

## 1. SST 初期化（初回のみ）

```bash
cd web-app
npm install
npx sst init        # → 既存の sst.config.ts はそのまま使われる
```

## 2. シークレット登録

```bash
# NEXTAUTH_SECRET（必須・32 byte ランダム）
npx sst secret set NextAuthSecret "$(openssl rand -base64 32)" --stage prod

# NEXTAUTH_URL は初回デプロイ後に判明する CloudFront URL を入れます。
# 一旦プレースホルダで登録 → デプロイ → 取得 → 再登録 → 再デプロイ。
npx sst secret set NextAuthUrl "https://example.invalid" --stage prod
```

## 3. デプロイ

```bash
npx sst deploy --stage prod
```

デプロイ完了時に `Web.url` と `Db.host` が表示されます。

## 4. CloudFront URL を NEXTAUTH_URL に反映

```bash
# 例: https://d1xxxxxx.cloudfront.net
npx sst secret set NextAuthUrl "https://d1xxxxxx.cloudfront.net" --stage prod
npx sst deploy --stage prod
```

カスタムドメイン（例: `https://app.stordex.jp`）を設定する場合は ACM 証明書 + Route53 を `sst.aws.Nextjs` の `domain` に渡してください。最終的にはこの URL を NEXTAUTH_URL にします。

## 5. DATABASE_URL（Prisma マイグレーション用）

`sst.config.ts` でアプリ環境変数 `DATABASE_URL` は Aurora から自動生成されます。**ローカルから本番 DB にスキーマ適用する場合のみ**手動で URL が必要です。

### 本番 Aurora の接続情報を取得

```bash
# SST の出力から
npx sst secret list --stage prod
# あるいは AWS コンソール → RDS → クラスタ「stordex-prod-Db…」→ エンドポイント
# パスワードは Secrets Manager（rds!cluster-… キー）から取得
```

VPC 内 DB なので、**ローカルから直接マイグレーションは原則できません**。以下のいずれかを使ってください。

#### 方法 A: SSM Session Manager 経由のポートフォワード（推奨）

```bash
# Bastion Lambda 不要。RDS Data API でも可。
aws ssm start-session \
  --target i-xxxxxxxx \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<aurora-endpoint>"],"portNumber":["5432"],"localPortNumber":["5432"]}'

# 別シェルで
DATABASE_URL="postgresql://postgres:<password>@localhost:5432/stordex?sslmode=require" \
  npx prisma migrate deploy
DATABASE_URL="postgresql://postgres:<password>@localhost:5432/stordex?sslmode=require" \
  npm run db:seed
```

#### 方法 B: Lambda タスクで実行（CI で推奨）

`sst.config.ts` に `sst.aws.Function` で migration runner を足し、`npx sst run` で実行。

## 6. ローカル `.env`（開発用）

`.env` は **コミット禁止**（`.gitignore` 済）。ローカル開発では Neon Free などの開発用 DB を指してください。

```env
DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"
NEXTAUTH_SECRET="<openssl rand -base64 32 の出力>"
NEXTAUTH_URL="http://localhost:3000"
```

## NEXTAUTH_SECRET の生成

```bash
# Mac / Linux
openssl rand -base64 32

# クロスプラットフォーム（Node があれば）
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## バックアップ

Aurora は自動バックアップ（PITR）が既定で 1 日。本番では 7〜30 日に延長してください。

```ts
// sst.config.ts の Aurora ブロックに追加可
new sst.aws.Aurora("Db", {
  // ...
  // backup: { retention: "30 days" }, // 将来追加
});
```

## 削除（コスト停止）

```bash
npx sst remove --stage prod
```

`removal: "retain"` の Aurora と S3 はコンソールから手動削除してください（誤削除防止）。
