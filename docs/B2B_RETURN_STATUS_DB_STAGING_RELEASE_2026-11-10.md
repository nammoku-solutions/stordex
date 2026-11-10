# B2B return status audit — Staging DB schema release (2026-11-10)

**Approved scope:** The owner authorized **only** `20261106110000_b2b_return_status_events` on Neon Staging, after a verified independent backup restore. No Production approval.

## Pre-migration recovery evidence
- Staging project `dry-feather-14704968`, branch `br-sparkling-boat-ao9nrctp`, database `neondb`; baseline **25 application tables, 8 completed migrations**.
- Encrypted backup created by user through `scripts/backup-neon-staging-post-physical-return.sh --execute`, includes 2 physical return events and 24 inventory movements; exact archived filename remains private to user.
- Independently restored to recovery project `delicate-rice-23940930`, branch `br-ancient-voice-aoutl8qq`, new database `stordex_restore_post_physical_20261110`. The restore DB is not Stordex Production.
- Read-only source/restore comparison passed: 25/25 tables, 98/98 records, **25/25 per-table row-set hashes**, **572/572 DB schema definitions** (315 columns, 79 constraints, 77 indexes, 65 enum entries, 5 functions, 6 triggers, 25 table definitions), and all 8 prior Prisma names/checksums/commit states.
- UAT record: purchase order `P-20261110-0001`, approved=2, dispatched=2, inspected=2, saleable=1, unsaleable=1, buyer D-PAPER=36, seller A-PAPER=138.

## Approved migration application
- Exactly `prisma/migrations/20261106110000_b2b_return_status_events/migration.sql`: source Git blob `b97d83ead5886fcef9416a4f63f7c5a36a08012f`, UTF-8 **SHA256 `319dbb8eae4fe0d668a679a84f77a7e4539cdf919627b84b0b8c8e260d39c6f0`**.
- All **9 source SQL statements** (audit table, unique/ordinary indexes, actor/request/tenant foreign keys, guard function and trigger), Prisma history registration, preflight and postflight were applied **atomically in a single PostgreSQL transaction** after explicit user approval.
- Transaction postconditions: **26 tables, 9 completed migrations**, 0 audit rows, 2 existing physical return events, 24 inventory movements, return request stays `PARTIALLY_APPROVED`, buyer=36, seller=138.
- Read-only post-migration comparison against the independently restored pre-migration snapshot confirmed **all 24 pre-existing non-Prisma data tables unchanged**, **90/90 data rows identical** and the new migration checksum registered as the ninth, completed history record.
- The migration SQL retains original Draft comments for a **byte-identical** Prisma history file; subsequent owner authorization supersedes those comments for Staging only.

## This source PR
- The approved migration SQL, Prisma model and relations, and dedicated disposable PostgreSQL schema guard test.
- No internal status-writer integration or Server Actions, no user-visible status update actions, no finance or CreditNote dependency.
- Staging Vercel branch `STORDEX_B2B_RETURNS_ENABLED` and `STORDEX_B2B_RETURN_STOCK_ENABLED` remain explicitly **false**. No UAT flag changes.
- **Do not run the migration again manually** against Staging; Prisma will see the applied hash and mark it complete.

## Next steps
1. Merge only this DB schema PR after disposable PostgreSQL CI and Vercel build PASS.
2. Extract internal `recordPhysicalReturnStatus` with its CI integration tests into a separate service-only PR based on updated Staging; do not merge Draft #146 as a whole.
3. Design a separate default-OFF, role-restricted reconciliation UI for existing UAT returns; preserve ordered actor-side transitions `PARTIALLY_APPROVED→DISPATCHED→INSPECTED`.
4. For future truly automatic formal status changes, make the status update atomic with its inventory event, or implement an auditable retriable processor, not two unrelated commits.
5. CreditNote, financial settlement and `CREDIT_PENDING/CLOSED` remain future work requiring their own review, backup and user-authorized migrations.
6. Production migration and release require all feature UAT plus Codex Astra comprehensive final review.
