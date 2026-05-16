"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";

export function BillingActions({
  plan,
  stripeCheckoutReady,
  stripeWebhookReady,
  hasCustomer,
}: {
  plan: "FREE" | "MAX";
  stripeCheckoutReady: boolean;
  stripeWebhookReady: boolean;
  hasCustomer: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  async function startCheckout() {
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      window.location.href = json.url;
    } catch (e) {
      toast.error("Could not start checkout", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  async function openPortal() {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      window.location.href = json.url;
    } catch (e) {
      toast.error("Could not open billing portal", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  if (!stripeCheckoutReady) {
    return (
      <p className="text-sm text-muted-foreground">
        Stripe checkout is not configured. Set{" "}
        <code className="rounded bg-muted px-1">STRIPE_SECRET_KEY</code> and{" "}
        <code className="rounded bg-muted px-1">STRIPE_PRICE_MAX_MONTHLY</code> (price id) to
        enable upgrades.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!stripeWebhookReady ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Add <code className="rounded bg-muted px-1">STRIPE_WEBHOOK_SECRET</code> and register
          your webhook URL in Stripe so subscription status syncs automatically after checkout.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
      {plan === "FREE" ? (
        <Button
          onClick={() => startTransition(startCheckout)}
          disabled={isPending}
        >
          {isPending ? "Opening checkout…" : "Upgrade to Max"}
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => startTransition(openPortal)}
          disabled={isPending || !hasCustomer}
        >
          {isPending ? "Opening portal…" : "Manage subscription"}
        </Button>
      )}
      </div>
    </div>
  );
}
