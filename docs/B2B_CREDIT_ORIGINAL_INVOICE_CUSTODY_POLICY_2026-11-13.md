# CreditNote: original Invoice private-document intake policy (pre-storage only)

Prepared 2026-11-13. Release phase: **pure code, no DB, no actual file custody/storage, no financial effects**.

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

## Integration and security prerequisites before a real uploader

1. Use real server-side NextAuth session and DB-authoritative tenant/Invoice/role lookup, never browser-supplied context fields. A pure TypeScript input shape is not authentication.
2. Private, encrypted, object-locked or versioned storage (storage IAM least privilege, blocking public access). Server-generated object names ONLY; clients cannot choose private object references or source digest.
3. Scan uploaded bytes for threats and potentially active PDF content; enforce file size, rate limits, quotas, safe content handling, and secure document rendering. MIME/header/EOF are lightweight filters only.
4. Record the authoritative SHA-256 and immutable storage version/etag in the proposed tenant-scoped ledger under a separately reviewed Prisma migration, with append-only audit events and separate uploader/reviewer.
5. Independently inspect the actual issued Invoice document and explicitly attest JPY/issue context; compare source snapshot hash calculated server-side over Invoice/Orders/OrderItems and original file byte hash read back from trusted storage.
6. Re-read/verify original issue status, source snapshot, document revocation and accounting signoff in a serializable transaction before any future monetary action. A past verification event alone is NEVER a live posting grant.
7. Create an actual Staging-only feature flag, test in Staging under authorized UAT, then turn it OFF. Avoid unapproved Production changes.

Existing CreditNote read-only preview and draft/VOID controls must not change. The proposed Migration #12 must not be applied without fresh external encrypted backup, independent Restore and separate exact Neon project/branch/DB approval. Real mutable two-unit Staging reallocation UAT is also pending separate approval.
