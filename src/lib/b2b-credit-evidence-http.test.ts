import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/invoices/[id]/evidence/route";
import { createEvidenceUatHttp } from "./b2b-credit-evidence-http";
import { createEvidenceReviewTickets } from "./b2b-credit-evidence-ticket";
import { evidenceUatEnabled, evidenceUatOrigin as origin } from "./b2b-credit-evidence-uat";

const url = origin + "/api/invoices/invoice-one/evidence";
const post = (payload: object, headers = {}) => new Request(url, { method: "POST",
  headers: { origin, "x-stordex-evidence-request": "1", "content-type": "application/json", ...headers },
  body: JSON.stringify(payload),
});
const eventId = randomUUID();
const evidenceId = "evidence-one";
const runtimeInitialize = vi.hoisted(() => vi.fn());
vi.mock("@/lib/b2b-credit-evidence-runtime", () => ({ initializeEvidenceUat: runtimeInitialize }));
afterEach(() => vi.unstubAllEnvs());
const input = { operation: "decide", evidenceId, eventId, reason: "Confirmed the original file",
  reviewTicket: "1800000000000." + "d".repeat(64), decision: "VERIFIED",
  observation: { originalInvoiceNumber: "INV-1", explicitCurrency: "JPY", inspectedOriginal: true } };
function fixture() {
  const handlers = {
    list: vi.fn().mockResolvedValue([{ id: evidenceId, state: "PENDING", canReview: true, canRevoke: false }]),
    upload: vi.fn().mockResolvedValue("RECORDED"),
    download: vi.fn().mockResolvedValue(new Response("pdf", { headers: { "cache-control": "private, no-store" } })),
    decide: vi.fn().mockResolvedValue(true),
    revoke: vi.fn().mockResolvedValue(true),
  };
  const initialize = vi.fn().mockResolvedValue(handlers);
  const enabled = vi.fn().mockReturnValue(true);
  return { handlers, initialize, enabled, handle: createEvidenceUatHttp({ enabled, initialize }) };
}

describe("private evidence UAT HTTP boundary", () => {
  it("keeps the mounted API closed before loading its runtime on Vercel", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STORDEX_B2B_EVIDENCE_UAT_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "preview");
    const context = { params: Promise.resolve({ id: "invoice-one" }) };
    expect((await GET(new Request(url), context)).status).toBe(404);
    expect((await POST(post(input), context)).status).toBe(404);
    expect(runtimeInitialize).not.toHaveBeenCalled();
  });
  it("is off by default and cannot activate on production or Vercel", () => {
    const flags = { APP_ENV: "staging", STORDEX_B2B_EVIDENCE_UAT_ENABLED: "true" };
    expect(evidenceUatEnabled({})).toBe(false);
    expect(evidenceUatEnabled({ ...flags, APP_ENV: "production" })).toBe(false);
    expect(evidenceUatEnabled({ ...flags, VERCEL: "1" })).toBe(false);
    expect(evidenceUatEnabled({ ...flags, VERCEL_ENV: "preview" })).toBe(false);
    expect(evidenceUatEnabled({ ...flags, VERCEL_ENV: "production" })).toBe(false);
    expect(evidenceUatEnabled({ ...flags, STORDEX_B2B_EVIDENCE_UAT_ENABLED: "TRUE" })).toBe(false);
    expect(evidenceUatEnabled(flags)).toBe(true);
  });
  it("does not initialize storage, identity or the database if disabled or cross-origin", async () => {
    const { enabled, initialize, handle } = fixture();
    enabled.mockReturnValueOnce(false);
    for (const request of [
      new Request(url), post(input, { origin: "https://elsewhere.invalid" }), post(input, { "x-stordex-evidence-request": "" }),
      new Request(url.replace("staging.stordex.jp", "preview.invalid")),
    ]) expect((await handle(request, "invoice-one")).status).toBe(404);
    expect(initialize).not.toHaveBeenCalled();
  });
  it("routes the four actions without accepting caller-defined scope, storage versions or hashes", async () => {
    const { handle, handlers } = fixture();
    const listed = await handle(new Request(url), "invoice-one");
    expect(listed.headers.get("cache-control")).toBe("private, no-store");
    expect(await listed.json()).toEqual({ entries: [{ id: evidenceId, state: "PENDING", canReview: true, canRevoke: false }] });
    expect((await handle(post({ operation: "download", evidenceId }), "invoice-one")).status).toBe(200);
    expect((await handle(post({ ...input, sellerTenantId: "other" }), "invoice-one")).status).toBe(400);
    expect((await handle(post({ ...input, inspectedVersionId: "other" }), "invoice-one")).status).toBe(400);
    expect((await handle(post({ ...input, reviewTicket: "" }), "invoice-one")).status).toBe(400);
    expect(handlers.decide).not.toHaveBeenCalled();
    expect((await handle(post(input), "invoice-one")).status).toBe(200);
    expect(handlers.decide).toHaveBeenCalledWith({ ...input, invoiceId: "invoice-one" });
    expect((await handle(post({ operation: "revoke", evidenceId, eventId, reason: "Correction of the original" }), "invoice-one")).status).toBe(200);
    expect(handlers.revoke).toHaveBeenCalledTimes(1);
  });
  it("bounds upload and JSON bodies and distinguishes uncertain uploads from confirmed registrations", async () => {
    const { handle, handlers } = fixture();
    const pdf = () => new Request(url, { method: "POST", headers: {
      origin, "x-stordex-evidence-request": "1", "content-type": "application/pdf",
    }, body: "%PDF-1.7\nsynthetic\n%%EOF\n" });
    const tooLarge = pdf();
    tooLarge.headers.set("content-length", String(10 * 1024 * 1024 + 1));
    expect((await handle(tooLarge, "invoice-one")).status).toBe(400);
    expect((await handle(post({ ...input, reason: "x".repeat(8192) }), "invoice-one")).status).toBe(400);
    expect(handlers.upload).not.toHaveBeenCalled();
    expect((await handle(pdf(), "invoice-one")).status).toBe(201);
    handlers.upload.mockResolvedValueOnce("RECONCILE");
    expect((await handle(pdf(), "invoice-one")).status).toBe(202);
    expect(handlers.upload).toHaveBeenCalledTimes(2);
  });
});

describe("private review ticket", () => {
  it("binds scope, user, evidence, exact version and hash without exposing them", () => {
    let time = 1_800_000_000_000;
    const tickets = createEvidenceReviewTickets(Buffer.alloc(32, 1), () => time);
    const binding = { reviewerId: "reviewer-one", sellerTenantId: "tenant-one", invoiceId: "invoice-one",
      evidenceId, inspectedVersionId: "exact-private-version", inspectedDocumentSha256: "a".repeat(64) };
    const ticket = tickets.issue(binding);
    expect(ticket).not.toContain(binding.inspectedVersionId);
    expect(tickets.verify(ticket, binding)).toBe(true);
    for (const field of Object.keys(binding) as (keyof typeof binding)[]) {
      expect(tickets.verify(ticket, { ...binding, [field]: "different" })).toBe(false);
    }
    expect(tickets.verify(ticket + "0", binding)).toBe(false);
    expect(createEvidenceReviewTickets(Buffer.alloc(32, 2), () => time).verify(ticket, binding)).toBe(false);
    time += 15 * 60 * 1000;
    expect(tickets.verify(ticket, binding)).toBe(false);
  });
});
