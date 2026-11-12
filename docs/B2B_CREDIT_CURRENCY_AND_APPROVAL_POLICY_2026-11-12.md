# Issue #82 — Currency evidence and maker/checker approval preflight (no writes)
Date: 2026-11-12.

## Current status / exact target

- Approved operational Staging: Neon project **stordex-staging**, id **dry-feather-14704968**, branch **staging**, id **br-sparkling-boat-ao9nrctp**, DB **neondb**.
- Only Staging and future Production exist as intended application environments. Vercel uses Preview environment variables *scoped to Git ref staging* for the Staging host.
- Git base: staging commit de043170d1d03f3e68ef0f1aab64c3eae540dd21 (PR #157), prior seller-only read-only preview PASS with all six B2B feature switches OFF.
- Baseline: 29 public tables, 11 migrations, 1 VOID CreditNote with immutable audit event and two released inspected units; original Invoice I-202611-0001 ISSUED at JPY 4,840, buyer stock 36, seller stock 138, 24 movements.
- Independent Restore project **stordex-recovery-test** (delicate-rice-23940930), branch internally named "production" (br-ancient-voice-aoutl8qq) is **NOT actual Production**.

## Why a Currency-Evidence Gate is needed

The existing Invoice model has integer subtotal/tax/total and taxPerOrder but no original invoice currencyCode. Existing CreditNote DRAFT stores "JPY" from the service, and the preview screen asks the operator for a browser-only JPY attestation. Neither is independent proof the historical invoice was issued in JPY. Do NOT silently upgrade a checkbox, display label, or operator-supplied document metadata to a verified financial record.

**Any genuine financial approval must first be blocked** until a separately approved immutable, tenant-scoped document/evidence record is available. The source original issued invoice should explicitly show the currency. Store its authenticated original file reference and SHA-256, linked invoice ID, seller tenant, immutable invoice+orders+lines snapshot hash, original issue identifier, submitter and independent reviewer IDs, evidence/review times, review method, current status, and append-only revocation/supersession history. Original source file and its checksum must be independently validated; passing a 64-hex string in an input object does not prove authenticity. Read back and recompute invoice snapshot server-side in a transaction, do not trust client-supplied hash or order totals.

This PR contains only a **pure fail-closed currency-evidence assessment** over a hypothetical future, independently authenticated and persisted evidence record. It does not create storage, upload forms, document review action, a signer or a currency-verification endpoint.

Checks:
- Original invoice ISSUED/PAID, same seller/invoice as trusted snapshot.
- Actual original issued-invoice document type, 64-hex digest and explicitly JPY-denominated source.
- Equal independently trusted source snapshot digest, independent submission and reviewer users, active seller OWNER/ADMIN reviewer, state VERIFIED, explicit independent original-document inspection, reviewedAt >= submittedAt, valid UTC timestamps.
- Revoked/rejected/pending/cross-tenant/mismatched/unsupported currency/missing evidence => blocked.
- Success still returns financialPostingAllowed=false.

## Maker/checker and accounting-review policy

A separate pure preflight accepts *hypothetical* server-trusted data representing:
- One draft CreditNote, its maker, original invoice and issuer context.
- One different active seller OWNER/ADMIN checker.
- Original invoice and credit source snapshot checksum matching independent server-computed snapshots.
- Verified JPY source evidence as described above.
- Credit subtotals/tax/gross: safe integer yen, net+tax=gross, 0 <= gross <= original invoice gross, consistent recalculated amount digest.
- No other open or posted CreditNotes against that invoice. VOID history does not consume allocation, but its immutable audit remains.
- Independent seller manager accounting/tax signoff tied to the same invoice and recomputed amount hashes; maker cannot sign own proposal.
- No competing adjustments or unknown prior posted credits. Existing credit issuance is explicitly not implemented.

When a hypothetical input meets all these checks, the function returns readyForFutureApprovalDesign=true, **but still** financialPostingAllowed=false and stateChangeAllowed=false. This means only that the proposed control flow passes a unit test, not that any approval was executed or stored.

This PR adds *no* credit issue, credit monetary storage, settlement, offset, refund, payment, mail, UI form action, API route, schema change, environment switch or migration. It cannot alter Staging data.

## Future work requiring independent approval

1. Product/finance decision: allowed currency (JPY-only for now), Japanese qualified return invoice requirements, tax-rate breakdown, discount and credit cap with multiple posted credits, concurrency, immutable source invoice snapshot and accountant signoff.
2. Schema proposal for **12th Migration**: immutable currency evidence, append-only verification/revocation events, maker/checker reviews, status history, credit note financial snapshot and status constraints; design transactions and invariants. Draft migration must not be applied until explicitly approved.
3. BEFORE ANY 12th Staging DB migration, fresh encrypted source backup, independent Restore into recovery project, 28+ table content/schema comparison, explicit user approval on exact Neon staging project/branch/DB, then schema-only change and UAT. No actual Production modifications.
4. Implement a *read-only status UI* after real evidence schema exists. A browser checkmark alone remains illustration only.
5. Separately obtain permission to reallocate the two released inspected units into a new DRAFT for a staging-only quantity UAT. This is intentionally not performed here.
6. Only after all features and whole-repo Codex Astra security/regression/performance/refactor review PASS may Production release be planned.

## Acceptance tests in this PR

- Evidence: original invoice, JPY source, file and source snapshot checksums, independent active seller reviewer, UTC chronology, revoked/foreign/invalid branches.
- Approval readiness: maker!=checker, seller tenant/role status, invoice issued, DRAFT only, source hash provenance, verified evidence, exact amount cap, accounting signoff, competition.
- Critically, both successful pure assessments still return financialPostingAllowed=false. No DB migration/backup/Restore needed merely to merge this source-only phase.
