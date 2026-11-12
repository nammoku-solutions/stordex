# Stordex — bounded plan from current Staging to initial Production
Updated: 2026-11-12. Planning artifact; not a deployment authorization.

## Product finish line

Initial Production is "done" only after:
1. All features **explicitly included in initial-release scope** have passed integrated Staging UAT and data migration tests.
2. No critical/high open findings, permission bypasses, tenant leaks, negative/double movements, broken CSV round trips or untraceable financial adjustments.
3. Neon staging additive migration history and backups are consistent and all required schema migrations are reconciled; recovery/PITR has been demonstrated.
4. Codex Astra full-code review covers correctness, security, performance, maintainability and cloud infrastructure; ALL blocking findings fixed and re-reviewed for documented PASS. (Issue #87, hard gate.)
5. User approves a specific, reviewed AWS Tokyo Production deployment. AWS OIDC, Aurora backup/PITR, smoke tests, incident/rollback runbooks ready. (Issues #4/#5.)
6. No unapproved Production mutations. "CI green" alone is not release sign-off.

## Eight remaining major workstreams, each with exit criteria

| Gate | Domain | Current evidence | Remaining tasks | Exit condition |
|---|---|---|---|---|
| 1 | CreditNote finance | Draft allocation, audited VOID, pure JPY tax preview and seller-only UI UAT PASS; evidence/approval pure policy implemented | 12th evidence/approval ledger draft -> independently approved migration -> actual source-document verification -> maker/checker monetary reconciliation -> issue/credit/settlement records | Formal credit is traceable and never adjusts original invoice/stock incorrectly; mixed rate/partial/multiple cases PASS |
| 2 | Post-shipment return flow | Buyer return, seller review, physical dispatch/inspection, status audit tested in Staging; one 2-unit VOID completed | Reallocate released two units in distinct authorized UAT; repeat/partial/mismatch and multi-return stock/credit invariants; buyer and seller views and final closing states | Full buyer-to-seller return lifecycle and audit replay PASS (Issue #82) |
| 3 | Stocked/on-demand + counted receiving | Item STOCKED/ON_DEMAND and pack policy components exist in repo; scope not yet closed | Finish dashboards, minimum alerts, free-vs-reserved inventory, per-supplier packs, counted partial/over/under receiving, discrepancy-ledger and E2E tests | Item/PO/receiving/dashboard/CSV quantities reconcile under concurrency (Issue #88) |
| 4 | CSV and historical migration | Import/export components and staging order/stock UAT exist; Issue #62 remains open | Complete all masters and order/PO history, historical inventory ledger, idempotent tenant-safe import, Shift_JIS/BOM/formula guards and round-trip | All required files export/import into isolated tenant and exactly reconcile (Issue #62) |
| 5 | Notifications | Issue #110 product request is open | Event matrix, deduplicated transactional outbox, settings, retries, sandbox-only Staging emails, privacy and rate limits | One eligible event => one scoped notification and recoverable retries; UAT PASS |
| 6 | Cross-system UAT/operations | Multiple individual Staging UATs PASS, 11 migrations present, independent Restore done in prior cycles | Final full journey matrix, load/latency, security regression, backup/PITR, support/guide updates, issue reconciliation | Complete Staging acceptance evidence and no open blocker |
| 7 | Final Codex Astra | Mandatory release gate declared | Whole repo audit + fixes + repeated regression; explicit PASS | Full codebase/migration/infra security/performance/refactor review PASS (Issue #87) |
| 8 | AWS Tokyo Production | Repo GitHub Actions OIDC workflow and initial schema migration scaffolding exist | Real AWS identity setup, Aurora, network/secrets, controlled migration, backup/PITR verification, deployment and smoke test | User-approved Production available and rollback/recovery verified (Issues #4/#5) |

Tasks for Gate 3 and Gate 4 should reuse already-merged features and existing draft PRs wherever safe; open GitHub Issues are not automatically proof a feature is absent, and old issue wording may predate actual Staging UAT.

## Initial release scope proposal (avoid an endless development loop)

**Include for v1**: authenticated multi-tenant operations, current B2B order workflow, inventory and SKU policy, counted receipts, required CSV workflows, return/credit audit with financially safe approved CreditNote handling, required notifications, basic admin and recovery documentation.

**After v1 / separate decisions**: fax OCR/cloud-fax integration (#63), optional large BI integrations, new security product, speculative public APIs and nonessential workflow variations. These are NOT blockers unless owner explicitly changes scope.

**Finance product decision before posting**: for v1 record manual refund/offset instructions with explicit status and audit instead of auto-initiating bank transfers; requiring real payment provider integration is a separate scope decision. Independent tax/accounting sign-off remains required.

## Implementation order and dependencies

1. Gate 1 schema design and Gate 2 remaining small UAT; get explicit owner permission for EACH real Staging migration or mutable UAT.
2. Finish app-side currency evidence and approval flows, then audited credit amount determination/issuance. No financial settlement effects until accounting/approval gates pass.
3. Gate 3 stock/receiving and Gate 4 CSV should be completed and tested against the final reconciliation rules, not each other in isolation.
4. Gate 5 notifications is best added after reliable business events have stabilized; provider should be sandboxed until UAT pass.
5. Gate 6 entire-product UAT, then Gate 7 **whole-code Codex Astra** final PASS, then Gate 8 user-approved AWS Production. Do not skip/reorder final two gates.

## Expected amount of work (planning range, not a promise)

- **8 major workstreams** remain; several have already completed large subpieces. Completing one workstream may require multiple PRs.
- A rough initial planning envelope is **roughly 12–25 focused PRs** across finish-the-core, audit/reconciliation, notifications, migration/rehearsal, final fixes and AWS setup. This can contract if draft PR work is reusable, or expand with discovered bugs/accounting requirements. Track gate exit checks instead of repeatedly adding a new undefined "next step".
- No fixed migration count should be asserted yet. The **12th proposed migration is not yet applied**. Other schema changes for inventory/CSV/notification may require separate additive migrations, but code-only work needs none.
- **Backup + Restore is not repeated for every PR**: one fresh encrypted backup + independent Restore for each approved schema-changing Staging release, plus rehearsal and extra copies only if source has changed or a verification fails. For proposed Migration 12 the planned minimum is one new pair once authorized, not now.
- Any new feature requested outside this v1 boundary should be triaged to a post-release backlog unless it is a security/correctness blocker.

## Technical environment and non-negotiable gates

- Neon **Staging** project: stordex-staging (dry-feather-14704968); branch staging (br-sparkling-boat-ao9nrctp); database neondb; 29 tables / 11 applied migrations at plan time.
- Independent recovery: project stordex-recovery-test (delicate-rice-23940930), branch internally named production (br-ancient-voice-aoutl8qq), NOT actual Production.
- Vercel Staging host: https://staging.stordex.jp. Six B2B flags remain OFF after UAT; do not enable for unsolicited testing.
- Actual Production target: AWS ap-northeast-1, only after feature completion + Codex Astra PASS + user release approval.
- Previous CreditNote VOID: one event and two retained historical units, active allocation 0. Reallocation into a new DRAFT has NOT been performed and must be approved separately.
- Issue #109 old Neon branch quota may still need reconciliation before new same-project clones, but a separate independent recovery project has been used. No archived branches may be deleted without express approval.
- Issue #70 old migration-ledger description is stale in part: 11 completed migrations now exist in Staging. Verify remaining repo/documentation reconciliation before closing the issue.
