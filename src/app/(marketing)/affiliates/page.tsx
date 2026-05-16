import Link from "next/link";
import { Button } from "@/frontend/components/ui/button";

export const metadata = { title: "Affiliates" };

export default function AffiliatesPage() {
  return (
    <section className="container max-w-3xl py-16 md:py-24">
      <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Affiliates</h1>
      <p className="mt-3 text-muted-foreground">
        Earn a recurring commission for every Max-plan customer you refer. Sign up below,
        get your unique link, and start earning.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6">
          <div className="text-3xl font-semibold text-primary">30%</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Recurring commission on every Max plan referral for 12 months.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <div className="text-3xl font-semibold text-primary">60 days</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Attribution window — plenty of time to close a lead.
          </p>
        </div>
      </div>

      <Button size="lg" className="mt-8" asChild>
        <Link href="/register?affiliate=1">Apply to the program</Link>
      </Button>
    </section>
  );
}
