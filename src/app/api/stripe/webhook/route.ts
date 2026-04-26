import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Stripe Webhook 受信エンドポイント (Phase 1)。
 *
 * Stripe Dashboard or Stripe CLI で以下のイベントを購読:
 *   - checkout.session.completed
 *
 * 開発時 (Stripe CLI):
 *   stripe listen --forward-to localhost:3000/api/stripe/webhook
 *   → 表示された whsec_... を STRIPE_WEBHOOK_SECRET に設定
 */
export async function POST(req: Request) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "stripe not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid signature";
    return NextResponse.json({ error: `webhook error: ${msg}` }, { status: 400 });
  }

  // 重複処理防止（同じ event.id を既に処理済みか確認）
  // ※ BillingEvent テーブルは Phase 2 で正式追加予定。Phase 1 はベストエフォート。

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_email?.toLowerCase() ?? null;
    const companyName = (session.metadata?.companyName as string | undefined) ?? null;
    const plan = (session.metadata?.plan as string | undefined) ?? "standard";

    if (!email) {
      console.error("[stripe webhook] checkout.session.completed without customer_email");
      return NextResponse.json({ received: true });
    }

    // 招待トークンを発行（既存の SignupInvitation を流用）
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14日有効

    const invite = await prisma.signupInvitation.create({
      data: {
        token,
        companyName,
        allowedEmail: email,
        plan,
        expiresAt,
        createdBy: "stripe-webhook",
        note: `Stripe checkout session: ${session.id}`,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const signupUrl = `${baseUrl}/signup?token=${encodeURIComponent(token)}`;

    // TODO: Resend / SES などで顧客に signupUrl をメール送付
    // 現在はサーバーログに出力。運用者が手動で送るか、メール送信を実装する。
    console.log("[stripe webhook] 招待発行:", {
      inviteId: invite.id,
      email,
      companyName,
      signupUrl,
    });
  }

  return NextResponse.json({ received: true });
}
