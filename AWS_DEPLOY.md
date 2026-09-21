# AWS deployment runbook

Stordex is deployed through SST/OpenNext in AWS Tokyo (`ap-northeast-1`).
Staging PostgreSQL uses the shared Supabase Tokyo project. Production
PostgreSQL runs on AWS; Supabase is not a production dependency.

## One-time prerequisites

1. Use the private `stordex` schema in `nammoku-staging-tokyo` for staging.
2. Create the GitHub Actions OIDC provider and environment-scoped IAM roles.
3. Create GitHub Environments named `staging` and `production`.
4. Add the secrets and domain variables listed in `ENVIRONMENTS.md`.
5. Point the chosen domains to the Route 53 hosted zone used by SST.

## Manual staging deployment

```bash
npm ci
npx sst secret set DatabaseUrl '<transaction-pooler-url>' --stage staging
npx sst secret set NextAuthSecret '<random-secret>' --stage staging
npx sst secret set NextAuthUrl 'https://<staging-domain>' --stage staging
DATABASE_URL='<session-pooler-url-port-5432>' npx prisma migrate deploy
APP_DOMAIN='<staging-domain>' npx sst deploy --stage staging
```

Normal staging releases use `.github/workflows/deploy-staging.yml`.

## Verification

- `/login` returns HTTP 200.
- Login, tenant boundary, CRUD and sign-out work.
- CloudWatch contains no repeated Lambda or database errors.
- Staging Supabase connection usage remains within the configured pool.
- No secret appears in build or application logs.

Rollback application code by redeploying the previous commit. Roll back schema
only with a reviewed forward migration or an environment-appropriate tested restore.
