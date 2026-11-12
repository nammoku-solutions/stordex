# CreditNote VOID → released 2-box reallocation — disposable DB rehearsal

Date: 2026-11-12. Scope: **CI-only PostgreSQL 16 data**; this is NOT the pending real Staging UI UAT.

## Exact real Staging environment (untouched)

- Neon project: **stordex-staging** (\`dry-feather-14704968\`)
- Neon branch: **staging** (\`br-sparkling-boat-ao9nrctp\`)
- Database: **neondb**
- Original baseline: 29 tables, 11 completed Prisma migrations; 1 VOID CreditNote and one VOID audit, original 2-unit line retained, zero active credit allocation. Original Invoice \`I-202611-0001\` ISSUED at JPY 4,840; buyer stock 36, seller stock 138; 24 inventory movements.
- All six B2B flags remain OFF. Never re-enable them or mutate this DB just to run this CI test. Future Production AWS Tokyo untouched.

## New synthetic tests (CI only)

The existing migration #12 CI rehearsal creates two additional complete seller/buyer trading workflows with **INSPECTED, two-unit B2B returns**. For each:
1. Start with an original DRAFT containing one two-unit line and no monetary amounts.
2. A second independent DRAFT's attempt to reserve the same two units **before** original VOID is rejected by the PostgreSQL source-return-item lock and inspected-budget invariant.
3. Original DRAFT is VOIDed through existing actual database transition triggers, with a valid separate reviewer, reason, event UUID, timestamp and **exactly one append-only VOID audit**; its original two-unit allocation row is retained unchanged.
4. A different DRAFT can then reserve the newly freed two units, without a new InventoryMovement and without altering Invoice monetary values.
5. Independently, two replacement DRAFTs race for the same two-unit budget **after** an original VOID. Exactly one allocation succeeds; the other is rejected by PostgreSQL. Active allocation cannot exceed two.
6. Credit monetary fields stay NULL. No issuing, settling, refunding, offsetting or stock mutation occurs.

Tests only run after the existing Prisma migrations and the draft migration #12 rehearsal in the GitHub Actions disposable \`postgres:16\` service. The 12th migration design is NOT registered in Prisma or applied to Staging. This CI test complements—but does NOT replace—the remaining **real seller OWNER/ADMIN Staging UI UAT** for the two released units.

## Release gate

Before real Staging UI quantity reallocation: obtain user's authorization for a temporary DRAFT flag enable on the exact Staging deployment; check unchanged baseline, run manual UAT, then DISABLE the flag and redeploy the same verified Staging commit, verify source DB hashes and stocks. The user's previous consent to a read-only preview is NOT consent for a new mutable DRAFT UAT.

The current PR is a code-only staging CI/operational document update. No new schema migration, source backup, independent Restore, or Production release is required here.
