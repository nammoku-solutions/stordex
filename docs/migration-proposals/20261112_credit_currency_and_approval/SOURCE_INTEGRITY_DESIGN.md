# CreditNote 原本請求書の整合性 — code-only phase (2026-11-12)

## Exact boundary

Staging Neon: project **stordex-staging** \`dry-feather-14704968\`, branch **staging** \`br-sparkling-boat-ao9nrctp\`, DB **neondb**. Production: future AWS Tokyo, **not touched**. This change remains a draft-only Migration #12; existing 29 tables / 11 migrations unchanged. Six B2B feature flags stay OFF.

## Source digest contract (now implemented, pure and read-only)

\`src/lib/b2b-credit-source-integrity.ts\` exposes:
- \`computeOriginalInvoiceFinancialFingerprint(source)\`: verified **arithmetic-shape and ownership checks** across one seller's Invoice, linked Orders and OrderItems. Returns a canonical SHA-256 prefixed internally with \`STORDEX_INVOICE_FINANCIAL_SOURCE_V1\` so an algorithm change cannot silently reinterpret an old digest. Sorts Orders and OrderItems by stable IDs before hashing to avoid UI/order traversal differences.
- \`compareOriginalInvoiceBytesToTrustedDigest(bytes, trustedSha256)\`: streams through only an in-memory Uint8Array digest comparison with a 10MiB cap. It must receive the SHA-256 saved by a **separate, independently trusted private object store**, not a digest submitted by a client. This primitive returns a mere byte-match Boolean and **cannot** grant currency verification, monetary approval or issue a credit.

A fingerprint includes invoiceId, sellerTenantId, invoiceNumber, issueDate, accounting period, integer yen subtotal/tax/total, percentage tax, invoice-wide-vs-per-Order tax mode, orderId, sellerTenantId, original order accounting amounts/tax rates, each lineId/itemId/quantity/unitPrice/amount. It checks line arithmetic, required complete source structure, tenant ownership, duplicate linked lines, original subtotal and tax-mode consistency. The digest intentionally **does not** assume a verified currency, nor rely on a mutable \`ISSUED\`->\`PAID\` status (allowed statuses must be checked separately in the trusted DB transaction).

**Not yet implemented:** full trusted DB query collecting original issueDate, InvoiceOrder mappings, OrderItem snapshots and source files in one server-owned consistent read; immutable private file upload/storage; signed/revocable evidence status; maker/checker action; exact tax/legal requirements. Never accept the fingerprint as proof when input records can come from the browser. No current database contains verified document evidence.

## Concurrent Invoice mutation (now tested on disposable CI PostgreSQL)

The proposed SQL has \`FOR SHARE\` on the Invoice and checks its amount/tax-rate/mode against the immutable CreditNote snapshot. CI synthetic fixtures assert:
1. The Invoice edit **commits first** while review waits: review fails closed because original financial snapshot no longer matches. No audit approval is inserted.
2. The review **commits first** while Invoice edit waits for the row lock. The edit cannot interleave mid-review. A later edit is still possible: the accepted audit becomes **historical only**, and a future monetary issuer **must re-evaluate live Invoice and source/evidence checks** immediately before posting.
3. A cancelled Invoice blocks new review.
4. The DRAFT/VOID-only database constraint, no financial amounts stored, no production/staging mutation remain true.

The current draft SQL cannot make a historical review irrevocable against a future Invoice edit. Future financial writers must revalidate the source fingerprint, unchanged issue context, current verified-and-unrevoked evidence, credit allocation, competing posted credits, two-user accounting signoff and amount caps inside a serializable, idempotent transaction. They must never treat the presence of an accepted review row as a live grant.

## Prisma and migration plan

- Existing Prisma \`schema.prisma\` remains unchanged; current CI introspects 3 draft ledger models from a throwaway PostgreSQL copy with Prisma 7, then checks the original schema file was not mutated.
- The SQL proposal stays under \`docs/migration-proposals\`, not \`prisma/migrations\`.
- Before a future 12th real migration, create a reviewed Prisma candidate aligned with actual foreign keys and DB triggers. Test drift on a disposable database; ensure the real migration's SHA-256 is recorded in the release gate.
- Obtain explicit permission for source-specific encrypted backup + independent Restore before real Staging application, and **separate explicit permission to apply** after the restore PASS.
- Actual source object storage should be private, tenant-scoped, immutable/versioned, malware/size scanned, evidence uploader/reviewer separated, and content hashes computed by trusted server code rather than client metadata.
- **Never** infer JPY from current UI checkbox; an issued Invoice document must explicitly and independently attest its currency.
