import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email(),
  companyName: z.string().min(1).max(100),
});

export async function POST(req: Request) {
  if (!isStripeConfigured() || !stripe) {
    return NextResponse.json(
      {
        error:
          "Stripe 決済は現在準備中です。お申し込みは support@nammoku-solutions.com までご連絡ください。",
      },
      { status: 503 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力値が不正です" }, { status: 400 });
  }
  const { email, companyName } = parsed.data;

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment", // Phase 1: 一括前払い (年額想定)
    payment_method_types: ["card"],
    line_items: [
      { price: process.env.STRIPE_PRICE_ID_STANDARD!, quantity: 1 },
    ],
    customer_email: email,
    metadata: {
      companyName,
      plan: "standard",
    },
    success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/checkout/cancel`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Checkout 作成に失敗しました" }, { status: 500 });
  }
  return NextResponse.json({ url: session.url });
}
