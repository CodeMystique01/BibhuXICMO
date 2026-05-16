import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";
import { SiteAuditForm } from "@/frontend/components/marketing/site-audit-form";
import { SITE_NAME, SITE_TAGLINE } from "@/shared/site";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-radial-fade"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-30 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]"
      />

      <div className="container flex flex-col items-center py-24 text-center md:py-32">
        <Badge
          variant="outline"
          className="mb-6 gap-1.5 border-primary/30 bg-primary/5 text-primary"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {SITE_NAME}
        </Badge>

        <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight md:text-6xl lg:text-7xl">
          Meet <span className="text-gradient">{SITE_NAME}</span>
        </h1>

        <p className="mt-6 max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
          {SITE_TAGLINE}
        </p>

        <div className="mt-10 flex w-full flex-col items-center gap-2">
          <SiteAuditForm compact />
          <p className="text-[11px] text-muted-foreground">
            Free site audit · no sign-up · live in 10 seconds
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button size="xl" asChild className="group">
            <Link href="/register">
              Get started free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button size="xl" variant="outline" asChild>
            <Link href="#agents">See what it does</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
