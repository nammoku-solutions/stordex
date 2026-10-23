# Stordex Production Release Gate

**Required by product owner, 2026-10-19. Production deployment is BLOCKED until all checks are complete.** Tracker: GitHub Issue #87.

## Order of operations

1. Finish all agreed product features, including stocked/on-demand product and pack/receipt quantity workflows (Issue #88). Complete Staging end-to-end UAT and supporting manual.
2. Consolidate stacked PRs in dependency order, secure application and third-party dependencies (Issue #64), and reconcile Prisma migration history on a separately rehearsed Neon copy before Staging (Issue #70). Maintain backups, verified rollback path and stable CI.
3. **Run Codex Astra Review across the entire repository only after feature implementation is complete**. Split by domain if helpful, but combine coverage so all source code, infrastructure, CI, scripts, database migrations, security boundaries, performance and maintainability are reviewed. Explicitly inspect for code that breaks existing functionality, security vulnerabilities, inefficient behavior, architecture issues and possible refactor opportunities.
4. Record every finding with severity and file/location, apply fixes, add or update tests and re-run reviews. Every blocking finding must be resolved and the whole planned code must receive **PASS**, not merely an automated CI green.
5. Only after a documented **Codex Astra Review PASS** and owner approval may Production be deployed. Production resources must be in Tokyo (`ap-northeast-1`) as planned; no unreviewed change may bypass this gate.

## Status

- **Codex Astra Review:** NOT STARTED — intentionally deferred until ALL planned features are complete.
- **Production deployment:** BLOCKED.
- **Staging:** used for safe iterative builds, manual and automated verification; Staging tests do not constitute PASS.
- The GitHub open Issue #87 is the release checklist and must not be closed until the review is complete.

No deploy, migration, seeding or data destructive operation against Production is authorized by this document.
