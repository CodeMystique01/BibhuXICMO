import { NextResponse } from "next/server";
import { getStripe, stripeCheckoutReady } from "@/backend/stripe";
import { prisma } from "@/backend/db";
import { auth } from "@/backend/auth";
import { env } from "@/shared/env";

export async function POST() {
  if (!stripeCheckoutReady()) {
    return NextResponse.json(
      { error: "Stripe is not configured for billing portal." },
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
    include: { workspace: { include: { subscription: true } } },
  });
  if (!membership?.workspace.subscription?.stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer yet" }, { status: 404 });
  }

  const portal = await getStripe().billingPortal.sessions.create({
    customer: membership.workspace.subscription.stripeCustomerId,
    return_url: `${env.APP_URL}/billing`,
  });

  return NextResponse.json({ url: portal.url });
}
