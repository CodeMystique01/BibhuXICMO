import Stripe from "stripe";
import { env } from "@/shared/env";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
  return _stripe;
}

export const PLAN_PRICE_IDS = {
  MAX: () => env.STRIPE_PRICE_MAX_MONTHLY,
} as const;

/** Checkout + customer portal (needs secret + subscription price id). */
export const stripeCheckoutReady = () =>
  Boolean(
    env.STRIPE_SECRET_KEY?.trim() &&
      env.STRIPE_PRICE_MAX_MONTHLY?.trim()
  );

/** Webhook signature verification (subscription sync after payment). */
export const stripeWebhookReady = () =>
  Boolean(env.STRIPE_SECRET_KEY?.trim() && env.STRIPE_WEBHOOK_SECRET?.trim());
