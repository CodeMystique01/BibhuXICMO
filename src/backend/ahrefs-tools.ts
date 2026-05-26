/**
 * Keyword-tool wrappers around the existing Apify Ahrefs actor.
 *
 * The actor (default `radeance/ahrefs-scraper`) accepts `include_*` flags
 * for each "tool" we want. Sending fewer flags = cheaper run, so each
 * function below requests exactly one feature.
 *
 * Output normalisation is intentionally defensive: the actor's field
 * names shift slightly between builds (snake_case vs camelCase, nested
 * blocks, etc.). We pick best-effort fields and otherwise pass the raw
 * dataset items through so the UI can still render something useful.
 *
 * Tokens & actor:
 *   APIFY_SEO_TOKEN      — preferred token for SEO + GEO tool calls.
 *   APIFY_TOKEN          — fallback when APIFY_SEO_TOKEN is unset.
 *   APIFY_AHREFS_ACTOR_ID — actor id (default radeance~ahrefs-scraper).
 */
import { env } from "@/shared/env";
import {
  ApifyNotConfiguredError,
  ApifyAhrefsError,
} from "@/backend/ahrefs";

/** Pick the most specific Apify token, falling back to the shared one. */
function seoApifyToken(): string | undefined {
  return env.APIFY_SEO_TOKEN || env.APIFY_TOKEN || undefined;
}

/** Public helper so server pages can render a "missing token" hint. */
export function hasSeoApifyToken(): boolean {
  return !!seoApifyToken();
}

const SYNC_TIMEOUT_MS = 90_000;

// --------------------------------------------------------------------------
// Public output shapes
// --------------------------------------------------------------------------

export type KeywordDifficultyResult = {
  keyword: string;
  country: string;
  /** 0–100 Ahrefs KD. */
  difficulty: number | null;
  /** "Very Easy" / "Easy" / "Medium" / "Hard" / "Very Hard". */
  label: string | null;
  /** Rough description of how many referring domains the top-10 has. */
  estimatedReferringDomainsToRank: number | null;
  raw: unknown;
};

export type KeywordMetricsResult = {
  keyword: string;
  country: string;
  searchVolume: number | null;
  difficulty: number | null;
  cpc: number | null;
  /** Estimated organic clicks per month if you rank #1. */
  trafficPotential: number | null;
  /** "Informational" / "Navigational" / "Commercial" / "Transactional". */
  intent: string | null;
  /** Related keywords + their volume (top 10). */
  related: Array<{
    keyword: string;
    volume: number | null;
    difficulty: number | null;
  }>;
  raw: unknown;
};

export type KeywordRankResult = {
  domain: string;
  keyword: string;
  country: string;
  /** 1-100 if found, null when domain isn't in the top 100. */
  position: number | null;
  /** Best-ranking URL on the domain. */
  url: string | null;
  /** Featured snippet / sitelinks / image pack / etc. */
  serpFeature: string | null;
  raw: unknown;
};

export type SerpEntry = {
  position: number;
  title: string;
  url: string;
  domain: string;
  /** "https://ahrefs.com/..." style snippet from the SERP. */
  snippet: string | null;
  /** DR of the ranking domain when the actor surfaces it. */
  domainRating: number | null;
  /** Estimated monthly traffic to the page. */
  traffic: number | null;
};

export type SerpOverviewResult = {
  keyword: string;
  country: string;
  /** Top-10 entries (or fewer if SERP is shallow). */
  results: SerpEntry[];
  /** Top SERP features detected: featured snippet, AI Overview, PAA, etc. */
  features: string[];
  raw: unknown;
};

export type TopWebsiteEntry = {
  rank: number;
  domain: string;
  category: string | null;
  /** Ahrefs DR (0–100). */
  domainRating: number | null;
  /** Monthly organic traffic. */
  traffic: number | null;
  /** Country share, percent (e.g. 18.4). */
  countryShare: number | null;
};

export type TopWebsitesResult = {
  country: string;
  category: string | null;
  entries: TopWebsiteEntry[];
  raw: unknown;
};

export type AiVisibilityResult = {
  domain: string;
  /** 0–100 — share-of-voice in AI-generated answers across LLMs. */
  score: number | null;
  /** Mention count across all probed LLMs in the last 30d. */
  mentions: number | null;
  /**
   * Per-provider breakdown surfaced by the actor when available.
   * `citations` = total mentions/citations from that provider.
   * `pages` = unique URLs on the domain that were cited.
   */
  byProvider: Array<{
    provider: string;
    score: number | null;
    mentions: number | null;
    citations: number | null;
    pages: number | null;
  }>;
  /** Top queries the domain is cited for. */
  topQueries: Array<{ query: string; mentions: number | null }>;
  raw: unknown;
};

// --------------------------------------------------------------------------
// Apify call helper
// --------------------------------------------------------------------------

export type AhrefsActorInput = {
  url?: string;
  keyword?: string;
  country?: string;
  mode?: "exact" | "subdomains";
  include_web_authority?: boolean;
  include_traffic?: boolean;
  include_backlinks?: boolean;
  include_ai_visibility?: boolean;
  include_keywords?: boolean;
  include_keywords_difficulty?: boolean;
  include_keywords_ranking?: boolean;
  include_serp?: boolean;
  include_broken_links?: boolean;
  include_top_websites?: boolean;
};

// --------------------------------------------------------------------------
// Async Apify run + poll. We can't use run-sync-get-dataset-items because
// the Ahrefs scraper often needs 60-90s and Render kills HTTP requests at
// 60s. So we POST /runs, return the runId, and let the client poll for the
// dataset.
// --------------------------------------------------------------------------

export type ApifyRunHandle = {
  runId: string;
  datasetId: string;
  /** READY | RUNNING | SUCCEEDED | FAILED | ABORTED | TIMED-OUT */
  status: string;
};

const TERMINAL_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "ABORTED",
  "TIMED-OUT",
]);

export function isTerminalApifyStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** POST to Apify /runs — returns instantly with the run handle. */
export async function startActorRun(
  input: AhrefsActorInput
): Promise<ApifyRunHandle> {
  const token = seoApifyToken();
  if (!token) throw new ApifyNotConfiguredError();
  const actor = env.APIFY_AHREFS_ACTOR_ID;
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/runs` +
    `?token=${encodeURIComponent(token)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new ApifyAhrefsError(
      `Apify Ahrefs run start failed (${res.status})${detail ? `: ${detail.slice(0, 240)}` : ""}`,
      res.status
    );
  }
  const json = (await res.json()) as {
    data?: { id?: string; defaultDatasetId?: string; status?: string };
  };
  if (!json?.data?.id || !json.data.defaultDatasetId) {
    throw new ApifyAhrefsError(
      `Apify response missing run id or dataset id: ${JSON.stringify(json).slice(0, 200)}`
    );
  }
  return {
    runId: json.data.id,
    datasetId: json.data.defaultDatasetId,
    status: json.data.status ?? "READY",
  };
}

/** GET run metadata — cheap status check. */
export async function getActorRunStatus(runId: string): Promise<{
  status: string;
  statusMessage?: string;
  datasetId?: string;
}> {
  const token = seoApifyToken();
  if (!token) throw new ApifyNotConfiguredError();
  const url =
    `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}` +
    `?token=${encodeURIComponent(token)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new ApifyAhrefsError(
      `Apify run status fetch failed (${res.status})`,
      res.status
    );
  }
  const json = (await res.json()) as {
    data?: { status?: string; statusMessage?: string; defaultDatasetId?: string };
  };
  return {
    status: json.data?.status ?? "UNKNOWN",
    statusMessage: json.data?.statusMessage,
    datasetId: json.data?.defaultDatasetId,
  };
}

/** GET dataset items for a finished run. */
export async function getDatasetItems(datasetId: string): Promise<unknown[]> {
  const token = seoApifyToken();
  if (!token) throw new ApifyNotConfiguredError();
  const url =
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items` +
    `?token=${encodeURIComponent(token)}&format=json&clean=true`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new ApifyAhrefsError(
      `Apify dataset fetch failed (${res.status})`,
      res.status
    );
  }
  const items = (await res.json()) as unknown;
  if (!Array.isArray(items)) return [];
  return items;
}

/**
 * Combined start + short-poll for places that DO want a sync result and
 * accept the timeout risk. Used by the AI Citation Check LLM probes which
 * aren't Apify-backed; otherwise prefer startActorRun + the client poller.
 */
async function runActor(
  input: AhrefsActorInput,
  opts: { timeoutMs?: number } = {}
): Promise<unknown[]> {
  const handle = await startActorRun(input);
  const deadline = Date.now() + (opts.timeoutMs ?? SYNC_TIMEOUT_MS);
  let status = handle.status;
  while (!isTerminalApifyStatus(status)) {
    if (Date.now() > deadline) {
      throw new ApifyAhrefsError(
        `Apify run ${handle.runId} did not finish within ${opts.timeoutMs ?? SYNC_TIMEOUT_MS}ms`
      );
    }
    await new Promise((r) => setTimeout(r, 2500));
    const s = await getActorRunStatus(handle.runId);
    status = s.status;
  }
  if (status !== "SUCCEEDED") {
    throw new ApifyAhrefsError(`Apify run ${handle.runId} ended with status ${status}`);
  }
  return getDatasetItems(handle.datasetId);
}
// Silence "declared but never used" — kept as a future helper.
void runActor;

// --------------------------------------------------------------------------
// Field-pickers — copied from ahrefs.ts so this file stays self-contained.
// --------------------------------------------------------------------------

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.replace(/[, _$%]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function findByType(items: unknown[], ...types: string[]): Record<string, unknown> | null {
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const t = typeof o.type === "string" ? o.type : "";
    if (types.includes(t)) return o;
  }
  // Fallback: first object item.
  return (items.find((x) => x && typeof x === "object") as Record<string, unknown>) ?? null;
}

function difficultyLabel(kd: number | null): string | null {
  if (kd === null) return null;
  if (kd < 10) return "Very Easy";
  if (kd < 30) return "Easy";
  if (kd < 50) return "Medium";
  if (kd < 75) return "Hard";
  return "Very Hard";
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
}

// --------------------------------------------------------------------------
// Per-tool start handles + normalizers. The server action calls startX(...)
// to launch the Apify run, then later calls normalizeX(items, params) to
// turn the raw dataset rows into the public output shape.
// --------------------------------------------------------------------------

// Tool 1 — Keyword Difficulty
export function startKeywordDifficulty(keyword: string, country = "us") {
  return startActorRun({ keyword, country, include_keywords_difficulty: true });
}
export function normalizeKeywordDifficulty(
  items: unknown[],
  params: { keyword: string; country: string }
): KeywordDifficultyResult {
  const o = findByType(items, "keywords_difficulty", "keyword_difficulty", "kd");
  const kd = o ? pickNumber(o, ["difficulty", "kd", "keyword_difficulty"]) : null;
  const refdomains = o
    ? pickNumber(o, ["referring_domains_to_rank", "refdomainsToRank", "estimated_refdomains"])
    : null;
  return {
    keyword: params.keyword,
    country: params.country,
    difficulty: kd,
    label: difficultyLabel(kd),
    estimatedReferringDomainsToRank: refdomains,
    raw: items,
  };
}

// Tool 2 — Keyword Metrics
export function startKeywordMetrics(keyword: string, country = "us") {
  return startActorRun({
    keyword,
    country,
    include_keywords: true,
    include_keywords_difficulty: true,
  });
}
export function normalizeKeywordMetrics(
  items: unknown[],
  params: { keyword: string; country: string }
): KeywordMetricsResult {
  const o = findByType(items, "keywords", "keyword", "keyword_metrics");
  const related = o
    ? asArray(o.related_keywords).concat(asArray(o.suggestions)).slice(0, 10)
    : [];
  return {
    keyword: params.keyword,
    country: params.country,
    searchVolume: o ? pickNumber(o, ["volume", "searchVolume", "search_volume", "sv"]) : null,
    difficulty: o ? pickNumber(o, ["difficulty", "kd", "keyword_difficulty"]) : null,
    cpc: o ? pickNumber(o, ["cpc", "cost_per_click"]) : null,
    trafficPotential: o
      ? pickNumber(o, ["traffic_potential", "trafficPotential", "estimated_traffic"])
      : null,
    intent: o ? pickString(o, ["intent", "search_intent"]) : null,
    related: related
      .map((row) => {
        const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        return {
          keyword: pickString(r, ["keyword", "query"]) ?? "",
          volume: pickNumber(r, ["volume", "searchVolume", "sv"]),
          difficulty: pickNumber(r, ["difficulty", "kd"]),
        };
      })
      .filter((row) => row.keyword.length > 0),
    raw: items,
  };
}

// Tool 3 — Keyword Rank Checker
export function startKeywordRank(domain: string, keyword: string, country = "us") {
  return startActorRun({
    url: domain,
    keyword,
    country,
    include_keywords_ranking: true,
  });
}
export function normalizeKeywordRank(
  items: unknown[],
  params: { domain: string; keyword: string; country: string }
): KeywordRankResult {
  const o = findByType(items, "keywords_ranking", "ranking", "rank");
  let position: number | null = null;
  let url: string | null = null;
  let serpFeature: string | null = null;
  if (o) {
    position = pickNumber(o, ["position", "rank", "pos"]);
    url = pickString(o, ["url", "ranking_url"]);
    serpFeature = pickString(o, ["serp_feature", "feature"]);
    if (position === null) {
      const rows = asArray(o.rankings).concat(asArray(o.results));
      const match = rows.find((r) => {
        if (!r || typeof r !== "object") return false;
        const v = (r as Record<string, unknown>).keyword;
        return typeof v === "string" && v.toLowerCase() === params.keyword.toLowerCase();
      });
      if (match && typeof match === "object") {
        const m = match as Record<string, unknown>;
        position = pickNumber(m, ["position", "rank", "pos"]);
        url = pickString(m, ["url", "ranking_url"]);
        serpFeature = pickString(m, ["serp_feature", "feature"]);
      }
    }
  }
  return {
    domain: params.domain,
    keyword: params.keyword,
    country: params.country,
    position,
    url,
    serpFeature,
    raw: items,
  };
}

// Tool 4 — SERP Overview
export function startSerpOverview(keyword: string, country = "us") {
  return startActorRun({ keyword, country, include_serp: true });
}
export function normalizeSerpOverview(
  items: unknown[],
  params: { keyword: string; country: string }
): SerpOverviewResult {
  const o = findByType(items, "serp", "serp_overview", "search_results");
  const rawResults = o
    ? asArray(o.results).concat(asArray(o.serp_results)).concat(asArray(o.organic))
    : [];
  const features = o ? asArray(o.features).concat(asArray(o.serp_features)) : [];

  const results: SerpEntry[] = rawResults
    .slice(0, 10)
    .map((row, i) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const link = pickString(r, ["url", "link"]) ?? "";
      return {
        position: pickNumber(r, ["position", "rank", "pos"]) ?? i + 1,
        title: pickString(r, ["title", "name"]) ?? link,
        url: link,
        domain: link ? hostnameOf(link) : "",
        snippet: pickString(r, ["snippet", "description"]),
        domainRating: pickNumber(r, ["domain_rating", "dr", "domainRating"]),
        traffic: pickNumber(r, ["traffic", "monthly_traffic"]),
      };
    })
    .filter((row) => row.url.length > 0);

  return {
    keyword: params.keyword,
    country: params.country,
    results,
    features: features
      .map((f) =>
        typeof f === "string"
          ? f
          : pickString(f as Record<string, unknown>, ["name", "type"]) ?? ""
      )
      .filter((s): s is string => !!s)
      .slice(0, 8),
    raw: items,
  };
}

// Tool 5 — Top Websites
export function startTopWebsites(country = "us") {
  return startActorRun({ country, include_top_websites: true });
}
export function normalizeTopWebsites(
  items: unknown[],
  params: { country: string; category: string | null }
): TopWebsitesResult {
  const o = findByType(items, "top_websites", "topWebsites", "websites");
  const rows = o
    ? asArray(o.websites).concat(asArray(o.top_websites)).concat(asArray(o.results))
    : [];

  const entries: TopWebsiteEntry[] = rows
    .slice(0, 50)
    .map((row, i) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const dom = pickString(r, ["domain", "website", "url"]) ?? "";
      if (!dom) return null;
      return {
        rank: pickNumber(r, ["rank", "position"]) ?? i + 1,
        domain: dom.startsWith("http") ? hostnameOf(dom) : dom.replace(/^www\./, ""),
        category: pickString(r, ["category", "vertical", "industry"]),
        domainRating: pickNumber(r, ["domain_rating", "dr", "domainRating"]),
        traffic: pickNumber(r, ["traffic", "monthly_traffic", "organic_traffic"]),
        countryShare: pickNumber(r, ["country_share", "share"]),
      };
    })
    .filter((row): row is TopWebsiteEntry => row !== null)
    .filter((row) =>
      !params.category
        ? true
        : (row.category ?? "").toLowerCase().includes(params.category.toLowerCase())
    );

  return {
    country: params.country,
    category: params.category,
    entries,
    raw: items,
  };
}

// GEO Tool — AI Visibility
export function startAiVisibility(domain: string, country = "us") {
  return startActorRun({
    url: domain,
    country,
    mode: "subdomains",
    include_ai_visibility: true,
  });
}

/**
 * The radeance/ahrefs-scraper actor returns different shapes depending on
 * its build version — sometimes `{type:"ai_visibility", providers:[...]}`,
 * sometimes platform-name keys at the top level, sometimes nested under
 * `ai_visibility`. Walk the items recursively trying every known shape.
 */
function collectAiProviderRows(items: unknown[]): Record<string, unknown>[] {
  const collected: Record<string, unknown>[] = [];
  const PLATFORM_KEY_PATTERNS = [
    /^chat\s*gpt$/i,
    /^open\s*ai$/i,
    /^gpt(\d+)?$/i,
    /^ai[\s_-]*overview/i,
    /^aio$/i,
    /^sge$/i,
    /^google[\s_-]*ai/i,
    /^gemini$/i,
    /^bard$/i,
    /^perplexity$/i,
    /^pplx$/i,
    /^copilot$/i,
    /^bing[\s_-]*chat$/i,
    /^msft$/i,
    /^grok$/i,
    /^x\s*ai$/i,
    /^claude$/i,
  ];
  const isPlatformKey = (k: string) =>
    PLATFORM_KEY_PATTERNS.some((re) => re.test(k.trim()));

  function visit(node: unknown, depth: number) {
    if (depth > 8 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;

    // Shape A: array of provider rows {provider/name/platform, citations, pages, ...}
    for (const arrKey of [
      "by_provider",
      "byProvider",
      "providers",
      "platforms",
      "ai_providers",
      "ai_platforms",
      "breakdown",
    ]) {
      const arr = obj[arrKey];
      if (Array.isArray(arr)) {
        for (const row of arr) {
          if (row && typeof row === "object") {
            collected.push(row as Record<string, unknown>);
          }
        }
      }
    }

    // Shape B: platform names as keys at this level → wrap as {provider, ...value}
    for (const [key, value] of Object.entries(obj)) {
      if (isPlatformKey(key) && value && typeof value === "object" && !Array.isArray(value)) {
        collected.push({ provider: key, ...(value as Record<string, unknown>) });
      }
    }

    // Shape C: nested ai_visibility / ai container → recurse
    for (const nestedKey of [
      "ai_visibility",
      "aiVisibility",
      "ai",
      "ai_search",
      "data",
      "result",
    ]) {
      if (obj[nestedKey]) visit(obj[nestedKey], depth + 1);
    }
  }

  for (const item of items) visit(item, 0);

  // De-dupe by provider name (case-insensitive)
  const seen = new Set<string>();
  return collected.filter((row) => {
    const name = String(
      (row.provider as string) ||
        (row.name as string) ||
        (row.platform as string) ||
        ""
    ).toLowerCase();
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

export function normalizeAiVisibility(
  items: unknown[],
  params: { domain: string }
): AiVisibilityResult {
  const o = findByType(items, "ai_visibility", "aiVisibility", "ai");
  const providers = collectAiProviderRows(items);
  const queries = o ? asArray(o.top_queries).concat(asArray(o.queries)) : [];

  if (providers.length === 0) {
    console.warn(
      `[ahrefs-tools] AI Visibility returned ${items.length} item(s) but no provider data was extracted. Raw keys:`,
      items.slice(0, 3).map((it) =>
        it && typeof it === "object" ? Object.keys(it as Record<string, unknown>) : typeof it
      )
    );
  }

  return {
    domain: params.domain,
    score: o ? pickNumber(o, ["score", "ai_visibility_score", "aiv"]) : null,
    mentions: o ? pickNumber(o, ["mentions", "total_mentions"]) : null,
    byProvider: providers
      .map((row) => {
        const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        return {
          provider:
            pickString(r, ["provider", "name", "platform", "ai", "engine"]) ?? "",
          score: pickNumber(r, ["score", "ai_visibility_score", "visibility"]),
          mentions: pickNumber(r, ["mentions", "count", "total"]),
          citations: pickNumber(r, [
            "citations",
            "citation_count",
            "citations_count",
            "total_citations",
            "mentions",
            "count",
            "total",
          ]),
          pages: pickNumber(r, [
            "pages",
            "page_count",
            "pages_count",
            "unique_pages",
            "unique_urls",
            "urls",
            "url_count",
          ]),
        };
      })
      .filter((row) => row.provider.length > 0)
      .slice(0, 8),
    topQueries: queries
      .map((row) => {
        const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        return {
          query: pickString(r, ["query", "prompt", "keyword"]) ?? "",
          mentions: pickNumber(r, ["mentions", "count"]),
        };
      })
      .filter((row) => row.query.length > 0)
      .slice(0, 10),
    raw: items,
  };
}
