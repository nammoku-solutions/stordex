# Stordex GitHub Actions OIDC setup

This runbook covers the AWS-side identity prerequisites for `.github/workflows/deploy-prod.yml` in PR #7.

It intentionally does **not** prescribe a broad deployment permissions policy. The SST/OpenNext role permissions must be reviewed against the actual target AWS account and first-production infrastructure plan rather than guessed as `AdministratorAccess`.

## 1. GitHub workflow identity

The production deployment job uses:

- repository: `Jun-engineer/stordex`
- GitHub Environment: `production`
- AWS region: `ap-northeast-1`
- OIDC audience: `sts.amazonaws.com`

Because the job references the `production` GitHub Environment, the OIDC subject is environment-scoped rather than branch-scoped.

For the standard GitHub OIDC subject format:

```text
repo:Jun-engineer/stordex:environment:production
```

GitHub also supports immutable OIDC subject claims for repositories that use the newer immutable format. The current repository identifiers are:

```text
repository owner id: 107489639
repository id:       1220810506
```

If this repository is using immutable subject claims, the corresponding environment subject is expected to use the owner/repository IDs rather than only names. Verify the actual GitHub OIDC subject format before saving the AWS trust policy.

Do not use a wildcard subject such as `repo:Jun-engineer/*` or a trust rule that allows every GitHub repository.

## 2. AWS OIDC provider

The target AWS account needs the GitHub Actions OIDC provider:

```text
Provider URL: https://token.actions.githubusercontent.com
Audience:     sts.amazonaws.com
```

If the provider already exists in the account, reuse it. Do not create duplicate providers.

## 3. Deployment role trust policy

Replace `<AWS_ACCOUNT_ID>` with the intended Stordex production AWS account ID.

For the standard environment-scoped GitHub subject, the trust relationship should follow this shape:

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
          "token.actions.githubusercontent.com:sub": "repo:Jun-engineer/stordex:environment:production"
        }
      }
    }
  ]
}
```

If GitHub reports an immutable subject claim for this repository, replace only the `sub` value with that verified immutable subject. Do not weaken the trust condition to work around a mismatch.

## 4. Role permissions

Create a dedicated role for Stordex production deployment. Keep its trust policy and permissions policy conceptually separate:

- **Trust policy:** who may assume the role — GitHub OIDC for this repository/environment only.
- **Permissions policy:** which AWS actions the assumed role may perform.

Do not attach a permanent unrestricted administrator policy just because SST creates several AWS resource types.

Before first production deployment, review the resources in `sst.config.ts` and the SST/OpenNext deployment behavior, then grant the deployment role only the actions/resources required for that rollout. Where resource-level restriction is not supported during resource creation, document the reason and use an appropriate permissions boundary / controlled deployment role design.

## 5. GitHub Environment configuration

In the GitHub Environment named `production`:

1. Configure deployment protection / required approval as appropriate.
2. Add `AWS_DEPLOY_ROLE_ARN` with the ARN of the dedicated deployment role.
3. Do not add `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` for the OIDC target design.
4. Restrict which branches/tags may deploy to the environment; production should not be available to arbitrary branches.

The production workflow already requests:

```yaml
permissions:
  contents: read
  id-token: write
```

and uses `aws-actions/configure-aws-credentials` with `role-to-assume`.

## 6. Pre-merge verification

Before PR #7 is marked ready:

- confirm the intended AWS account ID
- confirm the GitHub OIDC provider exists with audience `sts.amazonaws.com`
- confirm the role trust subject exactly matches the repository's actual GitHub OIDC subject format
- confirm the role permission policy has been reviewed
- confirm GitHub Environment `production` contains `AWS_DEPLOY_ROLE_ARN`
- confirm environment deployment protection / branch restrictions are enabled

## 7. First workflow verification

The first approved production workflow must stop if identity is unexpected.

The workflow runs:

```bash
aws sts get-caller-identity
```

Confirm the returned account and assumed-role ARN before treating deployment identity as verified.

Do not remove this preflight after OIDC is enabled.

## Related work

- GitHub Issue #4 — production OIDC migration
- Draft PR #7 — repository-side OIDC workflow
- GitHub Issue #5 — first production database migration / backup verification
- GitHub Issue #8 — pin the SST CLI before first production deployment
