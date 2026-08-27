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
4. Prisma generate / test DB schema apply
5. TypeScript check
6. Vitest
7. Next.js production build
8. build が tracked files を変更していないことの確認

Production deploy は deploy 前にも production dependency audit を実行します。

## 11. DB schema 運用上の注意

現時点の repository には Prisma migration history (`prisma/migrations/`) がなく、環境セットアップは主に `prisma db push` を使用しています。

既存 production DB がある状態で migration history を後付けする場合は、現在の DB schema を基準に baseline migration を設計し、`prisma migrate resolve` 等を用いて慎重に導入してください。production に対して機械的に初回 migration を適用してはいけません。

## 12. 運用上の残課題

- GitHub Actions の AWS 認証は現状 access key secrets。将来は GitHub OIDC + 最小権限 IAM Role へ移行する。
- Prisma migration baseline を production 状態と照合して整備する。
- OWNER / ADMIN / STAFF の詳細権限表を要件確定後にサーバー側認可へ反映する。
- Aurora backup retention / restore drill を production 要件として確定する。

これらは既存 production の IAM/DB 状態確認が必要なため、コードだけを見て自動変更しないこと。
