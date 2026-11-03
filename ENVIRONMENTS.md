# Stordex Environment Guide

Stordex は Local / Staging / Production の 3 段階で運用します。

| Environment | Purpose | Database | Application |
|---|---|---|---|
| Local | 開発・自動テスト・機能確認 | PostgreSQL 16 local/Docker | Next.js dev server |
| Staging | UAT・外部動作確認 | Neon PostgreSQL | Vercel Preview |
| Production | 本番 | Aurora Serverless v2 PostgreSQL 16 | SST / OpenNext on AWS |

共通 runtime baseline は **Node.js 22** です。

## 1. Environment variables policy

アプリで使用する主要変数名は環境間で共通にします。

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `APP_ENV`

実 credential は Git に保存しません。

| Location | Commit | Usage |
|---|---|---|
| `.env.example` | yes | Local template |
| `.env.staging.example` | yes | Staging DB operation template |
| `.env.prod.example` | yes | Production DB emergency/admin template |
| `.env.local` / `.env` | no | Local values |
| `.env.staging` | no | Local → staging DB admin |
| `.env.prod` | no | Local → production DB admin only when explicitly required |
| Vercel Environment Variables | n/a | Staging runtime |
| SST Secrets/resources | n/a | Production runtime |

Production の `DATABASE_URL` は `sst.config.ts` が Aurora resource から組み立てます。`DatabaseUrl` という SST Secret は使用していません。

## 2. Local

### Requirements

- Node.js 22
- npm
- PostgreSQL 16 or Docker

### Docker PostgreSQL

```bash
docker run -d --name stordex-pg \
  -p 5432:5432 \
  -e POSTGRES_USER=stordex \
  -e POSTGRES_PASSWORD=stordex \
  -e POSTGRES_DB=stordex \
  postgres:16
```

### Recommended setup

```bash
./scripts/start-local.sh
```

または手動で:

```bash
cp .env.example .env
npm ci
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

通常 URL:

```text
http://localhost:3000
```

### Validation

```bash
npm audit --omit=dev --audit-level=low
npm run typecheck
npm test
npm run build
```

## 3. Staging (Neon + Vercel)

### Neon

PostgreSQL connection string を `.env.staging` と Vercel の Environment Variables に設定します。

例:

```env
DATABASE_URL="postgresql://<user>:<password>@<host>/<db>?sslmode=require"
NEXTAUTH_SECRET="<random secret>"
NEXTAUTH_URL="https://<staging-host>"
APP_ENV="staging"
```

### Vercel

Repository root が Next.js application root です。過去の `web-app/` directory を Root Directory に指定しないでください。

Vercel Project には最低限次を設定します。

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `APP_ENV=staging`

`.github/workflows/deploy-staging.yml` は `develop` push で Vercel Preview deployment を実行します。

### Staging DB operations (populated Neon Staging)

**現在のStagingを新規DBとして初期化しないこと。** 2026-11-03時点でNeon project `dry-feather-14704968`、branch `br-sparkling-boat-ao9nrctp`、database `neondb`には5件のPrisma migrationが適用済みで、UATデータが存在します。

以下は既存Stagingで**実行しない**でください：`npm run db:migrate:staging`、`npm run db:seed:staging`、`prisma db push`、`./scripts/start-staging.sh --schema`、`--seed`、既に成功済みの`--baseline`/`--inventory`。これらは既存データや履歴を変え得ます。

次の新規migration時は、レビュー済みPR・テストDBでのリハーサル・**新規取得した**Stagingバックアップと隔離復元テスト・Neon project/branch/dbの照合・オーナーの明示的な書込み承認・事後独立検証が必須です。以前の在庫移行専用`--check`は固定データ指紋を検証するため、UAT後の一般ヘルスチェックとして流用しません。

Stagingの正式URLは`https://staging.stordex.jp`です。2026-11-03時点ではPR #89のUAT済みVercel Preview（commit `0a052891`）へAliasを手動で割り当てています。新しいPreviewの作成だけではStaging Aliasが自動的に移るとは限りません。Alias更新時にproject/commit/環境を必ず確認し、Productionのdomainに触れないでください。

## 4. Production (AWS)

Production application/infrastructure は `sst.config.ts` が定義します。

主要構成:

```text
CloudFront / OpenNext
        |
Next.js Lambda + S3 assets
        |
       VPC
        |
Aurora Serverless v2 PostgreSQL 16
```

### Runtime configuration

SST secrets:

```text
NextAuthSecret
NextAuthUrl
```

`DATABASE_URL` は Aurora の host/user/password/database から SST が生成して Lambda へ渡します。

### Deployment

`.github/workflows/deploy-prod.yml` は **手動 `workflow_dispatch` 専用**です。`confirm_production=DEPLOY`、GitHub `production` Environment、Codex Astra Review PASS、オーナー承認が必須で、`main` pushだけでProduction deployは行いません。

Production workflow は:

1. GitHub Environment `production` の保護/承認
2. Node.js 22 setup
3. `npm ci`
4. production dependency audit
5. Prisma client generation
6. `npx sst deploy --stage prod`

を行います。

Repository側のProduction workflowは長期access keyではなく **GitHub Actions OIDC** を使用します。実AWS側のOIDC provider/最小権限roleの設定・検証はIssue #4の残課題です。

### Production DB schema changes

Repository には `prisma/migrations/` history があり、production schema change は `prisma migrate deploy` を正規経路とします。

2026-08-28 の AWS 確認では production Aurora は未作成でした。そのため initial migration は新規 empty database 用として作成済みです。ただし `sst.config.ts` が Aurora と application を同じ infrastructure rollout で作成し、DB は private VPC 内に置くため、通常の GitHub-hosted runner から migration を直接流す前提にはしません。

初回 production rollout は:

1. AWS account / region と OIDC deployment role を確認
2. SST deploy で Aurora を作成
3. VPC 内から接続できる controlled migration execution path で `prisma migrate deploy`
4. `prisma migrate status` を確認
5. application smoke test
6. Aurora backup retention / PITR を確認

の順で行います。詳細は [`DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md) と [`AWS_DEPLOY.md`](AWS_DEPLOY.md) を参照してください。

## 5. Branch flow

推奨:

```text
feature/maintenance branch
        |
        v
Pull Request + CI
        |
        v
develop (staging verification when needed)
        |
        v
main
        |
        v
production approval + SST deploy
```

小規模な保守で `develop` を経由しない場合でも、PR CI を通し、production deployment が発生することを確認してから main に merge してください。

## 6. Environment checklist

| Check | Local | Staging | Production |
|---|---|---|---|
| Node.js | 22 | 22 | 22 |
| DB | PostgreSQL 16 | Neon/PostgreSQL | Aurora PostgreSQL 16 |
| `NEXTAUTH_SECRET` | local-only | Vercel secret | SST Secret |
| `NEXTAUTH_URL` | localhost | staging URL | production URL |
| DB destructive operation | disposable | verify first | backup + explicit review required |
| Dependency audit | CI/local | CI before merge | deploy workflow gate |
| Logs | terminal | Vercel | AWS/CloudWatch |

## 7. Related documents

- [`README.md`](README.md)
- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`SECURITY.md`](SECURITY.md)
- [`AWS_DEPLOY.md`](AWS_DEPLOY.md)
- [`TEST_PLAN.md`](TEST_PLAN.md)
