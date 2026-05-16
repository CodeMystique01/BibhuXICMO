import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";
import { Faq } from "@/frontend/components/marketing/faq";

const FREE_FEATURES = [
  "Website analysis & strategy document",
  "5 premium credits / month",
  "2,000 cheap-model credits",
  "Hacker News Agent",
  "1 workspace",
  "Community support",
];

const MAX_FEATURES = [
  "Everything in Free",
  "2,000 premium credits / month",
  "All 10+ agents unlocked",
  "Daily scheduled agent runs",
  "Reddit, X, LinkedIn OAuth + publish queue",
  "GSC + GA4 integrations",
  "GEO score tracking",
  "Coding Agent (GitHub PRs)",
  "Priority email support",
];

export const metadata = {
  title: "Pricing",
};

export default function PricingPage() {
  return (
    <>
      <section className="relative overflow-hidden py-24 md:py-32">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-radial-fade"
        />

        <div className="container">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <Badge variant="outline" className="mb-6 border-primary/30 bg-primary/5 text-primary">
              Simple pricing
            </Badge>
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              Replace a $14,000/mo marketing team for $99/mo
            </h1>
            <p className="mt-4 text-muted-foreground">
              Start free. Upgrade when you are ready. No contracts.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
            <div className="rounded-2xl border bg-card p-8 shadow-sm">
              <h2 className="text-xl font-semibold">Free</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Explore Xicmo, run your first strategy, ship your first action items.
              </p>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>

              <Button className="mt-6 w-full" variant="outline" size="lg" asChild>
                <Link href="/register">Get started free</Link>
              </Button>

              <ul className="mt-8 space-y-3 text-sm">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative rounded-2xl border-2 border-primary/40 bg-card p-8 shadow-lg">
              <Badge className="absolute -top-3 right-8">Most popular</Badge>
              <h2 className="text-xl font-semibold">Max</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The full AI marketing team — every agent, every channel, every day.
              </p>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold">$99</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>

              <Button className="mt-6 w-full" size="lg" asChild>
                <Link href="/register?plan=max">Start 7-day free trial</Link>
              </Button>

              <ul className="mt-8 space-y-3 text-sm">
                {MAX_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mx-auto mt-8 max-w-xl text-center text-xs text-muted-foreground">
            Prices in USD. Cancel anytime from the billing page. Higher-volume teams —{" "}
            <Link href="/contact" className="text-primary hover:underline">
              contact us
            </Link>
            .
          </p>
        </div>
      </section>

      <Faq />
    </>
  );
}
