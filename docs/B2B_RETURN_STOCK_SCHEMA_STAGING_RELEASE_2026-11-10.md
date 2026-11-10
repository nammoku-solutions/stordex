# B2B Return Stock Event DB Schema — Staging release record (2026-11-10)

Issue #82 | This release contains **only** the approved DB migration, matching Prisma schema, and isolated PostgreSQL integration test. It intentionally excludes the physical stock writer and all new UI/actions from Draft PR #142.

## Explicit authorization and safety checks
- Owner approved applying only `20261105100000_b2b_return_stock_events` to Neon **Staging**, not Production.
- Source: `dry-feather-14704968`, branch `br-sparkling-boat-ao9nrctp`, database `neondb`.
- Backup: `stordex-staging-post-return-request-20261110T054017Z-dae2551b.dump.gpg`, created with AES256; independent restore to `delicate-rice-23940930` / `stordex_restore_post_return_20261110`.
- Independent read-only comparisons: 24/24 table row counts and per-row content hashes, 93/93 records, all 540 schema objects, and all seven prior Prisma migration checksums matched the original.
- Git migration file blob SHA `cc2533536569c44cce710a88fceaa01f7c5d49ed`; exact UTF-8 SHA256/Prisma migration checksum `85d816bddec3ebdfa7a62bb850a5606d12ee6088dda557a31310acf255f91d07`.
- Migration applied with SQL preconditions, all 14 source SQL statements, `_prisma_migrations` registration, and postconditions **atomically in one PostgreSQL transaction**.
- Postchecks: 25 tables, eight completed migrations, one valid matching new Prisma history record, 3 new protection triggers, 0 new stock events, still 1 return request/line and 22 inventory movements, buyer 38 boxes, seller 137 boxes.
- No app route/Server Action imports the physical writer; `STORDEX_B2B_RETURNS_ENABLED` remains Staging-preview OFF.
- No physical stock changes, financial/settlement writes, Production database or schema changes.

## Release contents
- `prisma/migrations/20261105100000_b2b_return_stock_events/migration.sql`: **byte-identical** to the migration already applied to Staging. Never run it a second time.
- `prisma/schema.prisma`: add Prisma `B2BReturnStockEvent`, event type and relations.
- `src/lib/b2b-return-stock-event-schema.integration.test.ts`: optional CI disposable-PostgreSQL schema and immutability test.

## Next work
- Keep PR #142 Draft and **do not merge it wholesale**.
- Separately prepare a Staging-gated service PR for buyer dispatch and seller inspection after reviewing race/idempotency, event provenance, and status transitions.
- Create user-visible return dispatch/inspection UI behind a fresh, independent feature flag; do not reuse existing submission/review flag automatically.
- Browser UAT with existing partially-approved 2-box request, baseline stocks 38/137. Only test authorized conditions, verify audit quantities and expected inventory changes.
- Invoice adjustments/CreditNote later, independently approved migration.
- Full Codex Astra review before Production.
