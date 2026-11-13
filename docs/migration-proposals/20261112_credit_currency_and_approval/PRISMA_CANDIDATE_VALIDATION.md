# Migration #12 — Prisma 7 candidate schema validation (CI only)

## Exact scope and environment

This is NOT an approved or operational Prisma migration.

- Real Neon Staging project: **stordex-staging** / **dry-feather-14704968**
- Real Neon Staging branch: **staging** / **br-sparkling-boat-ao9nrctp**
- Real Neon Staging DB: **neondb**
- Real source baseline: **29 public tables, 11 completed Prisma migrations**
- Future actual Production: AWS Tokyo, explicitly OUT OF SCOPE.

The unapproved draft SQL exists in docs/migration-proposals/20261112_credit_currency_and_approval/001_additive_schema_DRAFT_DO_NOT_APPLY.sql, not in prisma/migrations. No actual Staging/Production SQL is applied by this CI update.

## Automated candidate gate

The GitHub Actions disposable postgres:16 service first applies the existing 11 Prisma migrations, then rehearses the draft audit DDL and existing tenant/approval/VOID concurrency tests. New CI checks, on that **throwaway DB only**, now:

1. Run prisma db pull --print to generate a temporary Prisma 7 candidate schema containing all three new audit models and inverse relations.
2. Check exact required audit model fields, seller scope, independent maker/checker fields, immutable record timestamps and current operational model preservation.
3. Run prisma validate --schema against the temporary candidate.
4. Run prisma migrate diff --from-config-datasource --to-schema <temporary Prisma file> --exit-code and require zero representable drift.
5. Verify git diff --exit-code -- prisma/schema.prisma (no committed operational schema edit).

This is a **candidate extraction and validation gate**, not an actual tracked Prisma migration file. PostgreSQL partial unique indexes, CHECKs, triggers and concurrency/immutability policies may not be fully represented in Prisma and require additional SQL assertions and database UAT before release.

## P1012 schema compatibility issue detected and draft-only correction

The first full Prisma 7 validate invocation returned P1012 twice:
- A single-field unique index on the CreditNote review record was interpreted as a one-to-one relation even though its foreign key references a three-column seller-scoped key.
- A partial unique index on an evidence event was interpreted as unconditional uniqueness on evidenceId; that would incorrectly prevent retaining both a VERIFIED and a later REVOKED audit event.

The draft SQL now explicitly models composite uniqueness for the CreditNote/referenced Invoice/seller key and uses **expression unique indexes** for the initial verification decision and later revocation events. Expression indexes allow the correct two-event history and are enforced by PostgreSQL while avoiding a misleading Prisma one-to-one field. CI validates the resulting one-to-many event model, exact audit uniqueness, and all existing concurrency/immutability checks against disposable PostgreSQL. The extra composite unique index is logically redundant but intentionally documents a valid Prisma-representable composite reference.

This correction was made only inside the unapproved SQL proposal, NOT in live Staging.

## Mandatory remaining gates

- Authenticated, tenant-scoped private immutable original invoice file custody and independent JPY-document verification. A SHA-256 match on untrusted bytes and untrusted digest is NOT authenticity.
- Server-owned trusted invoice financial snapshot and its immutable provenance, computed in a consistent transaction; not a browser-provided hash.
- A proper reviewed Prisma schema and generated 12th migration with exact SQL checksum, and full disposable DB and migration drift rehearsal.
- Independent accounting/security review of credit tax calculation, evidence lifecycle and source-status invalidation.
- Before any real Staging migration: fresh encrypted external source backup, independent Restore and contents comparison, then SEPARATE exact-target authorization on the project/branch/DB.
- Real Staging UI reallocation of the previously VOID-released two units is still a separate, unexecuted user-approved test.

The finance issue, offset, settlement and refund pathways remain disabled. The existing DRAFT/VOID-only header constraint and six Staging B2B flags remain unchanged.
