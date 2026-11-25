# Stordex Production Release Gate

**Required by product owner, 2026-10-19. Production deployment is BLOCKED until all checks are complete.** Tracker: GitHub Issue #87.

## Order of operations

1. Finish all features explicitly included in the agreed **v1 scope** (`docs/STORDEX_V1_RELEASE_SCOPE.md`), including stocked/on-demand product and pack/receipt workflows. Complete Staging integrated UAT and supporting manual. Deferred features are tracked but must not silently expand the release gate.
2. Consolidate stacked PRs in dependency order, secure application and third-party dependencies (Issue #64), and reconcile Prisma migration history on a separately rehearsed Neon copy before Staging (Issue #70). Maintain backups, verified rollback path and stable CI.
3. **Run Codex Astra Review across the entire repository only after feature implementation is complete**. Split by domain if helpful, but combine coverage so all source code, infrastructure, CI, scripts, database migrations, security boundaries, performance and maintainability are reviewed. Explicitly inspect for code that breaks existing functionality, security vulnerabilities, inefficient behavior, architecture issues and possible refactor opportunities.
4. Record every finding with severity and file/location, apply fixes, add or update tests and re-run reviews. Every blocking finding must be resolved and the whole planned code must receive **PASS**, not merely an automated CI green.
5. Only after a documented **Codex Astra Review PASS** and owner approval may Production be deployed. Production resources must be in Tokyo (`ap-northeast-1`) as planned; no unreviewed change may bypass this gate.

## Status (2026-11-25)

- **Release scope:** `docs/STORDEX_V1_RELEASE_SCOPE.md` is authoritative. The 2026-11-03 feature audit is historical; it must not expand v1 to all deferred CSV restore, email, fax, monetary CreditNote or PDF evidence work.
- **Integrated Staging UAT:** PASS through buyer PO, bilateral seller draft/confirmation/shipping, counted receipt/stock, monthly invoice DRAFT, and owner-reported CSV export/import navigation and invoice print presentation. Reference `docs/STORDEX_V1_UAT_RUNBOOK.md`.
- **Concurrency preflight:** invoice creation was found to lack an order-level unique DB constraint. PR #192 serializes invoice DRAFT creation for one tenant and includes a disposable PostgreSQL race test. Astra must review all invoice writers and decide if a separately approved DB constraint is necessary.
- **Codex Astra full repository review:** **NOT YET PASSED**. Obtain an actual reviewer report on the **final Staging commit** covering the entire repository and all severity-blocking findings, then fix and re-review. A CI PASS, this preflight, or a review prompt is not an Astra PASS. Issue #87 remains open.
- **Production:** BLOCKED. AWS OIDC role, Aurora controlled migration, backup/PITR, Tokyo costs and manual deployment approval remain separate gates (#4, #5).

Follow `docs/STORDEX_V1_ASTRA_REVIEW_HANDOFF_2026-11-25.md` for coverage and findings format.

No deploy, migration, seeding or destructive operation against Production is authorized by this document.
