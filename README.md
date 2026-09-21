# Stordex

物流・卸売業向けのマルチテナント受発注・在庫管理SaaSです。旧Windows
FormsアプリをNext.jsへ再構築しています。

## Stack

- Node.js 22 / Next.js 16 / React 19 / TypeScript
- Prisma 7 / PostgreSQL
- NextAuth.js 4
- SST 4 / OpenNext / AWS Lambda / CloudFront / S3
- Supabase PostgreSQL
- GitHub Actions + AWS OIDC

## Environments

LocalはローカルPostgreSQL、Staging/Productionはそれぞれ独立した
Supabase projectとSST stageを使用します。AWS regionは
`ap-southeast-2`です。詳細は
[`ARCHITECTURE.md`](ARCHITECTURE.md)、
[`ENVIRONMENTS.md`](ENVIRONMENTS.md)、
[`AWS_DEPLOY.md`](AWS_DEPLOY.md)を参照してください。

## Local development

```bash
cp .env.example .env
npm ci
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

## Validation

```bash
npm audit --omit=dev --audit-level=low
npm run typecheck
npm test
npm run build
```

Committed Prisma migrations are the schema source of truth outside local
development. Tenant identity must always be derived from the authenticated
server session; client-supplied tenant IDs are not authorization evidence.

## Deployment

- `main` push: migrate Supabase staging and deploy SST stage `staging`.
- Production: protected manual workflow with `DEPLOY` confirmation.
- Git repositories remain private.
- Vercel is no longer part of the deployment path.
