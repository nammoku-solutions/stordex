# CreditNote DRAFT-only schema release — Staging (2026-11-10)

## Scope and authorization
The owner explicitly approved **only** Prisma migration `20261110170000_b2b_credit_note_drafts` on the Neon **stordex-staging / staging / neondb** database.

- Project ID: `dry-feather-14704968`
- Branch ID: `br-sparkling-boat-ao9nrctp`
- No other DB migration approved. Production untouched.
- Do not merge the stacked CreditNote Draft PR #150 wholesale: it contains an unexposed draft writer and backup tooling not part of this narrowly scoped schema release.

## Independent restoration before approval

- User created a fresh AES-256 GPG backup with `scripts/backup-neon-staging-post-status-audit.sh --check` and `--execute`, then verified the encrypted archive's SHA-256 on WSL.
- New **empty** recovery DB `stordex_restore_post_status_20261110` was created on separate Neon project `stordex-recovery-test`, project ID `delicate-rice-23940930`, branch **production within the recovery-only project**, branch ID `br-ancient-voice-aoutl8qq`.
- User's restore command reported `RESTORE_PASS: 26|9|2|2|24|0|INSPECTED`.
- Read-only independent comparison matched **all 26 table data hashes and 101 total records**; **596 of 596 public-schema definitions**: 325 columns, 86 constraints, 65 enum entries, 6 functions, 81 indexes, 26 table definitions and 7 triggers.
- All nine Prisma migration names/checksums/applied flags matched. Prior physical/status return UAT events preserved; buyer 36/seller 138.

## Exact approved migration

- Git SQL source blob: `64277145d866af6139faa31499f52e091e7844d2`, byte-identical migration in this release PR.
- UTF-8 SHA-256: `afda7ae0b2dec24750359595884181f3d6bfa1cb721538544f2b6b4f93066bc5`.
- 21 SQL statements: `B2BCreditStatus` enum, seller DRAFT header and exact returned-source-line allocation tables, FK / index / uniqueness guards, active seller-owner/admin origin guard, inspected-unit non-overallocation guard, and two insert/update/delete trigger guards. Type contains future status labels but the **DB CHECK currently rejects every non-DRAFT status**.
- The exact source SQL, one Prisma history row with matching checksum, database identity/initial-data preflight and postcondition checks executed in **one PostgreSQL transaction**; no partial schema/data change on failed postcondition.
- Immediate postcondition: **28 tables, ten applied migrations, zero incomplete**, zero credit drafts/credit lines, original two status audits and two physical return events, 24 inventory movements, no invoices or invoice links.

## Post-migration nonmutation proof

Read-only Staging vs independent pre-migration restored backup comparison:
- All **25 original application/business tables** (excluding `_prisma_migrations`) and their **92 rows** have unchanged row counts and canonical per-row JSONB hashes.
- Prior nine Prisma history rows identical; only the tenth history row was appended with the exact Git SQL SHA-256.
- The previously verified return status `INSPECTED`, two actor/tenant-scoped status audit transitions, seller/buyer stocks and existing inventory movement records all remain unchanged.

## Scope of this source PR

1. Byte-identical `prisma/migrations/20261110170000_b2b_credit_note_drafts/migration.sql` and current Prisma schema models/relations.
2. Disposable CI-PostgreSQL integrity tests only.
3. This evidence file.
4. No draft service, no public Server Action, no button, no new feature flag activation, no accounting/settlement/refund logic, no invoice or stock writes.
5. The previously created PR #150 remains Draft; do not merge it wholesale.

## Requirements and next work

- Merge only this source PR after disposable PostgreSQL CI migration/schema drift/typecheck/test/build and Vercel build **PASS**. GitHub migration history should then match the already-applied tenth migration in Staging; **never manually reapply** this migration there.
- Extract `createB2BCreditNoteDraft` and service integration tests separately from Draft #150 on the newest Staging. It stays internal and OFF until explicit review and UAT.
- Present Staging currently has **0 invoices and 0 invoice-order links**. Formal return is inspected, but CreditNote DRAFT cannot yet be constructed legally without an issued/paid original invoice mapped to the seller order. Test fixture requires separate owner-approved creation of a genuine test invoice in Staging (or dedicated isolated seeded DB).
- Independent review (four eyes), currency/minor units, tax rounding and legal issuance, monetary cap, payment/refund/offset and reversals are **not implemented**. Do not conflate a draft allocation with a legal issued CreditNote.
- Every future *new* live DB migration requires specific authorization and appropriately recent backup+independent restore evidence; code-only changes can use the already verified schema.
- Complete all features and obtain comprehensive **Codex Astra** code review PASS before any Production rollout.
