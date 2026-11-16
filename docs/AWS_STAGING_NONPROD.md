# Stordex — AWS Staging on NonProd

## Scope

Use the active `staging` branch for the AWS parallel rehearsal. Keep `staging.stordex.jp`, existing Vercel Staging and its Neon database unchanged until the AWS rehearsal has passed. No AWS Production operations are in scope. This runbook does not provision infrastructure.

The candidate baseline in `sst.config.ts` is SST 4.17.1 / OpenNext with CloudFront, Next.js/Lambda, S3 assets, a two-AZ Tokyo VPC with one managed NAT Gateway per AZ, and Aurora PostgreSQL 16 Serverless v2. The new stage is `aws-staging`. It uses Aurora PostgreSQL **16.8 LTS**, seven-day backup retention, `0–1 ACU`, retained resources, and a stage-specific AWS provider account allowlist. AWS lists 16.8 as supported, but Tokyo orderability must be checked before deployment. The legacy Production pin of 16.4 is unchanged and needs separate release review. Use distinct state, domain, IAM roles, secrets and data. Use only synthetic fixtures. Keep staged release flags off except during an explicitly scoped UAT.

## 1. Verify an authenticated NonProd session

With the account access manager setup, open the assigned **NonProd** role in the browser. On the operator's WSL terminal, use AWS CLI v2.32.0 or later and select that exact console session when prompted. Do not use `aws configure sso` for roles assigned through account access manager.

```bash
aws --version
aws configure set region ap-northeast-1 --profile nammoku-nonprod
aws login --profile nammoku-nonprod --remote
aws sts get-caller-identity --profile nammoku-nonprod --query Account --output text
```

`--remote` is useful if WSL cannot open a browser. Complete authentication in the browser and enter the code into the requesting terminal only. Check the result against the new NonProd ID in AWS Organizations. The shell profile name alone does not prove the destination.

For Production, if needed later, use a separate `nammoku-prod` profile, select a Production session and check its account ID separately. Use explicit `--profile` on CLI calls and avoid making Production the default. Deployment in GitHub Actions uses its own OIDC role and does not depend on an operator's CLI profile.

From the repository checkout, run the read-only preflight using the NonProd account ID verified in Organizations:

```bash
bash scripts/aws-staging-preflight.sh <NONPROD_ACCOUNT_ID> nammoku-nonprod
```

The script checks STS first, then checks Tokyo orderability and expected capacity for the Aurora minor version pinned in the SST configuration. Stop on any error. If the pin is unavailable, choose a currently orderable PostgreSQL 16 minor with the needed features and review the change before deployment.

Set `STORDEX_AWS_STAGING_ACCOUNT_ID` to the independently verified NonProd ID when invoking SST for `aws-staging`. The Pulumi AWS provider checks this value, but the STS preflight is still needed because SST can do account-scoped bootstrapping outside the provider. Confirm the SST process uses the same credentials as the preflight. Support for an `aws login` CLI session is SDK/version-specific. Verify the effective identity before running SST, or use the dedicated CI OIDC path when it is ready.

## 2. Estimate cost before creating the stack

Tokyo Standard Aurora and zonal NAT public on-demand list rates from the [AWS RDS price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ap-northeast-1/index.json), [AWS EC2 price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/ap-northeast-1/index.json) and [AWS VPC price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonVPC/current/ap-northeast-1/index.json), checked 2026-11-16. 730 hours/month, USD, before tax/credits, illustrative not a quote.

| Component | Assumption | USD/month |
|---|---|---:|
| Zonal managed NAT | 2 × 730 h × $0.062/h | 90.52 |
| Public IPv4 for NAT | 2 × 730 h × $0.005/h | 7.30 |
| Aurora storage | 10 GB × $0.12/GB-month | 1.20 |
| Aurora compute, one instance | Paused vs. 0.5 ACU continuous vs. 1 ACU continuous, $0.15/ACU-h | 0 / 54.75 / 109.50 |

Illustrative subtotals: **$99.02 / $153.77 / $208.52 per month**, before NAT traffic ($0.062/GB), Aurora I/O, backups beyond allowances, Lambda, CloudFront, S3, logs, and any optional services. 0 ACU only saves DB instance compute while the instance actually stays paused. It does not reduce NAT/IP/storage costs. An AWS Budget alert is not a hard spending cap. A NAT topology change is a deliberate difference from Production parity, not a silent default.

## 3. Remaining build and acceptance work

1. Establish the GitHub Actions OIDC provider and a dedicated role in **NonProd**, scoped to the Stordex repository and a separate AWS staging environment. The existing `production` workflow is manual-only and is not the path for this rollout. Keep existing Vercel workflow unchanged. In the new deployment workflow, verify the AWS account before SST, secret, or infrastructure operations. Do not reuse a personal CLI session in CI or persist access keys.
2. Review the SST diff for `aws-staging` in NonProd. Verify the account allowlist, recoverable backup configuration and network security, and set stage-specific application secrets and a test URL. Validate use of Tokyo for the workload. If adding a CloudFront custom domain later, use a viewer certificate in `us-east-1`.
3. Establish a private-VPC execution path for the committed Prisma migrations and run against the fresh Aurora only. The existing workflows do not have such a migration path. Do not use Neon, `prisma db push` or experimental migration 12. Validate migrations, drift, test tenant login, buyer/seller smoke, and backup restore. Do not load the repository's known-credential demo seed into a reachable environment.
4. Audit Vercel-only feature flags before attempting equivalent UAT on AWS. Do not simulate Vercel metadata just to force flags on. If parity is needed, add an explicit AWS Staging check with negative Production tests; confirm the separately scoped test flags are turned off afterward.
5. Switch the existing staging domain only once AWS Staging has passed, with the current Vercel target kept as rollback. No Production deployment or customer notification is part of this work.
