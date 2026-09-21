# Environments

| Environment | Compute | Database | Deployment |
|---|---|---|---|
| Local | Next.js dev server | Local PostgreSQL | Manual |
| Staging | SST/OpenNext on AWS | Dedicated Supabase staging project | Push to `main` or workflow dispatch |
| Production | SST/OpenNext on AWS | Dedicated Supabase production project | Protected manual workflow |

AWS region is `ap-northeast-1` (Tokyo). Supabase projects must also be created
in Tokyo. Staging and production are separate SST stages, domains, Supabase
projects, GitHub Environments and secret sets.

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
| `SUPABASE_DATABASE_URL` | Supabase project > **Connect** > **Transaction pooler**. Copy the port `6543` URI and replace `[YOUR-PASSWORD]` with the database password. |
| `SUPABASE_DIRECT_URL` | Supabase project > **Connect** > **Session pooler**. Copy the port `5432` URI and replace `[YOUR-PASSWORD]`. This IPv4 endpoint is used by GitHub Actions migrations. |
| `NEXTAUTH_SECRET` | Generate once with `openssl rand -base64 32`. Store the output unchanged; do not commit it. Replacing it invalidates existing sessions. |
| `STAGING_DOMAIN` / `PRODUCTION_DOMAIN` | The Route 53 hostname selected for the environment, without `https://` or a trailing slash (for example `staging-stordex.nammoku-solutions.com`). |

The database password is chosen when the Supabase project is created. If it
is no longer known, reset it in Supabase **Project Settings > Database** and
update both connection-string secrets. These are PostgreSQL connection URIs,
not the Supabase API URL, anon/publishable key, or `service_role` key. If an
existing project is outside Tokyo, create a Tokyo project and migrate into it;
a Supabase project's region cannot be changed in place.
