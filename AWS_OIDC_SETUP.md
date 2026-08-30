# Stordex GitHub Actions OIDC setup

This runbook covers the AWS-side identity prerequisites for `.github/workflows/deploy-prod.yml`.

The production workflow is intentionally manual-only and requires the confirmation value `DEPLOY`. Repository merges must not trigger an AWS production deployment by themselves.

This runbook intentionally does **not** prescribe a broad deployment permissions policy. The SST/OpenNext role permissions must be reviewed against the actual target AWS account and first-production infrastructure plan rather than guessed as `AdministratorAccess`.

## 1. GitHub workflow identity

The production deployment job uses:

- repository: `nammoku-solutions/stordex`
- GitHub Environment: `production`
- AWS region: `ap-northeast-1`
- OIDC audience: `sts.amazonaws.com`

Because the job references the `production` GitHub Environment, the OIDC subject is environment-scoped rather than branch-scoped.

For the standard GitHub OIDC subject format:

```text
repo:nammoku-solutions/stordex:environment:production
```

GitHub also supports newer immutable OIDC subject claims. The current repository identifiers are:

```text
repository owner id: 322632577
repository id:       1220810506
```

If this repository uses immutable subject claims, verify the actual subject emitted by GitHub and use that exact value. Do not weaken the AWS trust condition to work around a subject mismatch.

Do not use a wildcard subject such as `repo:nammoku-solutions/*` or a trust rule that allows every GitHub repository.

> Organization transfer note: this repository moved from `Jun-engineer/stordex` to `nammoku-solutions/stordex`. Any existing AWS IAM OIDC trust condition that still contains the old repository owner must be updated before the next production deployment.

## 2. AWS OIDC provider

The intended AWS account needs the GitHub Actions OIDC provider:

```text
Provider URL: https://token.actions.githubusercontent.com
Audience:     sts.amazonaws.com
```

If the provider already exists in the account, reuse it. Do not create a duplicate provider.

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
          "token.actions.githubusercontent.com:sub": "repo:nammoku-solutions/stordex:environment:production"
        }
      }
    }
  ]
}
```

If GitHub reports an immutable subject for this repository, replace only the `sub` value with that verified subject.

## 4. Role permissions

Use a dedicated Stordex production deployment role. Keep two concerns separate:

- **Trust policy:** GitHub OIDC for this repository/environment only.
- **Permissions policy:** only AWS actions/resources required by SST/OpenNext and the approved production rollout.

Do not attach permanent unrestricted administrator access simply because the deployment creates several AWS resource types. Where resource-level restriction is not practical during creation, document the exception and use the narrowest controlled deployment-role design available.

## 5. GitHub Environment configuration

In the GitHub Environment named `production`:

1. configure deployment protection / required approval where available
2. add `AWS_DEPLOY_ROLE_ARN` for the dedicated deployment role
3. do not add `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` for the target OIDC design
4. restrict which refs may deploy to the environment

The workflow itself also provides a repository-level guard:

- there is no `push` production trigger
- it can only be started with `workflow_dispatch`
- the deploy job runs only when `confirm_production` is exactly `DEPLOY`

Environment protection is therefore defense-in-depth rather than the only barrier against accidental deployment.

## 6. First-production prerequisites

Before the first actual deployment:

- confirm the intended AWS account ID and `ap-northeast-1`
- confirm/reuse the GitHub OIDC provider
- confirm the deployment-role trust subject exactly matches GitHub's actual subject format
- review and approve the role permission policy
- configure `AWS_DEPLOY_ROLE_ARN` in the `production` Environment
- review the pinned SST 4.17.1 infrastructure plan/diff using the intended identity
- prepare the private-VPC Prisma migration execution path
- verify the Aurora backup/PITR plan
- configure the required SST application secrets for stage `prod`

## 7. First workflow verification

The first intentional production workflow must verify its identity before resource mutation.

The workflow runs:

```bash
aws sts get-caller-identity
```

Confirm the returned account and assumed-role ARN are exactly the intended production identity before accepting the deployment path.

Do not remove this identity preflight after OIDC is enabled.

## Related tracking

- Issue #4 — AWS OIDC account-side completion
- Issue #5 — first production Prisma migration / backup verification
- Issue #8 — pinned SST 4.17.1 / infrastructure review
- Issue #15 — manual-only production deployment safety guard
