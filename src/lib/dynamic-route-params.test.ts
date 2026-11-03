import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Next.js 15/16 supplies dynamic route params as a Promise.
 * Omitting await silently makes id undefined; Prisma findFirst may then
 * select an unrelated first record within the tenant.
 * Pin every dynamic business and print page to the correct contract.
 */
const routePages = [
  "(app)/customers/[id]/page.tsx",
  "(app)/invoices/[id]/page.tsx",
  "(app)/items/[id]/page.tsx",
  "(app)/orders/[id]/page.tsx",
  "(app)/orders/inbox/[id]/page.tsx",
  "(app)/purchase-orders/[id]/page.tsx",
  "(app)/quotations/[id]/page.tsx",
  "(app)/settings/business-units/[id]/page.tsx",
  "(app)/suppliers/[id]/page.tsx",
  "print/invoices/[id]/page.tsx",
  "print/orders/[id]/page.tsx",
  "print/orders/[id]/picking/page.tsx",
  "print/purchase-orders/[id]/page.tsx",
  "print/quotations/[id]/page.tsx",
] as const;

describe("Next.js dynamic route params regression", () => {
  it.each(routePages)("%s awaits the requested record ID", (path) => {
    const source = readFileSync(join(process.cwd(), "src", "app", path), "utf8");
    expect(source).toMatch(/params:\s*Promise<\{\s*id:\s*string\s*\}>/);
    expect(source).toMatch(/const\s*\{\s*id\s*\}\s*=\s*await\s+params/);
    expect(source).not.toMatch(/\bparams\.id\b/);
  });
});
