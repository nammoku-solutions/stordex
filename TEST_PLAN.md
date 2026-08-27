# Stordex Test Plan

## Test levels

| Level | Purpose | Environment | Tool |
|---|---|---|---|
| Unit (UT) | pure logic / security helper validation | Local / CI | Vitest |
| Integration (IT) | Prisma + PostgreSQL / server behavior | Local / CI | Vitest + PostgreSQL 16 |
| Functional (FT) | screen / workflow behavior | Local | Browser + manual checklist |
| System / UAT | end-to-end business flow | Staging | Vercel + Neon + manual checklist |
| Production Smoke | post-deploy critical path | Production | Browser / operational checks |

## Automated CI baseline

`.github/workflows/ci.yml` uses Node.js 22 and PostgreSQL 16 and executes:

```bash
npm ci
npm audit --omit=dev --audit-level=low
npx prisma generate
npx prisma db push --skip-generate
npm run typecheck
npm test
npm run build
```

CI additionally verifies that production build did not mutate tracked repository files.

Full `npm audit` is reported for visibility. Production dependency advisories are blocking; dev-only findings are reviewed separately based on exploitability.

## Priority test areas

1. Authentication / tenant status
2. Tenant isolation
3. Cross-tenant relation-ID rejection
4. Customer / Supplier / Item / Business Unit master data
5. Order status transition and stock decrement/restore
6. Quotation
7. Purchase Order and receiving stock increment
8. Invoice aggregation / tax behavior
9. Inventory movement
10. Reports
11. Signup invitation lifecycle
12. Legacy XML import authorization / parsing / tenant scope
13. Print views

## Security regression rules

Any feature that accepts record IDs from the browser must include tests or review evidence for tenant ownership.

Examples:

- a Tenant A user cannot create an Order using Tenant B's `customerId`
- a Tenant A user cannot assign Tenant B's `supplierId` to an Item
- a Tenant A user cannot create an Invoice using Tenant B's `businessUnitId`
- a signup invitation cannot be claimed twice concurrently
- STAFF cannot perform legacy XML import

Pure ownership guards are covered by `src/lib/tenant-resources.test.ts`. High-risk Server Actions / Route Handlers should gain integration coverage as they evolve.

## Acceptance criteria

A release candidate must satisfy:

- production dependency audit passes
- TypeScript check passes
- all automated tests pass
- production build passes
- High-priority manual cases pass for changed business areas
- no known cross-tenant data path introduced
- DB schema changes have an explicit staging/production plan

High severity business failures include:

- tenant data leakage
- authorization bypass
- stock corruption
- duplicate/invalid billing
- amount/tax calculation errors
- destructive import behavior

## Recommended change cycle

```text
Code change
   |
   v
CI: audit + typecheck + test + build
   |
   v
PR review
   |
   +--> Staging FT/UAT when business behavior changed
   |
   v
main / production approval
   |
   v
Production smoke
```

## Manual functional/system cases

Use [`TEST_CASES.md`](TEST_CASES.md) as the detailed checklist. When a code change alters expected behavior, update the test case document in the same PR.

## Test data

| Environment | Data policy |
|---|---|
| CI | disposable PostgreSQL service |
| Local | `prisma/seed.ts` demo tenants/data |
| Staging | test or anonymized data only |
| Production | real data; smoke tests must avoid destructive operations |

The seed intentionally contains multiple tenants to make tenant isolation validation possible.

## Future automation candidates

- API / Server Action tenant isolation integration tests
- signup concurrency integration test
- Playwright critical business flows
- print-page snapshot/visual checks
- production deployment smoke automation with non-destructive test account
