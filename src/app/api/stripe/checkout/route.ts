import { NextResponse } from "next/server";
import { getStripe, PLAN_PRICE_IDS, stripeCheckoutReady } from "@/backend/stripe";
import { prisma } from "@/backend/db";
import { auth } from "@/backend/auth";
import { env } from "@/shared/env";

export async function POST() {
  if (!stripeCheckoutReady()) {
    return NextResponse.json(
      {
        error:
          "Stripe checkout is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_MAX_MONTHLY.",
      },
      { status: 503 }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { workspace: { include: { subscription: true } }, user: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const { workspace, user } = membership;
  const stripe = getStripe();

  let customerId = workspace.subscription?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { workspaceId: workspace.id },
    });
    customerId = customer.id;
    await prisma.subscription.upsert({
      where: { workspaceId: workspace.id },
      create: {
        workspaceId: workspace.id,
        stripeCustomerId: customerId,
      },
      update: { stripeCustomerId: customerId },
    });
  }

  const priceId = PLAN_PRICE_IDS.MAX();
  if (!priceId) {
    return NextResponse.json(
      { error: "STRIPE_PRICE_MAX_MONTHLY not configured" },
      { status: 503 }
    );
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { workspaceId: workspace.id, plan: "MAX" },
    },
    success_url: `${env.APP_URL}/billing?status=success`,
    cancel_url: `${env.APP_URL}/billing?status=canceled`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: checkout.url });
}
