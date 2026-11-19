import { createHmac, timingSafeEqual } from "node:crypto";

export type ReviewTicketBinding = Readonly<{
  reviewerId: string; sellerTenantId: string; invoiceId: string; evidenceId: string;
  inspectedVersionId: string; inspectedDocumentSha256: string;
}>;

/** Short-lived proof that an authorized download was prepared, not that a human read it. */
export function createEvidenceReviewTickets(key: Uint8Array, now = Date.now) {
  if (key.byteLength !== 32) throw new Error("Invalid review ticket key");
  const secret = Buffer.from(key);
  const ttlMs = 15 * 60 * 1000;
  const mac = (binding: ReviewTicketBinding, deadline: string) =>
    createHmac("sha256", secret).update(JSON.stringify([
      "STORDEX_EVIDENCE_REVIEW_DOWNLOAD_V1", deadline, binding.reviewerId, binding.sellerTenantId,
      binding.invoiceId, binding.evidenceId, binding.inspectedVersionId, binding.inspectedDocumentSha256,
    ])).digest();
  return {
    issue(binding: ReviewTicketBinding) {
      const deadline = String(now() + ttlMs);
      return deadline + "." + mac(binding, deadline).toString("hex");
    },
    verify(ticket: string, binding: ReviewTicketBinding) {
      if (typeof ticket !== "string") return false;
      const [deadline, signature] = ticket.split(".");
      if (!/^\d{13}\.[a-f0-9]{64}$/.test(ticket)) return false;
      const current = now();
      if (Number(deadline) <= current || Number(deadline) > current + ttlMs) return false;
      return timingSafeEqual(Buffer.from(signature, "hex"), mac(binding, deadline));
    },
  };
}
