# Environments

| Environment | Compute | Database | Deployment |
|---|---|---|---|
| Local | Next.js dev server | Local PostgreSQL | Manual |
| Staging | SST/OpenNext on AWS | Shared `nammoku-staging-tokyo` project, private `stordex` schema | Push to `main` or workflow dispatch |
| Production | SST/OpenNext on AWS | AWS PostgreSQL | Protected manual workflow |

AWS and the shared staging Supabase project are in Tokyo. Production does not
use Supabase. Environments use separate SST stages, domains, GitHub
Environments and secret sets.

## GitHub Environment configuration

Each environment requires:

- Secret `AWS_DEPLOY_ROLE_ARN`
- Secret `SUPABASE_DATABASE_URL` (Transaction Pooler, port 6543)
- Secret `SUPABASE_DIRECT_URL` (Session Pooler, port 5432)
- Secret `NEXTAUTH_SECRET`
- Variable `STAGING_DOMAIN` or `PRODUCTION_DOMAIN`

Never reuse the production database or authentication secret in staging.

## Where to obtain each value

| Name | Source / how to confirm |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | AWS Console > IAM > Roles > the environment-specific deploy role > ARN. The role trust must match the exact subject in `AWS_OIDC_SETUP.md`. |
| `SUPABASE_DATABASE_URL` | `nammoku-staging-tokyo` > **Connect** > **Transaction pooler**. Copy the port `6543` URI, replace `[YOUR-PASSWORD]`, and append `schema=stordex` to its query parameters. |
| `SUPABASE_DIRECT_URL` | The same project's **Session pooler** port `5432` URI with `schema=stordex`. This IPv4 endpoint is used by GitHub Actions migrations. |
| `NEXTAUTH_SECRET` | Generate once with `openssl rand -base64 32`. Store the output unchanged; do not commit it. Replacing it invalidates existing sessions. |
| `STAGING_DOMAIN` / `PRODUCTION_DOMAIN` | The Route 53 hostname selected for the environment, without `https://` or a trailing slash (for example `staging-stordex.nammoku-solutions.com`). |

These two Supabase secrets belong only in the `staging` GitHub Environment.
The database password is chosen when the Supabase project is created. If it
is no longer known, reset it in Supabase **Project Settings > Database** and
update both connection-string secrets. These are PostgreSQL connection URIs,
not the Supabase API URL, anon/publishable key, or `service_role` key. If an
The workflow rejects URLs that do not contain `schema=stordex`, preventing a
migration from accidentally targeting another application's schema.
