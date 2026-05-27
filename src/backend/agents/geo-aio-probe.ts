/**
 * AI Overviews probe via Apify's Google SERP scraper.
 *
 * For each query we ask Apify to run a Google search; if the SERP includes
 * an AI Overview block, we check whether our domain appears in the cited
 * sources. The result is saved as a `GeoQuery` row with provider
 * "ai_overviews" so the GEO citations panel can aggregate it alongside
 * LLM probes from OpenAI/Anthropic/Google.
 *
 * Tokens (in order of preference):
 *   APIFY_SEO_TOKEN  — dedicated SEO/GEO bill.
 *   APIFY_TOKEN      — shared.
 *
 * Actor: apify/google-search-scraper (configurable via
 *   APIFY_GOOGLE_SERP_ACTOR_ID for users on a custom variant).
 */
import { env } from "@/shared/env";

const DEFAULT_ACTOR = "apify~google-search-scraper";
const SYNC_TIMEOUT_MS = 60_000;

function seoApifyToken(): string | undefined {
  return env.APIFY_SEO_TOKEN || env.APIFY_TOKEN || undefined;
}

function actorId(): string {
  return env.APIFY_GOOGLE_SERP_ACTOR_ID || DEFAULT_ACTOR;
}

export type AioProbeResult = {
  /** True if the AI Overview block cites our domain. */
  cited: boolean;
  /** Short snippet of the AIO content (truncated for storage). */
  snippet: string;
  /** Source URLs surfaced by AIO (deduped, lowercased). */
  sources: string[];
  /** Whether the SERP even had an AIO block. */
  hasOverview: boolean;
};

/** Domain normaliser shared with the citations panel. */
function normHost(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function pickString(o: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

/** Extract source URLs from various shapes the AIO block might use. */
function extractSources(aio: Record<string, unknown>): string[] {
  const raw =
    (aio.sources as unknown[] | undefined) ??
    (aio.references as unknown[] | undefined) ??
    (aio.citations as unknown[] | undefined) ??
    (aio.links as unknown[] | undefined) ??
    [];
  const out = new Set<string>();
  for (const s of raw) {
    if (typeof s === "string") {
      out.add(s.toLowerCase());
    } else if (s && typeof s === "object") {
      const obj = s as Record<string, unknown>;
      const u = pickString(obj, "url", "link", "href", "source", "domain");
      if (u) out.add(u.toLowerCase());
    }
  }
  return [...out];
}

function extractContent(aio: Record<string, unknown>): string {
  const s = pickString(aio, "content", "text", "summary", "answer", "snippet");
  return s ? s.slice(0, 2000) : "";
}

/**
 * Find the AIO block inside an arbitrarily-shaped actor item.
 * Different actor versions nest the AIO under different keys, so we
 * sniff for common shapes.
 */
function findAioBlock(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== "object") return null;
  const top = item as Record<string, unknown>;
  const candidates: unknown[] = [
    top.aiOverview,
    top.ai_overview,
    top.aioverview,
    top.AIOverview,
    (top.organic_results as Record<string, unknown> | undefined)?.aiOverview,
    (top.serp as Record<string, unknown> | undefined)?.aiOverview,
  ];
  for (const c of candidates) {
    if (c && typeof c === "object") return c as Record<string, unknown>;
  }
  return null;
}

/**
 * Run a Google search for `query` via Apify and decide whether the AI
 * Overview cites `domain`. Returns null if Apify isn't configured.
 */
export async function probeAiOverview(args: {
  query: string;
  domain: string;
  country?: string;
}): Promise<AioProbeResult | null> {
  const token = seoApifyToken();
  if (!token) return null;
  const host = normHost(args.domain);
  if (!host) return null;

  const url = `https://api.apify.com/v2/acts/${actorId()}/run-sync-get-dataset-items?token=${encodeURIComponent(
    token
  )}&timeout=${Math.floor(SYNC_TIMEOUT_MS / 1000)}`;

  // The widely-used `apify/google-search-scraper` accepts either a single
  // `queries` string with newline-separated values or `searchQueries` for
  // the array variant. Pass both — the actor ignores unknown fields.
  const body = {
    queries: args.query,
    searchQueries: [args.query],
    countryCode: args.country ?? "us",
    languageCode: "en",
    resultsPerPage: 10,
    maxPagesPerQuery: 1,
    includeUnfilteredResults: false,
    saveHtml: false,
    saveScreenshot: false,
    customDataFunction: undefined,
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SYNC_TIMEOUT_MS + 5_000);
  let items: unknown[] = [];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`[geo-aio] Apify ${res.status} for "${args.query}": ${txt.slice(0, 200)}`);
      return { cited: false, snippet: "", sources: [], hasOverview: false };
    }
    items = (await res.json()) as unknown[];
  } catch (err) {
    console.warn(`[geo-aio] Apify call failed for "${args.query}":`, err);
    return { cited: false, snippet: "", sources: [], hasOverview: false };
  } finally {
    clearTimeout(timer);
  }

  for (const it of items) {
    const aio = findAioBlock(it);
    if (!aio) continue;
    const sources = extractSources(aio);
    const snippet = extractContent(aio);
    const cited = sources.some((s) => s.includes(host));
    return { cited, snippet, sources, hasOverview: true };
  }
  // No AIO block found — most queries don't trigger AI Overviews. That's
  // a valid signal (cited=false) but flag hasOverview=false for analytics.
  return { cited: false, snippet: "", sources: [], hasOverview: false };
}
