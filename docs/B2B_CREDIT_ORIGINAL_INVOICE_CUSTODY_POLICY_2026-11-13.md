# CreditNote: original Invoice intake, private-storage adapter and review preflight

Prepared 2026-11-13. Release phase: **code and synthetic tests only; no cloud provisioning, application endpoint, live file custody, DB writes or financial effects**.

## Exact protected environment

- Neon Staging project: stordex-staging / dry-feather-14704968
- Neon Staging branch: staging / br-sparkling-boat-ao9nrctp
- Database: neondb (29 tables, 11 applied migrations, draft Migration #12 NOT applied)
- Vercel: https://staging.stordex.jp ; all six B2B feature flags OFF.
- Actual Production (AWS Tokyo) unchanged.

## What was implemented

The pure function prepareOriginalInvoiceForPrivateStorage in src/lib/b2b-credit-original-document-policy.ts accepts a **server-authenticated user/tenant context**, a trusted original Invoice ID/tenant/status, and the candidate PDF name/MIME/bytes.

It fail-closes on:
- Wrong seller / inactive tenant, unauthorized STAFF role, bad IDs;
- Original invoice not ISSUED/PAID;
- Unsafe filename (path traversal and control characters), non-PDF MIME;
- Invalid PDF signature/version/terminator, empty, excessive-size or suspicious trailing payload.

If format and scope checks pass, the function computes SHA-256 **from bytes** and proposes a unique seller/Invoice-namespaced opaque private key. It explicitly returns storageCompleted=false, independentReviewCompleted=false, currencyVerified=false, and financialPostingAllowed=false in all accepted results.

**This is not a PDF security scanner, virus protection, document signature validator, issuer identity check, file upload, S3 integration, encryption, data persistence, nor verification of JPY legal/source content.** An attacker can craft a PDF with plausible bytes; such a file remains **unverified**.

## Authenticated source preparation

`prepareAuthenticatedOriginalInvoiceDocument` connects the PDF intake policy to the current session and Prisma read path. It re-reads the current seller OWNER/ADMIN membership and active tenant from the database, then loads only that seller's issued or paid invoice in the same Repeatable Read snapshot. It rejects inconsistent or cross-tenant order/item references and computes the existing canonical financial fingerprint independently from the PDF digest.

The helper is not exposed as a route or server action. Its returned private key is only a proposal, and the PDF bytes are never stored. The caller of a future writer must revalidate current access and source state at the write boundary and persist only independently verified storage metadata. Neither digest proves the PDF came from the issuer or identifies its currency.

## Storage and independent review components

The server-side S3 adapter sends writes to a configured bucket/account with an explicit KMS key, SHA-256 checksum and a conditional create (no replacement of an existing current object). It refuses a receipt unless the response supplies the expected encryption, checksum and a non-null version ID. Reads require the recorded version, seller/invoice scope, matching metadata and a bounded byte-for-byte hash check. No URL is returned and there is no delete operation.

The separate review preflight refuses the original uploader, an inactive seller or a non-manager, other tenant/invoice references, and changed/cancelled invoice sources. The reviewer supplies the invoice number and explicit currency observed in the original. Matching the exact stored version and the current financial fingerprint only makes the review ready to record. It does not record the review or set currency as verified.

Tests use a fake S3 client and synthetic bytes. No cloud or browser UAT has been run for these components.

## Integration and security prerequisites before a real uploader

1. Use the authenticated source helper for intake and revalidate seller membership and source state at the write boundary. Never accept browser-supplied tenant, role, storage key, or digest as authoritative.
2. Provision a dedicated private, versioned bucket with Block Public Access and Bucket Owner Enforced, require TLS and the exact SSE-KMS key in policy, and grant only needed prefix-scoped PutObject/GetObjectVersion plus key permissions. Do not grant delete or public access. Define retention/version deletion separately. Test the adapter against an isolated bucket using synthetic files.
3. Scan uploaded bytes for threats and potentially active PDF content; enforce file size, rate limits, quotas, safe content handling, and secure document rendering. MIME/header/EOF are lightweight filters only.
4. Persist the server-derived SHA-256 and explicit immutable S3 version ID in the proposed tenant-scoped ledger, with append-only audit events and separate uploader/reviewer. Define idempotent upload/finalization, ambiguous-response recovery and orphan handling before enabling the writer. An ETag is not a SHA-256 or a version ID.
5. Independently inspect the actual issued Invoice document and explicitly attest JPY/issue context; compare source snapshot hash calculated server-side over Invoice/Orders/OrderItems and original file byte hash read back from trusted storage.
6. Re-read/verify original issue status, source snapshot, document revocation and accounting signoff in a serializable transaction before any future monetary action. A past verification event alone is NEVER a live posting grant.
7. Create an actual Staging-only feature flag, test in Staging under authorized UAT, then turn it OFF. Avoid unapproved Production changes.

Existing CreditNote read-only preview and draft/VOID controls must not change. The proposed Migration #12 must not be applied without fresh external encrypted backup, independent Restore and separate exact Neon project/branch/DB approval. The separate two-unit reallocation UAT passed on Staging and the draft flag was restored to OFF.
