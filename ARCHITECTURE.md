# Stordex Architecture

この文書は、Stordex の現行 Web アプリケーション構成、データ境界、認証、環境、デプロイ経路を保守担当者向けにまとめたものです。

## 1. システム概要

Stordex は物流・卸売業向けのマルチテナント受発注・在庫管理 SaaS です。旧 C# Windows Forms アプリは `original-app/` に参照用として残し、現行システムは Next.js で実装しています。

```text
Browser
  |
  v
Next.js 16 / React 19
  |-- NextAuth Credentials + JWT
  |-- Server Components / Server Actions
  |-- Route Handlers
  |
  v
Prisma 5
  |
  v
PostgreSQL 16
```

Production は SST v3 / OpenNext を使用し、AWS 上で Next.js と Aurora Serverless v2 を稼働させます。

```text
Internet
  |
CloudFront
  |
Next.js / Lambda + S3 assets
  |
VPC
  |
Aurora Serverless v2 PostgreSQL 16
```

## 2. 主要技術

- Node.js 22
- Next.js 16.3.x
- React / React DOM 19.2.x
- TypeScript
- NextAuth.js 4.24.x
- Prisma 5.22.x
- PostgreSQL 16
- Zod
- Vitest
- Tailwind CSS
- SST v3 / OpenNext

依存バージョンの正本は `package.json` と `package-lock.json` です。

## 3. アプリケーション構成

```text
src/app/                  App Router pages / route handlers
src/app/(app)/            認証後の業務画面
src/app/api/              認証、signup、legacy XML import
src/app/print/            A4 帳票印刷ビュー
src/lib/                  DB、認証、session、業務共通処理
src/components/           共通 UI
src/types/                NextAuth 型拡張など
prisma/schema.prisma      DB schema
prisma/migrations/        committed Prisma migration history
prisma/seed.ts            ローカル/検証用 seed
scripts/                  招待・テナント運用 CLI
sst.config.ts             AWS production infrastructure/application config
original-app/             旧 C# WinForms アプリ（移行参照用）
```

## 4. 認証とセッション

ログインは Credentials Provider を使用し、次の 3 要素でユーザーを特定します。

- tenant slug
- email
- password

パスワードは bcrypt で検証します。ログイン成功後の JWT には user ID、tenant ID、tenant slug、tenant name、role を保持します。

`requireSession()` は認証状態だけでなく Tenant の `status` も DB で再確認します。`ACTIVE` 以外の Tenant は業務画面へ進めません。

サーバー側の tenant-scoped 処理は原則として `requireTenant()` を入口にします。

## 5. マルチテナント境界

### 基本ルール

業務データは Tenant をセキュリティ境界とします。Tenant 配下の主要テーブルは `tenantId` を持ち、コード体系も `tenantId + code` 等の複合一意制約で分離します。

DB クエリでは、ブラウザから渡された tenant ID を信用せず、認証セッションから得た `tenantId` を使用します。

### ID 参照時のルール

`customerId`、`supplierId`、`businessUnitId`、`itemId` のような relation ID は、ID が存在するだけでは不十分です。書き込み前に **その ID が現在の tenant に属すること**を確認します。

共通ガードは `src/lib/tenant-resources.ts` にあります。

このチェックは現在、受注・発注・見積・請求・商品と仕入先の関連付けで使用します。

### 読み取り

詳細画面・印刷画面は原則として次の形で取得します。

```ts
where: { id, tenantId }
```

新しい詳細画面/API を追加するときも同じ境界を維持してください。

## 6. ロール

DB 上のロールは次の 3 種類です。

- `OWNER`
- `ADMIN`
- `STAFF`

現時点では Tenant 分離が主要な認可境界です。`OWNER` / `ADMIN` / `STAFF` の細かな業務権限は全面的には実装されていません。

legacy XML import は大量データを書き換える管理操作のため `OWNER` / `ADMIN` のみに制限しています。

今後ロール別アクセスを拡張する場合は、UI を隠すだけではなく Server Action / Route Handler 側でも必ず認可してください。

## 7. 招待 signup

新規 Tenant 作成は `SignupInvitation` を使います。

招待には期限、利用済み時刻、許可 tenant slug、許可 email を設定できます。signup 時は Tenant 作成と invitation claim を 1 トランザクションで処理し、同一トークンの同時再利用を防止します。

## 8. legacy XML import

`/settings/legacy-import` は旧 C# アプリから Customer / Supplier / Item / Order XML を取り込みます。

安全上の前提:

- OWNER / ADMIN のみ
- 現在の tenant 配下だけに import
- request / file size を制限
- XML entity processing を無効化
- 既存コードは skip

大量・不明な XML は staging またはバックアップ取得済み環境で先に検証してください。

## 9. 環境

### Local

- PostgreSQL 16 local/Docker
- `next dev`
- `.env`

### Staging

- Neon PostgreSQL
- Vercel Preview
- `develop` branch deployment

### Production

- AWS
- SST / OpenNext
- Aurora Serverless v2 PostgreSQL 16
- `main` branch deployment workflow
- GitHub Environment `production` で承認を要求する運用

詳細は `ENVIRONMENTS.md` と `AWS_DEPLOY.md` を参照してください。

## 10. CI / deployment

`.github/workflows/ci.yml` は Node.js 22 + PostgreSQL 16 で次を実行します。

1. `npm ci`
2. production dependency audit
3. full dependency audit report
4. Prisma generate / `migrate deploy` / migration status / schema drift check
5. TypeScript check
6. Vitest
7. Next.js production build
8. build が tracked files を変更していないことの確認

Production deploy は deploy 前にも production dependency audit を実行します。

## 11. DB schema 運用上の注意

Repository には `prisma/migrations/` history を保持し、shared/staging/production の schema 変更は Prisma Migrate で管理します。

2026-08-28 の AWS 確認では Stordex production Aurora は存在しなかったため、既存 populated DB の baseline ではなく、現在の `schema.prisma` から empty PostgreSQL 向け initial migration を作成しました。

CI は PostgreSQL 16 に committed migrations を `prisma migrate deploy` し、migration status と schema drift を確認します。`prisma db push` は disposable local DB に限定し、staging/production の通常手段には使用しません。

Production は private Aurora のため、初回 AWS rollout 後の migration は VPC 内から接続できる controlled execution path で行います。詳細は `DATABASE_MIGRATIONS.md` を参照してください。

## 12. 運用上の残課題

- GitHub Actions の AWS 認証を access key secrets から GitHub OIDC + least-privilege IAM Role へ移行する（PR #7 / Issue #4）。
- 初回 production Aurora 作成後、VPC 内から `prisma migrate deploy` を実行する経路を確定・検証する（Issue #5）。
- Aurora backup retention / PITR / restore drill を production resource 上で確認する。
- OWNER / ADMIN / STAFF の詳細権限表を要件確定後にサーバー側認可へ反映する。
