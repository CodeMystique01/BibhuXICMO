import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { SITE_NAME } from "@/shared/site";

export function Cta() {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-background to-fuchsia-500/5"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-64 bg-grid opacity-20 [mask-image:linear-gradient(to_top,black,transparent)]"
      />

      <div className="container">
        <div className="mx-auto max-w-3xl rounded-3xl border bg-card p-10 text-center shadow-sm md:p-16">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-primary">
            {SITE_NAME} for growth
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            The only agent you need for growth and distribution.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Every channel, one unified command. Free to start, no credit card required.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="xl" asChild className="group">
              <Link href="/register">
                Get {SITE_NAME} free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button size="xl" variant="outline" asChild>
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="font-medium">Included agents:</span>
            <span>Reddit</span>
            <span>SEO</span>
            <span>GEO</span>
            <span>Content Writer</span>
            <span>Hacker News</span>
            <span>X / LinkedIn</span>
            <span>GSC / GA4</span>
          </div>
        </div>
      </div>
    </section>
  );
}
