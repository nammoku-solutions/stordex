# Stordex AWS Deployment Runbook

Stordex production は SST 4.17.1 / OpenNext を使用して AWS へデプロイします。構成の正本は [`sst.config.ts`](sst.config.ts) です。SST CLI は repository の `devDependencies` に exact version で固定し、`npm ci` 後の `npx sst` はそのローカル版を使用します。

## 1. Current production architecture

```text
User
  |
CloudFront / OpenNext
  |
Next.js Lambda + S3 assets
  |
VPC
  |
Aurora Serverless v2 PostgreSQL 16
```

`sst.config.ts` は production で resource removal policy を retain にしており、誤った stack removal がデータ削除へ直結しないようにしています。

## 2. Requirements

- Node.js 22
- npm
- AWS account
- repository で固定された SST 4.17.1 CLI (`npm ci` で導入)
- SST access to the target AWS account
- GitHub Environment `production` configured for production deployment approval

AWS region は `sst.config.ts` の provider 設定に合わせて **`ap-northeast-1`** を使用します。GitHub Actions 側も同じ値を固定しており、`AWS_REGION` Secret は不要です。

本番操作では個人 IAM user に広い AdministratorAccess を恒常付与する運用は避けてください。

## 3. SST secrets

アプリが使用する SST secrets:

```text
NextAuthSecret
NextAuthUrl
```

初期設定例:

```bash
npx sst secret set NextAuthSecret "$(openssl rand -base64 32)" --stage prod
npx sst secret set NextAuthUrl "https://example.invalid" --stage prod
```

初回 deploy 後に production URL が確定したら `NextAuthUrl` を正式 URL へ更新し、必要に応じて再 deploy します。

Secret の値を GitHub Issue、CI log、README、shell history の共有テキストへ貼り付けないでください。

## 4. DATABASE_URL

Production application の `DATABASE_URL` は手動 SST Secret ではありません。

`sst.config.ts` が Aurora resource の connection information から組み立てて Next.js runtime environment へ渡します。

したがって次のような secret は現行構成では不要です。

```text
DatabaseUrl
```

ローカル管理作業で production DB connection string が必要になる場合だけ `.env.prod` 等へ一時設定し、commit しません。

## 5. GitHub Actions production deployment

**現行の `.github/workflows/deploy-prod.yml` は手動 `workflow_dispatch` 専用であり、`main`へのpushで本番デプロイしません。** `confirm_production=DEPLOY`、GitHub `production` Environmentの保護、Codex Astra全体レビューPASS、およびオーナーの明示的な承認が必要です。

実行経路: 手動トリガー → Environment保護 → GitHub Actions OIDCによるAWS IAM Role引受 → `aws sts get-caller-identity` → Node 22 / `npm ci` → production dependency audit → `prisma generate` → `npx sst deploy --stage prod`。

workflowは**アプリ/インフラのデプロイのみ**で、VPC内のプライベートAuroraに対するPrismaマイグレーションは別の制御された手順です。初回リリースで実行順・接続方法・リカバリー/バックアップ検証を決定し、個別承認を受けてください。

## 6. AWS authentication

現行GitHub workflowは長期アクセスキーを使わず、GitHub Actions OIDCによる`aws-actions/configure-aws-credentials`を使用します。GitHub `production` Environment secret `AWS_DEPLOY_ROLE_ARN` と、AWS側のOIDC providerおよび最小権限のIAM Role/Trust設定が必要です（Issue #4）。**repoのワークフローがOIDC対応していることは、実AWS側の設定完了や動作検証を意味しません。** Regionは`ap-northeast-1`に固定。

アクセスキーやSecret値をIssue/CIログ/READMEに貼り付けないでください。

## 7. Manual deployment

障害対応や初期構築など、明確な理由がある場合だけ local CLI から実施します。

```bash
npm ci
npm audit --omit=dev --audit-level=low
npx sst deploy --stage prod
```

実行前に `aws sts get-caller-identity` 等で対象 account を必ず確認してください。

## 8. Database schema changes

### Migration source of truth

Repository は `prisma/migrations/` を schema history として保持します。2026-08-28 の AWS 確認では Stordex production Aurora は存在しなかったため、現在の `schema.prisma` から empty PostgreSQL 向け initial migration を作成済みです。

CI は PostgreSQL 16 に committed migrations を適用し、`prisma migrate status` と schema drift を検査します。

### Shared environment rules

- Local disposable DB: `prisma db push` を使用可能
- Staging: `prisma migrate deploy`
- Production: `prisma migrate deploy`
- `--accept-data-loss` を通常運用で使用しない
- 適用済み migration を書き換えず、新しい migration を追加する

### First production rollout

`sst.config.ts` は Aurora と Next.js application を同じ AWS rollout で作成します。Aurora は private VPC 内にあるため、初回は次の順で行います。

1. AWS account / region と production deployment identity を確認
2. SST deploy で Aurora を作成
3. VPC 内から接続できる controlled execution path を使い `prisma migrate deploy`
4. `prisma migrate status` を確認
5. representative read/write smoke test
6. Aurora automated backup retention / PITR を確認

GitHub-hosted runner から private Aurora へ直接接続できると仮定しないでください。migration のために Aurora を public access へ変更しません。

具体的な migration 運用は [`DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md) を参照してください。Production execution と backup/PITR の初回確認は GitHub Issue #5 で追跡します。

## 9. Connecting to Aurora for administration

Aurora は VPC 内にある前提なので、ローカル PC から直接接続できるとは限りません。

以前の文書にあった SSM port forwarding 例は、接続先となる SSM-managed host が実際に存在する場合にしか利用できません。現行 `sst.config.ts` は bastion EC2 を作成していません。

必要な DB maintenance 方法は production network の実状態を確認して決めてください。候補には次があります。

- 一時的な SSM-managed bastion / admin host
- VPC 内の controlled migration task
- SST/AWS の既存接続機構

接続のためだけに Aurora を public access に変更しないでください。

## 10. Backup / recovery

本番運用開始前に少なくとも次を確認してください。

- Aurora automated backup retention
- PITR が期待通り利用できること
- restore test の手順
- stack/resource removal 時の retain behavior
- 誤操作時の recovery owner

`sst.config.ts` に backup retention が明示されていない場合、実 AWS resource の設定を確認してから要件をコード化してください。

## 11. Removing resources

```bash
npx sst remove --stage prod
```

production は retain policy を使うため、command 実行後も一部 data resources が残る可能性があります。

**残った Aurora / storage を手動削除する前に backup と依存関係を確認してください。**

## 12. Production deployment checklist

Before:

- target branch / commit is correct
- CI passed
- production dependency audit passed
- AWS account/stage is correct
- DB schema changeがある場合は committed migration、backup/PITR、VPC内 migration execution plan がある
- `NextAuthUrl` / secret configuration is valid

After:

- application opens
- login works
- tenant isolation smoke test
- `prisma migrate status` が期待通り
- core order/inventory flow
- print pages
- CloudWatch/application errors
- unexpected AWS resource replacement/deletionがない

関連資料: [`ARCHITECTURE.md`](ARCHITECTURE.md), [`SECURITY.md`](SECURITY.md), [`ENVIRONMENTS.md`](ENVIRONMENTS.md)
