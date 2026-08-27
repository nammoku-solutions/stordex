# Stordex

物流・卸売業向けのマルチテナント受発注・在庫管理 SaaS です。旧 Windows Forms C# アプリを Web アプリとして再構築しており、旧実装は移行参照用として [`original-app/`](original-app/) に残しています。

## Current stack

- **Node.js 22**
- **Next.js 16.3 / React 19.2 / TypeScript**
- **PostgreSQL 16 + Prisma 5**
- **NextAuth.js 4** (Credentials + JWT session)
- **Zod**
- **Vitest**
- **Tailwind CSS**
- **SST v3 / OpenNext** for AWS production
- **GitHub Actions** for CI/CD

依存バージョンの正本は `package.json` / `package-lock.json` です。

## Documentation

| Document | Purpose |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 現行構成、認証、マルチテナント境界、環境、残課題 |
| [`SECURITY.md`](SECURITY.md) | Tenant isolation、認可、依存監査、変更時チェックリスト |
| [`USER_MANUAL.md`](USER_MANUAL.md) | 利用者向け操作マニュアル |
| [`ENVIRONMENTS.md`](ENVIRONMENTS.md) | Local / Staging / Production の環境構成 |
| [`AWS_DEPLOY.md`](AWS_DEPLOY.md) | AWS / SST デプロイ手順 |
| [`BILLING.md`](BILLING.md) | 請求、入金確認、テナント停止/再開運用 |
| [`TEST_PLAN.md`](TEST_PLAN.md) | テスト方針 |
| [`TEST_CASES.md`](TEST_CASES.md) | 機能・総合テストケース |
| [`Requirement.md`](Requirement.md) | 要件・移行元の背景 |

## Repository layout

```text
src/app/                    Next.js App Router
src/app/(app)/              認証後の業務画面 / Server Actions
src/app/api/                Auth / signup / legacy import APIs
src/app/print/              帳票印刷ビュー
src/components/             共通 UI
src/lib/                    DB / auth / session / tenant guards / utilities
src/types/                  型拡張
prisma/schema.prisma        PostgreSQL schema
prisma/seed.ts              ローカル・検証用 seed
scripts/                    招待発行 / テナント停止・再開
original-app/               旧 C# WinForms 実装（参照用）
.github/workflows/          CI / staging / production workflows
sst.config.ts               AWS application/infrastructure config
```

## Local development

### Requirements

- Node.js 22
- npm
- PostgreSQL 16 (local または Docker)

### Recommended one-shot setup

```bash
./scripts/start-local.sh
```

DB を作り直す場合:

```bash
./scripts/start-local.sh --reset
```

準備だけ行う場合:

```bash
./scripts/start-local.sh --no-dev
```

### Manual setup

```bash
cp .env.example .env
npm ci
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

開発サーバーは通常 `http://localhost:3000` です。

`.env.example` のローカル値は開発専用です。本番 credential / secret を repository に保存しないでください。

## Main application areas

| Path | Function |
|---|---|
| `/login` / `/signup` | Tenant-aware login / invitation signup |
| `/dashboard` | サマリー、受注、在庫アラート |
| `/orders` | 受注 CRUD / status transition |
| `/quotations` | 見積 CRUD |
| `/purchase-orders` | 発注 CRUD / 入荷処理 |
| `/invoices` | 月次請求書 |
| `/customers` | 得意先マスタ |
| `/suppliers` | 仕入先マスタ |
| `/items` | 商品マスタ |
| `/inventory` | 在庫移動 |
| `/reports/products` | 商品別レポート |
| `/settings/business-units` | 事業所・請求書発行元 |
| `/settings/legacy-import` | 旧 C# XML import |
| `/print/...` | A4 印刷 / browser PDF 保存 |

## Multi-tenant security model

Tenant がデータ境界です。

認証後のサーバー処理は `requireTenant()` から現在の `tenantId` を取得し、DB query を tenant scope します。ブラウザから送られた tenant ID を認可に使用しません。

また relation ID を使う書き込みでは、対象 record が現在の Tenant に属することを確認します。たとえば `customerId`、`supplierId`、`businessUnitId`、`itemId` を ID の存在だけで信用してはいけません。

共通 ownership guard は `src/lib/tenant-resources.ts` にあります。詳細は [`SECURITY.md`](SECURITY.md) を参照してください。

## Roles

データモデルには次の role があります。

- `OWNER`
- `ADMIN`
- `STAFF`

現時点では Tenant isolation が主要な認可境界で、細かな RBAC は全機能には適用されていません。legacy XML import は高権限操作のため OWNER / ADMIN のみに制限しています。

新しい管理機能を追加するときは、画面を隠すだけでなく server-side authorization を実装してください。

## Legacy XML import

`/settings/legacy-import` から旧アプリの Customer / Supplier / Item / Order XML を取り込めます。

- OWNER / ADMIN only
- current Tenant のみに書き込み
- request / file size limit あり
- XML entity processing 無効
- 重複コードは skip

Production へ大量 import する前に staging と backup で検証してください。

## Tests and validation

ローカルでの標準確認:

```bash
npm ci
npm audit --omit=dev --audit-level=low
npm run db:generate
npm run typecheck
npm test
npm run build
```

CI は PostgreSQL 16 service を立ち上げ、schema apply、production dependency audit、typecheck、test、production build を実行します。

## Environments

| Environment | DB | Application | Purpose |
|---|---|---|---|
| Local | PostgreSQL 16 | `next dev` | 開発・自動テスト |
| Staging | Neon | Vercel Preview | UAT / integration verification |
| Production | Aurora Serverless v2 PostgreSQL 16 | SST / OpenNext on AWS | 本番 |

詳細は [`ENVIRONMENTS.md`](ENVIRONMENTS.md) を参照してください。

## CI/CD

### CI

`.github/workflows/ci.yml`

- Node.js 22
- PostgreSQL 16
- `npm ci`
- blocking production dependency audit
- full audit report
- Prisma generate / schema apply to test DB
- TypeScript check
- Vitest
- Next.js production build
- tracked files が build で書き換わらないことを確認

### Staging

`develop` push で `.github/workflows/deploy-staging.yml` が Vercel Preview を更新します。

### Production

`main` push で `.github/workflows/deploy-prod.yml` が対象になります。GitHub Environment `production` の保護ルールを使用し、SST deployment 前に production dependency audit を実行します。

AWS credential は現行 workflow では GitHub Secrets の access key を使用しています。実 AWS IAM 構成を確認した上で、将来は GitHub OIDC + 最小権限 IAM Role へ移行することを推奨します。

## AWS production

Production は [`sst.config.ts`](sst.config.ts) で概ね次を構成します。

```text
CloudFront / OpenNext
        |
   Next.js Lambda
        |
       VPC
        |
Aurora Serverless v2 PostgreSQL 16
```

SST secrets:

- `NextAuthSecret`
- `NextAuthUrl`

`DATABASE_URL` は Aurora resource から `sst.config.ts` が組み立ててアプリへ渡します。

詳しい手順は [`AWS_DEPLOY.md`](AWS_DEPLOY.md) を参照してください。

## Database schema changes

現在は `prisma/schema.prisma` と `prisma db push` を中心に運用されており、repository に `prisma/migrations/` history はありません。

既存 production DB がある状態で migration history を導入するときは、production schema を確認して baseline を作る必要があります。初回 migration をそのまま production に適用しないでください。

この点は [`ARCHITECTURE.md`](ARCHITECTURE.md) に運用上の残課題として記録しています。

## Print / PDF

帳票は browser print を使用し、Lambda で Headless Chromium を動かしません。

- 納品書: `/print/orders/[id]`
- ピッキングリスト: `/print/orders/[id]/picking`
- 見積書: `/print/quotations/[id]`
- 発注書: `/print/purchase-orders/[id]`
- 請求書: `/print/invoices/[id]`

ブラウザの「PDF として保存」を利用できます。

## Maintenance priorities

既存 production の状態確認が必要なため、自動で変更しない項目があります。

1. AWS access key authentication → GitHub OIDC + least-privilege IAM role
2. Prisma migration baseline
3. OWNER / ADMIN / STAFF の詳細 RBAC
4. Aurora backup retention と restore drill

これらを変更する場合は、AWS / DB の実状態とバックアップを確認してから進めてください。
