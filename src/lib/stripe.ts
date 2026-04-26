import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;

/**
 * Stripe クライアント (Phase 1)。
 * 環境変数 STRIPE_SECRET_KEY が無ければ null を返し、
 * 呼び出し側で「Stripe 未設定」のフォールバック処理に分岐する。
 */
export const stripe = key
  ? new Stripe(key, { apiVersion: "2026-04-22.dahlia" })
  : null;

export function isStripeConfigured(): boolean {
  return Boolean(key && process.env.STRIPE_PRICE_ID_STANDARD);
}
