# B2B CreditNote — seller-only, read-only amount preview UI

Date: 2026-11-11. Feature branch:
feat/b2b-credit-readonly-preview-ui-20261111.

## Scope
- A new strictly Preview/staging-only feature switch:
  STORDEX_B2B_CREDIT_PREVIEW_ENABLED=true. Default OFF everywhere.
  This is **independent** of the DRAFT/VOID/return/stock/status flags.
- Seller OWNER/ADMIN only; authenticated active tenant enforced before any
  scoped read. Buyer or STAFF cannot access the route. Server-side query
  includes the seller tenant ID.
- A link on the original seller Invoice detail leads to:
  /credit-notes/preview?returnRequestId=<same-seller-INSPECTED-return-id>.
  Links appear only when the switch is enabled.
- The route uses a PostgreSQL Repeatable Read transaction and Prisma
  SELECT/count only, with no writes, locks, POST actions or migrations.
- Read the original issued/paid Invoice with all its InvoiceOrder-linked
  seller Orders and seller OrderItem snapshots. Read the official return,
  approved and inspected units and other active CreditNote allocations.
  The IntercompanyOrderItem.sellerOrderItemId is the only accepted mapping.
- Reject ambiguous Invoice matches, disconnected trading relationships,
  non-inspected returns, nonreceived buyer PO, wrong seller Order status,
  incomplete/suspect amounts/lines, missing mapping, source overlap,
  or active CreditNotes besides historical VOID notes.
- Reuse src/lib/b2b-credit-readonly-amounts.ts from PR #156: one
  invoice-wide tax delta when taxPerOrder=false, or independent
  original-order tax deltas when true. Tax is never naïvely rounded per
  returned line.
- Default quantity is ALL currently inspected and unallocated units
  on this ONE returned request. No changes or allocations made.
- No hidden assumptions about original invoice currency. Invoice
  currently lacks currencyCode. Before displaying illustrative yen
  amounts the user must tick manual original-invoice JPY confirmation
  in a GET-only form. This is **not** verified currency provenance and
  is **not stored**, signed or audit-worthy. It cannot authorize money.
- Always mark calculation provisional. Money and tax amounts are NOT
  saved to B2BCreditNote or B2BCreditNoteLine. No issue, cancel,
  refund, offset, settlement, inventory movement or email.

## Live environment identity

Neon source:
- project: stordex-staging
- project_id: dry-feather-14704968
- branch: staging
- branch_id: br-sparkling-boat-ao9nrctp
- database: neondb

Existing Stage baseline after PR #156: 29 public tables, 11 completed
migrations, one VOID CreditNote, one append-only VOID event, original
two-unit line retained, active reserved units zero, seller Invoice
I-202611-0001 still ISSUED at JPY 4,840, stock unchanged.

Recovery-only independent Neon:
- project stordex-recovery-test, project_id delicate-rice-23940930
- branch name production, branch_id br-ancient-voice-aoutl8qq
  (this name is misleading: it is NOT real Production).
- original restore database: stordex_restore_post_credit_20261111.

## Safe rollout and UAT

1. PR builds/tests in isolated CI; no DB migration, so no fresh
   backup/Restore cycle required for this code-only phase.
2. Merge to staging only after typecheck, unit/integration tests,
   dependency audit, and Vercel build PASS. Keep all existing flags OFF
   and leave new preview flag missing/OFF on Staging and Production.
3. Any manual preview UAT requires separate owner consent. If approved,
   create ONLY the new Staging Preview/gitBranch=staging switch, redeploy
   the same Staging Git commit, and point staging.stordex.jp to READY.
4. Open the seller Invoice for I-202611-0001 as seller OWNER/ADMIN;
   follow the read-only preview link for the INSPECTED return.
5. Verify no amounts before manual JPY checkbox. With manual JPY
   confirmation, expect 2 x 880 = 1,760 net, 176 tax, 1,936
   illustrative gross, and 2,904 illustrative remaining invoice.
   Verify buyer/STAFF/foreign seller cannot access. Verify nothing
   writes or reserves, and the original VOID event remains exactly one.
6. Set the preview flag OFF, redeploy/alias to READY and audit the
   original seller/buyer balances, historical VOID and invoice total.
7. The previously released two units have not been reallocated to
   a replacement DRAFT. That is a different UAT, not done here.

## Unresolved approval gates

The current Invoice database model has no currency provenance. A
one-time browser checkbox does not fix that defect. Before accepting
a financial credit write, formal accounting/qualified-return-invoice
review and immutable currency/source snapshots are mandatory.
Maker/checker separation, money/tax caps, mixed tax rates,
discount/prior-credit handling, audit and idempotency need independent
design/test/authorization. A 12th Staging migration would require
separate user permission following fresh encrypted backup and
independent Restore verification. Do not deploy to Production until
all functionality plus Codex Astra whole-repo final review PASS.
