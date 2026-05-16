/**
 * Public, no-auth site audit. Lead-gen play:
 * - Live homepage scrape (Cheerio) → metadata + structure + word count + JSON-LD
 * - Lighthouse / PageSpeed Insights scores (mobile + desktop, key-optional)
 * - Rule-based SEO issues (no LLM call)
 *
 * No DB writes, no credits, no LLM. Strict per-IP rate limit so it stays cheap.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { fetchPage, normalizeUrl } from "@/backend/scraper/fetch";
import { fetchPageSpeed } from "@/backend/pagespeed";
import { ruleBasedAudit, type AuditIssue } from "@/backend/seo-audit-rules";
import { rateLimitAsync, ipKey } from "@/backend/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;
// Don't cache responses — every URL is different.
export const dynamic = "force-dynamic";

const schema = z.object({
  url: z
    .string()
    .min(3)
    .max(500)
    .transform((s) => s.trim()),
});

const PER_MIN = { limit: 5, windowMs: 60_000 };
const PER_HOUR = { limit: 25, windowMs: 60 * 60_000 };

export async function POST(req: NextRequest) {
  const minute = await rateLimitAsync(ipKey(req, "public-audit:m"), PER_MIN);
  if (!minute.ok) {
    const seconds = Math.ceil(minute.retryAfterMs / 1000);
    return NextResponse.json(
      {
        ok: false,
        error: `Whoa — that's a lot of audits. Free anonymous use is limited to ${PER_MIN.limit}/minute. Try again in ${seconds} seconds, or sign up for higher limits.`,
        retryAfterSeconds: seconds,
        limit: PER_MIN.limit,
        window: "minute",
      },
      {
        status: 429,
        headers: { "Retry-After": String(seconds) },
      }
    );
  }
  const hour = await rateLimitAsync(ipKey(req, "public-audit:h"), PER_HOUR);
  if (!hour.ok) {
    const seconds = Math.ceil(hour.retryAfterMs / 1000);
    const minutes = Math.max(1, Math.round(seconds / 60));
    return NextResponse.json(
      {
        ok: false,
        error: `You've used your ${PER_HOUR.limit} free audits this hour. The window resets in ~${minutes} minute${minutes === 1 ? "" : "s"} — or sign up free to skip this limit.`,
        retryAfterSeconds: seconds,
        limit: PER_HOUR.limit,
        window: "hour",
      },
      {
        status: 429,
        headers: { "Retry-After": String(seconds) },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Provide a `url`." },
      { status: 400 }
    );
  }

  let normalized: string;
  try {
    normalized = normalizeUrl(parsed.data.url);
    const u = new URL(normalized);
    if (!/^https?:$/.test(u.protocol)) throw new Error("bad_protocol");
    // Disallow obviously private hosts so this doesn't double as an SSRF probe.
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("169.254.") ||
      host.startsWith("192.168.")
    ) {
      return NextResponse.json(
        { ok: false, error: "Public URLs only." },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid URL." }, { status: 400 });
  }

  let snap: Awaited<ReturnType<typeof fetchPage>>;
  try {
    snap = await fetchPage(normalized);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? `Could not fetch ${normalized}: ${err.message}`
            : "Could not fetch the URL.",
      },
      { status: 502 }
    );
  }

  const audit = ruleBasedAudit(snap);
  const pageSpeed = await fetchPageSpeed(normalized).catch(() => null);

  // Cap issues returned in the public preview so users have a reason to sign up.
  const previewIssues: AuditIssue[] = audit.issues.slice(0, 5);
  const moreIssues = Math.max(0, audit.issues.length - previewIssues.length);

  return NextResponse.json({
    ok: true,
    url: normalized,
    fetchedAt: new Date().toISOString(),
    score: audit.score,
    highlights: audit.highlights,
    metadata: {
      title: snap.title,
      description: snap.description,
      h1: snap.h1,
      lang: snap.lang ?? null,
      canonical: snap.meta["og:url"]?.trim() || null,
      images: snap.images.length,
      imagesMissingAlt: snap.images.filter((i) => !i.alt).length,
      jsonLd: snap.jsonLd.length,
      wordCount: snap.wordCount,
      internalLinks: snap.links.filter((l) => l.internal).length,
      externalLinks: snap.links.filter((l) => !l.internal).length,
    },
    pageSpeed: pageSpeed
      ? { mobile: pageSpeed.mobile, desktop: pageSpeed.desktop, ok: pageSpeed.ok }
      : null,
    issues: previewIssues,
    moreIssues,
    note: "Free preview — sign up for the full audit, GEO score, and auto-drafted fixes.",
  });
}
