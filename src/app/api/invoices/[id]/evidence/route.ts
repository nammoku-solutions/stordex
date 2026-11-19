import { createEvidenceUatHttp } from "@/lib/b2b-credit-evidence-http";
import { evidenceUatEnabled } from "@/lib/b2b-credit-evidence-uat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = createEvidenceUatHttp({
  enabled: evidenceUatEnabled,
  initialize: async () => (await import("@/lib/b2b-credit-evidence-runtime")).initializeEvidenceUat(),
});

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  return handle(request, (await params).id);
}
export async function POST(request: Request, { params }: Context) {
  return handle(request, (await params).id);
}
