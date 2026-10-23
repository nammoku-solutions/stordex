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
6. Re-run the preflight and `prisma migrate status` on Staging; only after history is consistent may reviewed future migrations use `npm run db:migrate:staging`.

The preflight script opens a **read-only PostgreSQL transaction** and never creates or alters a migration ledger. It requires `APP_ENV=staging` and a Neon database hostname, but this guard alone cannot prove that a supplied URL belongs to the correct branch; separately verify the Neon branch ID before running it.

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


### Pinned inventory migration rehearsal — after initial Prisma ledger baseline

After official Prisma migrate resolve applied the initial plus three 2026-10-16
migrations on Neon clone br-solitary-tooth-aoom13fn, use the inventory-feature
branch's guarded script (direct Neon URL ONLY, never pooled).

Run `node scripts/rehearse-neon-inventory-migration.mjs --check` with
`APP_ENV=staging-rehearsal` and `DATABASE_URL` set to the clone's direct URL.
The script checks the actual server-reported Neon project/branch ID, the exact
five committed migrations, all four applied migration checksums, and that
the inventory schema change is still unapplied. It is read-only by default.

After confirming the target, run with `--execute` and
`STORDEX_INVENTORY_CONFIRM=migrate-on-br-solitary-tooth-aoom13fn`.
This invokes the official Prisma CLI `migrate deploy` only on that pinned clone,
then verifies the fifth migration ledger checksum, two enum types, five
new columns, the index, legacy STOCKED/UNIT defaults, NULL historical PO
pack snapshots, and unchanged tenant/item/PO/stock records and fingerprints.

Do not point this script at the populated staging branch or production,
do not commit or paste the URL, and do not treat a clone PASS as permission
to deploy or repair the Staging DB without a fresh backup and explicit approval.


### Staging migration execution after full backup-restore rehearsal (approval required)

Preconditions verified 2026-10-23:
- Clone `br-solitary-tooth-aoom13fn`: official 4-migration Prisma baseline then fifth inventory migration succeeded; `prisma migrate status` is current and Prisma schema diff is empty.
- Actual Staging direct-connection private custom-format `pg_dump` created and TOC/SHA validated; PostgreSQL 16 Docker restore test recovered 2 tenants, 8 items, stock 1655, 5 POs, 5 lines, 14 movements; no Prisma ledger as expected.
- GitHub Issue #70 contains evidence. **Do not treat rehearsal or backup evidence as authorization to modify the live Staging branch.**

The feature-branch script `scripts/apply-neon-staging-migrations.mjs` is
**read-only by default**, with independent `--baseline` (official Prisma
`migrate resolve --applied` for four previously deployed migrations) and
`--inventory` (official Prisma `migrate deploy` for fifth migration) stages.
It pins the Neon server-reported project and *actual Staging branch*;
rejects pooled/cloned/Production URLs, unknown migrations or hashes, partial
ledger, unexpected catalog drift, changed item/PO record fingerprints,
unapproved history/schema transitions or mismatched prior archive SHA-256.

The only accepted pre-change archive for this specific rehearsal is
`stordex-staging-2026-10-23T07-45-23-904Z-cc8596b6.dump`,
67,396 bytes, SHA-256
`a8ef4098f48b0384cd52d208c4959c6f0578744b179df15e904c169681076db9`.
A more recent or different backup requires updating the reviewed guard
with new evidence and retesting; do **not** bypass checks.

Before any live Staging mutation, owner must explicitly approve the exact
target, maintenance period and this staged runbook; assess active writes and
verify a realistic recovery method. Never paste credentials or archive into
chat, issue comments or GitHub Actions logs.

After approval, in a private trusted WSL session using Direct Staging URL
and the private archive file path in
`STORDEX_STAGING_BACKUP_ARCHIVE`, run `--check` before `--baseline`.
After baselining, inspect `prisma migrate status` to ensure exactly the fifth
migration is pending, then independently authorize and run `--inventory`.
Verify `migrate status`, full schema diff, fingerprints and UAT.

The exact mutating shell commands are intentionally not provided as a casual
copy/paste step: the operator must review the script and record specific
owner approval for each Staging-writing phase first.
