import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeWebhookReady } from "@/backend/stripe";
import { env } from "@/shared/env";
import { prisma } from "@/backend/db";
import { MAX_PLAN_MONTHLY_CREDITS, grantCredits } from "@/backend/credits";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripeWebhookReady() || !webhookSecret) {
    return NextResponse.json({ received: false, reason: "unconfigured" }, { status: 200 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const stripe = getStripe();
  const buf = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature failed:", err);
    return NextResponse.json({ error: "signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await markCanceled(sub);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await grantCreditsForInvoice(invoice);
        break;
      }
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return NextResponse.json({ error: "handler" }, { status: 500 });
  }
}

async function upsertSubscription(sub: Stripe.Subscription) {
  const workspaceId = sub.metadata?.workspaceId;
  if (!workspaceId) return;

  // Stripe SDK revisions moved `current_period_end` between subscription and item.
  const periodEndEpoch =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    (sub.items.data[0] as unknown as { current_period_end?: number })?.current_period_end;
  const periodEnd = periodEndEpoch ? new Date(periodEndEpoch * 1000) : null;

  await prisma.subscription.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripeSubscriptionId: sub.id,
      plan: "MAX",
      status: mapStatus(sub.status),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
    update: {
      stripeSubscriptionId: sub.id,
      plan: "MAX",
      status: mapStatus(sub.status),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
}

async function markCanceled(sub: Stripe.Subscription) {
  const workspaceId = sub.metadata?.workspaceId;
  if (!workspaceId) return;
  await prisma.subscription.update({
    where: { workspaceId },
    data: { status: "CANCELED", plan: "FREE" },
  });
}

async function grantCreditsForInvoice(invoice: Stripe.Invoice) {
  // Resolve workspace by looking up the customer in our DB.
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const sub = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
  });
  if (!sub) return;

  await grantCredits(
    sub.workspaceId,
    MAX_PLAN_MONTHLY_CREDITS,
    `stripe.invoice.paid:${invoice.id ?? "unknown"}`
  );
}

function mapStatus(s: Stripe.Subscription.Status) {
  switch (s) {
    case "active":
      return "ACTIVE" as const;
    case "trialing":
      return "TRIALING" as const;
    case "past_due":
      return "PAST_DUE" as const;
    case "canceled":
      return "CANCELED" as const;
    case "incomplete":
      return "INCOMPLETE" as const;
    case "unpaid":
      return "UNPAID" as const;
    default:
      return "ACTIVE" as const;
  }
}
