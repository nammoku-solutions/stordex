import { z } from "zod";
import { evidenceUatOrigin } from "./b2b-credit-evidence-uat";
import { isEvidenceScopedId } from "./b2b-credit-original-document-review-access";
import { MAX_ORIGINAL_INVOICE_PDF_BYTES } from "./b2b-credit-original-document-storage";
import type {
  OriginalInvoiceRevocationInput, TicketedInvoiceDecisionInput,
} from "./b2b-credit-original-document-decision";

const privateHeaders = { "Cache-Control": "private, no-store", "Cross-Origin-Resource-Policy": "same-origin" };
const evidenceId = z.string().refine(isEvidenceScopedId);
const eventId = z.uuid();
const reason = z.string().trim().min(8).max(500);
const command = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("download"), evidenceId }),
  z.strictObject({ operation: z.literal("revoke"), evidenceId, eventId, reason }),
  z.strictObject({
    operation: z.literal("decide"), evidenceId, eventId, reason,
    decision: z.enum(["VERIFIED", "REJECTED"]), reviewTicket: z.string().regex(/^\d{13}\.[a-f0-9]{64}$/),
    observation: z.strictObject({
      originalInvoiceNumber: z.string().trim().max(128), explicitCurrency: z.string().trim().max(12),
      inspectedOriginal: z.literal(true),
    }),
  }),
]);
export type EvidenceSummary = {
  id: string; state: "PENDING" | "VERIFIED" | "REJECTED" | "REVOKED" | "UNAVAILABLE";
  canReview: boolean; canRevoke: boolean;
};
export type EvidenceUatHandlers = {
  list(invoiceId: string): Promise<EvidenceSummary[] | null>;
  upload(invoiceId: string, bytes: Uint8Array): Promise<"RECORDED" | "RECONCILE" | "REJECTED">;
  download(invoiceId: string, evidenceId: string): Promise<Response>;
  decide(input: TicketedInvoiceDecisionInput): Promise<boolean>;
  revoke(input: OriginalInvoiceRevocationInput): Promise<boolean>;
};

const json = (body: object, status = 200) => Response.json(body, { status, headers: privateHeaders });
export const evidenceUnavailable = () => new Response(null, { status: 404, headers: privateHeaders });

async function boundedBody(request: Request, max: number) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d{1,12}$/.test(length) || Number(length) > max)) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    if (total === 0) return null;
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  } finally {
    reader.releaseLock();
  }
}

/** Runtime guard and single-origin HTTP boundary. No permissive CORS. */
export function createEvidenceUatHttp(deps: { enabled: () => boolean; initialize: () => Promise<EvidenceUatHandlers | null> }) {
  return async (request: Request, invoiceId: string) => {
    if (!deps.enabled() || !isEvidenceScopedId(invoiceId) ||
        new URL(request.url).origin !== evidenceUatOrigin ||
        (request.method !== "GET" && request.method !== "POST")) return evidenceUnavailable();
    if (request.method === "POST" && (request.headers.get("origin") !== evidenceUatOrigin ||
        request.headers.get("x-stordex-evidence-request") !== "1")) return evidenceUnavailable();
    try {
      const handlers = await deps.initialize();
      if (!handlers) return evidenceUnavailable();
      if (request.method === "GET") {
        const entries = await handlers.list(invoiceId);
        return entries ? json({ entries }) : evidenceUnavailable();
      }
      const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (contentType === "application/pdf") {
        const bytes = await boundedBody(request, MAX_ORIGINAL_INVOICE_PDF_BYTES);
        if (!bytes) return json({ error: "INVALID_PDF" }, 400);
        const result = await handlers.upload(invoiceId, bytes);
        if (result === "RECONCILE") return json({ status: result }, 202);
        return result === "RECORDED" ? json({ status: result }, 201) : json({ error: "PDF_NOT_ACCEPTED" }, 422);
      }
      if (contentType !== "application/json") return json({ error: "UNSUPPORTED_CONTENT_TYPE" }, 415);
      const bytes = await boundedBody(request, 8192);
      if (!bytes) return json({ error: "INVALID_COMMAND" }, 400);
      let body: unknown;
      try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { return json({ error: "INVALID_COMMAND" }, 400); }
      const parsed = command.safeParse(body);
      if (!parsed.success) return json({ error: "INVALID_COMMAND" }, 400);
      const input = parsed.data;
      if (input.operation === "download") return await handlers.download(invoiceId, input.evidenceId);
      if (input.operation === "decide") return await handlers.decide({ ...input, invoiceId }) ? json({ recorded: true }) : evidenceUnavailable();
      return await handlers.revoke({ ...input, invoiceId }) ? json({ recorded: true }) : evidenceUnavailable();
    } catch {
      return evidenceUnavailable();
    }
  };
}
