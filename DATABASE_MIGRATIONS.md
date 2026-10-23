# Stordex Database Migration Runbook

Stordex uses **Prisma Migrate** as the source of truth for shared/staging/production schema changes.

## Current baseline

As of 2026-08-28, AWS verification found no Stordex production Aurora cluster/resources in the intended account. The repository therefore uses a normal **initial migration from an empty PostgreSQL database** rather than a fake baseline for an already-populated production database.

Committed migration history lives under:

```text
prisma/migrations/
```

The initial migration was generated directly from the current `prisma/schema.prisma` using Prisma's migration diff command.

## Rules

- `prisma/schema.prisma` and `prisma/migrations/` must change together when the database schema changes.
- Do not use `prisma db push` for staging or production.
- `prisma db push` remains acceptable only for disposable/local development databases.
- Production schema changes use `prisma migrate deploy`.
- Do not use `--accept-data-loss` as a routine deployment mechanism.
- Do not edit a migration that has already been applied to a shared environment; create a new migration instead.

## Local development

For disposable local development, the existing one-shot setup may still use:

```bash
npm run db:push
```

For schema work that will be shared or deployed, create a migration instead:

```bash
npm run db:migrate -- --name <migration_name>
```

Review the generated SQL before committing it.

## CI validation

CI starts PostgreSQL 16 and verifies the committed migration chain with:

```bash
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```

This intentionally fails if:

- a committed migration cannot be applied to an empty PostgreSQL 16 database;
- migration history is inconsistent;
- the migrated database differs from `schema.prisma`.

## Staging — populated Neon database migration baseline

**CAUTION (2026-10-19, Issue #70):** Existing Staging data is populated but there is **no** `public._prisma_migrations` table. The base schema and three additive migrations were created/applied outside Prisma's migration ledger. Do **not** run `npm run db:migrate:staging` yet: it may try to recreate existing tables and fail.

Before any automatic migration in Staging:

1. Verify the intended Neon Staging project and branch (`dry-feather-14704968` / `br-sparkling-boat-ao9nrctp`). Never substitute the Neon Production branch.
2. Run the safe **read-only** preflight; it intentionally exits with code 2 until a valid migration ledger exists:

```bash
cp .env.staging.example .env.staging
# Set the correct Neon Staging DATABASE_URL and APP_ENV=staging in the local ignored file.
npm run db:migrate:preflight:staging
```

3. Compare the database's actual tables, constraints and indexes against the **initial** migration and the later trading connections / intercompany orders / CSV import migrations.
4. Create another Neon branch cloned from Staging, rehearse Prisma's `migrate resolve --applied` **on that disposable rehearsal branch only**, in committed migration order. Inspect `prisma migrate status` and schema drift. Resolve only migrations that were actually applied.
5. Take/verify a current backup or branch snapshot. Require explicit approval for the carefully reviewed ledger-only writes on Staging. Do not drop, recreate or reseed existing tables.
6. Re-run the preflight and `prisma migrate status` on Staging. `READY_PENDING_MIGRATIONS` means only that the applied ledger is a valid ordered prefix; it does **not** certify that the existing physical schema matches it. Verify the actual schema/constraints/indexes on an isolated clone against the baseline and every already-applied migration, explicitly approve pending SQL, and only then use `npm run db:migrate:staging`. `READY` means every committed migration is applied; it also does not replace schema-drift validation.

The preflight script opens a **read-only PostgreSQL transaction** and never creates or alters a migration ledger. It requires `APP_ENV=staging` and validates **the server-reported Neon project (`dry-feather-14704968`), branch (`br-sparkling-boat-ao9nrctp`) and database (`neondb`)** before inspecting migration history. It refuses Production, clones and any mismatched connection even if `APP_ENV=staging` is set. This is a read-only gate, not authorization to run write migrations.

### Standard staging migrations (ONLY after baselining)

```bash
npm run db:migrate:preflight:staging
npm run db:migrate:staging
```

Then seed only when required:

```bash
npm run db:seed:staging
```

The helper script also uses migrations:

```bash
./scripts/start-staging.sh --schema
```

## Production — first deployment

The first Stordex AWS rollout is special because `sst.config.ts` creates the Aurora cluster and the application in the same infrastructure deployment.

Required sequence:

1. Confirm the intended AWS account and `ap-northeast-1` region.
2. Confirm GitHub OIDC / production deployment IAM work is complete before using the normal production workflow.
3. Deploy the SST infrastructure so Aurora exists.
4. Apply the committed Prisma migrations to that new Aurora database from a **controlled execution path that has network access to the VPC**.
5. Verify `prisma migrate status` reports all migrations applied.
6. Verify the application can read/write representative data.
7. Confirm Aurora automated backups / point-in-time recovery after the first real cluster exists.

Do not assume a standard GitHub-hosted runner can directly reach the private Aurora endpoint. The current VPC does not expose the database publicly and does not include a permanent bastion host.

The production migration execution mechanism must therefore be one of the reviewed VPC-capable approaches, for example a controlled ECS/Fargate migration task or another approved private-network administration path. Do not make Aurora publicly accessible just to run migrations.

Until the first AWS production rollout is completed, GitHub Issue #5 remains the tracker for the production execution/backup verification portion.

## Subsequent production schema changes

For every production schema change:

1. Create and review a new Prisma migration.
2. CI must pass migration deployment and schema-drift checks.
3. Confirm backup/PITR readiness before a risky migration.
4. Apply `prisma migrate deploy` through the approved production migration execution path.
5. Confirm migration status.
6. Deploy/restart application code as required by the schema change.
7. Run post-deploy smoke tests.

For destructive or long-running migrations, use a dedicated migration plan and maintenance window rather than relying only on the standard application deployment workflow.


### Clone-only rehearsal runner (2026-10-23)

A fresh Staging clone was verified on Neon project `dry-feather-14704968`,
branch `br-solitary-tooth-aoom13fn` (`stordex-baseline-clean-rehearsal-20261023`).
Read-only structural catalog comparison with the initial migration and the three
2026-10-16 migrations matched 21 tables, 11 enums, 59 indexes, 62 constraints
and 266 columns. The catalog check accounts for PostgreSQL's 63-byte index
identifier truncation. The inventory migration is NOT physically applied and
`_prisma_migrations` is absent. This object-name parity is a prerequisite,
not a complete type/default/semantic drift verification.

The new `scripts/rehearse-neon-baseline.mjs` defaults to READ ONLY.
It checks the **database-server-reported** `neon.project_id` and
`neon.branch_id` before any mutation, and refuses Staging or Production.
It accepts only an unpooled **direct** Neon connection for `neondb`.
Run locally or on a trusted runner using the clone's direct DATABASE_URL;
do not commit credentials, copy the real Staging DATABASE_URL, or point it at
the Neon default/Production branch.

```bash
# Use a private shell environment containing the clone's direct URL.
APP_ENV=staging-rehearsal DATABASE_URL='<NEON_CLONE_DIRECT_URL>' \
  node scripts/rehearse-neon-baseline.mjs --check

# Execute official `prisma migrate resolve --applied` for the four migrations
# only after check output identifies the intended disposable branch.
APP_ENV=staging-rehearsal DATABASE_URL='<NEON_CLONE_DIRECT_URL>' \
  STORDEX_BASELINE_CONFIRM=apply-on-br-solitary-tooth-aoom13fn \
  node scripts/rehearse-neon-baseline.mjs --execute
```

Only these four existing migrations are marked applied (in exact order):
`20260828093000_initial`, `20261016070000_trading_connections`,
`20261016093000_intercompany_orders`, and
`20261016110000_csv_import_jobs`.
The runner verifies the resulting four finished ledger records, unchanged
application catalog and unchanged tenant count. The future
`20261019090000_inventory_policy_purchase_mode` migration MUST remain pending.
Then run `npx prisma migrate status`, separately compare full types, defaults,
constraints and drift, and rehearse the reviewed inventory migration on this
isolated branch. A successful rehearsal does NOT authorize writes to Staging;
perform a current Staging backup and obtain owner approval first.
