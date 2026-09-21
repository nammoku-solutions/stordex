# Environments

| Environment | Compute | Database | Deployment |
|---|---|---|---|
| Local | Next.js dev server | Local PostgreSQL | Manual |
| Staging | SST/OpenNext on AWS | Dedicated Supabase staging project | Push to `main` or workflow dispatch |
| Production | SST/OpenNext on AWS | Dedicated Supabase production project | Protected manual workflow |

AWS region is `ap-southeast-2`. Staging and production are separate SST
stages, domains, Supabase projects, GitHub Environments and secret sets.

## GitHub Environment configuration

Each environment requires:

- Secret `AWS_DEPLOY_ROLE_ARN`
- Secret `SUPABASE_DATABASE_URL` (Transaction Pooler, port 6543)
- Secret `SUPABASE_DIRECT_URL` (direct or Session Pooler, port 5432)
- Secret `NEXTAUTH_SECRET`
- Variable `STAGING_DOMAIN` or `PRODUCTION_DOMAIN`

Never reuse the production database or authentication secret in staging.
