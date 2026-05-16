import Link from "next/link";
import { ArrowLeft, Gauge } from "lucide-react";
import { SiteAuditForm } from "@/frontend/components/marketing/site-audit-form";
import { Badge } from "@/frontend/components/ui/badge";
import { SITE_NAME } from "@/shared/site";

export const metadata = {
  title: "Free Site Audit — live SEO + Lighthouse score",
  description:
    "Drop in any URL. We fetch the page, score it against Lighthouse, and surface the top SEO fixes — instantly, no sign-up.",
};

const STEPS: { title: string; body: string }[] = [
  {
    title: "Live homepage scrape",
    body: "We fetch the URL on the server, parse it with Cheerio, and pull every signal Google cares about — title, meta, headings, JSON-LD, links, and image alts.",
  },
  {
    title: "Google Lighthouse",
    body: "Performance, Accessibility, Best Practices, and SEO scores for both mobile and desktop, straight from PageSpeed Insights.",
  },
  {
    title: "Top fixes",
    body: "A short, prioritized list of issues with the exact wording you should change. Free preview shows the first five.",
  },
];

export default async function PublicSiteAuditPage(props: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url: shareUrl } = await props.searchParams;

  return (
    <section className="container max-w-3xl py-16 md:py-24">
      <Link
        href="/tools"
        className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All tools
      </Link>

      <Badge
        variant="outline"
        className="mb-4 gap-1.5 border-primary/30 bg-primary/5 text-primary"
      >
        <Gauge className="h-3.5 w-3.5" />
        Free · no sign-up
      </Badge>

      <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
        Free site audit in 10 seconds
      </h1>
      <p className="mt-3 max-w-2xl text-balance text-muted-foreground">
        Drop in any URL. {SITE_NAME} fetches it live, runs Google Lighthouse,
        and shows the on-page signals + top fixes — instantly.
      </p>

      <div className="mt-8">
        <SiteAuditForm initialUrl={shareUrl} autoRun={!!shareUrl} />
      </div>

      <div className="mt-16 grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.title} className="rounded-xl border bg-card p-5">
            <div className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {i + 1}
            </div>
            <h2 className="text-sm font-semibold">{s.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {s.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-16 rounded-2xl border bg-muted/30 p-6 text-sm text-muted-foreground">
        <strong className="text-foreground">Want more?</strong> Inside the
        workspace you also get the full SEO + GEO scores across multiple LLMs,
        auto-drafted fixes you can ship as PRs to GitHub, X / LinkedIn / Reddit
        post drafts in your brand voice, and Google Search Console + Analytics
        wired up — all from one chat.
      </div>
    </section>
  );
}
