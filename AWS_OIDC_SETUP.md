# Stordex GitHub Actions OIDC setup

This runbook covers the AWS-side identity prerequisites for `.github/workflows/deploy-prod.yml`.

The production workflow is intentionally manual-only and requires the confirmation value `DEPLOY`. Repository merges must not trigger an AWS production deployment by themselves.

## 1. GitHub workflow identity

The production deployment job uses:

- repository: `nammoku-solutions/stordex`
- repository owner ID: `322632577`
- repository ID: `1220810506`
- GitHub Environment: `production`
- AWS region: `ap-northeast-1`
- OIDC audience: `sts.amazonaws.com`

This repository was transferred after GitHub's July 15, 2026 immutable-subject rollout. Repository transfers after that date use the immutable OIDC subject format.

The expected subject is therefore:

```text
repo:nammoku-solutions@322632577/stordex@1220810506:environment:production
```

Do not use the old name-only subjects:

```text
repo:Jun-engineer/stordex:environment:production
repo:nammoku-solutions/stordex:environment:production
```

Do not weaken the trust condition with a wildcard such as `repo:nammoku-solutions/*`.

## 2. AWS OIDC provider

The intended AWS account needs the GitHub Actions OIDC provider:

```text
Provider URL: https://token.actions.githubusercontent.com
Audience:     sts.amazonaws.com
```

If it already exists in the AWS account, reuse it rather than creating a duplicate.

## 3. Deployment role trust policy

Replace `<AWS_ACCOUNT_ID>` with the intended Stordex production AWS account ID.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:nammoku-solutions@322632577/stordex@1220810506:environment:production"
        }
      }
    }
  ]
}
```

## 4. Role permissions

Use a dedicated Stordex production deployment role. Keep these concerns separate:

- **Trust policy:** GitHub OIDC for this repository/environment only.
- **Permissions policy:** only AWS actions/resources required by SST/OpenNext and the approved production rollout.

Do not attach permanent unrestricted administrator access only to make deployment easier.

## 5. GitHub Environment configuration

In the GitHub Environment named `production`:

1. configure deployment protection / required approval where available
2. add `AWS_DEPLOY_ROLE_ARN` for the dedicated deployment role
3. do not add `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` for the target OIDC design
4. restrict which refs may deploy to the environment

The workflow is also guarded because it has no automatic production push trigger and requires the manual confirmation value `DEPLOY`.

## 6. First-production prerequisites

Before the first actual deployment:

- confirm the intended AWS account ID and `ap-northeast-1`
- confirm/reuse the GitHub OIDC provider
- confirm the role trust policy uses the exact immutable subject above
- review and approve the role permission policy
- configure `AWS_DEPLOY_ROLE_ARN` in the `production` Environment
- review the pinned SST infrastructure plan/diff using the intended identity
- prepare the private-VPC Prisma migration execution path
- verify the Aurora backup/PITR plan
- configure the required SST application secrets for stage `prod`

## 7. First workflow verification

The first intentional production workflow runs:

```bash
aws sts get-caller-identity
```

Confirm the returned account and assumed-role ARN are exactly the intended production identity before accepting the deployment path.

## Related tracking

- Issue #4 — AWS OIDC account-side completion
- Issue #5 — first production Prisma migration / backup verification
- Issue #8 — pinned SST / infrastructure review
- Issue #15 — manual-only production deployment safety guard
