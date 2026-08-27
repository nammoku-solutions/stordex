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

### Staging DB setup

```bash
cp .env.staging.example .env.staging
npm run db:push:staging
npm run db:seed:staging
```

`db push` は staging/local の高速な schema synchronization 用です。

### Helper script

```bash
./scripts/start-staging.sh --schema
./scripts/start-staging.sh --seed
./scripts/start-staging.sh --studio
./scripts/start-staging.sh --deploy
./scripts/start-staging.sh --status
```

スクリプト内容と現在の branch 運用が一致することを確認してから実行してください。

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

`main` push で `.github/workflows/deploy-prod.yml` が対象になります。

Production workflow は:

1. GitHub Environment `production` の保護/承認
2. Node.js 22 setup
3. `npm ci`
4. production dependency audit
5. Prisma client generation
6. `npx sst deploy --stage prod`

を行います。

現行 AWS 認証は GitHub Secrets の access key を利用しています。実 IAM 構成を確認してから GitHub OIDC + least-privilege IAM Role へ移行してください。

### Production DB schema changes

**注意:** 現在 repository に `prisma/migrations/` history はありません。

`npm run db:push:prod` は script として残っていますが、既存 production DB へ schema を反映する通常手段として無条件に実行しないでください。

production schema change の前に:

1. production backup / restore point を確認
2. current database schema と `prisma/schema.prisma` を比較
3. migration baseline 方針を決める
4. staging clone/相当環境で検証
5. maintenance window / rollback を準備

を行います。

baseline を作るまでは、本番 DB 変更は個別レビュー対象です。

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
