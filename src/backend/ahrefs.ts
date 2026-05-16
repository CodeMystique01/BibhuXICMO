/**
 * Pulls site-critical SEO data from Apify's Ahrefs scraper actor.
 *
 * The actor (default: radeance/ahrefs-scraper) returns one dataset item
 * per "search type" you ask for. We request the two cheap, always-useful
 * ones — `include_web_authority` and `include_traffic` — and merge them
 * into a single, stable {@link AhrefsSnapshot} shape so the UI doesn't
 * have to know about the actor's per-type JSON.
 *
 * Config:
 *   APIFY_TOKEN              — required
 *   APIFY_AHREFS_ACTOR_ID    — default "radeance~ahrefs-scraper"
 */
import { env } from "@/shared/env";

export type AhrefsKeyword = {
  keyword: string;
  position?: number | null;
  volume?: number | null;
  traffic?: number | null;
  url?: string | null;
};

export type AhrefsTopCountry = {
  country: string;
  share?: number | null;
  traffic?: number | null;
};

export type AhrefsTopPage = {
  url: string;
  traffic?: number | null;
  share?: number | null;
};

export type AhrefsSnapshot = {
  domain: string;
  /** "exact" = single URL only · "subdomains" = includes blog.foo.com, www.foo.com */
  mode: "exact" | "subdomains";
  fetchedAt: string;

  // Authority (Domain Rating + backlinks)
  domainRating: number | null;
  urlRating: number | null;
  ahrefsRank: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  dofollowBacklinks: number | null;
  dofollowReferringDomains: number | null;

  // Traffic
  organicKeywords: number | null;
  organicTraffic: number | null;
  organicTrafficLastMonth: number | null;
  organicTrafficValue: number | null;

  topKeywords: AhrefsKeyword[];
  topCountries: AhrefsTopCountry[];
  topPages: AhrefsTopPage[];

  /** Raw dataset items the actor returned, for callers that want extra fields. */
  raw?: unknown[];
};

export class ApifyNotConfiguredError extends Error {
  constructor() {
    super("APIFY_TOKEN is not configured");
    this.name = "ApifyNotConfiguredError";
  }
}

export class ApifyAhrefsError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApifyAhrefsError";
  }
}

const SYNC_TIMEOUT_MS = 90_000;

export type FetchAhrefsOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  country?: string;
  mode?: "exact" | "subdomains";
  includeBacklinks?: boolean;
};

export async function fetchAhrefsSnapshot(
  rawDomain: string,
  opts: FetchAhrefsOptions = {}
): Promise<AhrefsSnapshot> {
  if (!env.APIFY_TOKEN) throw new ApifyNotConfiguredError();

  const domain = normalizeDomain(rawDomain);
  const mode = opts.mode ?? "subdomains";
  const actor = env.APIFY_AHREFS_ACTOR_ID;
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(
    actor
  )}/run-sync-get-dataset-items?token=${encodeURIComponent(env.APIFY_TOKEN)}`;

  const payload = {
    url: domain,
    mode,
    country: opts.country ?? "us",
    include_web_authority: true,
    include_traffic: true,
    include_backlinks: opts.includeBacklinks ?? false,
    include_ai_visibility: false,
    include_keywords: false,
    include_keywords_difficulty: false,
    include_keywords_ranking: false,
    include_serp: false,
    include_broken_links: false,
    include_top_websites: false,
  };

  const ctrl = new AbortController();
  const externalAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", externalAbort);
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? SYNC_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", externalAbort);
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new ApifyAhrefsError(
      `Apify Ahrefs actor returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      res.status
    );
  }

  let items: unknown;
  try {
    items = await res.json();
  } catch (err) {
    throw new ApifyAhrefsError(
      `Failed to parse Apify response as JSON: ${(err as Error).message}`
    );
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new ApifyAhrefsError(
      "Apify actor returned no items. The domain may be unknown to Ahrefs, or your actor credits may be exhausted."
    );
  }

  return mergeItems(items, domain, mode);
}

function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split("/")[0];
  return s;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.replace(/[, _]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function mergeItems(
  items: unknown[],
  domain: string,
  mode: "exact" | "subdomains"
): AhrefsSnapshot {
  const snap: AhrefsSnapshot = {
    domain,
    mode,
    fetchedAt: new Date().toISOString(),
    domainRating: null,
    urlRating: null,
    ahrefsRank: null,
    backlinks: null,
    referringDomains: null,
    dofollowBacklinks: null,
    dofollowReferringDomains: null,
    organicKeywords: null,
    organicTraffic: null,
    organicTrafficLastMonth: null,
    organicTrafficValue: null,
    topKeywords: [],
    topCountries: [],
    topPages: [],
    raw: items,
  };

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = typeof o.type === "string" ? o.type : "";

    if (type === "authority") {
      snap.domainRating = pickNumber(o, ["domain_rating", "domainRating"]);
      snap.urlRating = pickNumber(o, ["url_rating", "urlRating"]);
      snap.ahrefsRank = pickNumber(o, ["ahrefs_rank", "ahrefsRank"]);
      snap.backlinks = pickNumber(o, ["backlinks"]);
      snap.referringDomains = pickNumber(o, ["refdomains", "referringDomains"]);
      snap.dofollowBacklinks = pickNumber(o, [
        "dofollow_backlinks",
        "dofollowBacklinks",
      ]);
      snap.dofollowReferringDomains = pickNumber(o, [
        "dofollow_refdomains",
        "dofollowRefdomains",
      ]);

      // The nested `website_authority` block sometimes has the metrics in camelCase
      // when the top-level snake_case ones are missing (older actor builds).
      const wa = o.website_authority;
      if (wa && typeof wa === "object") {
        const w = wa as Record<string, unknown>;
        snap.domainRating ??= pickNumber(w, ["domainRating"]);
        snap.urlRating ??= pickNumber(w, ["urlRating"]);
        snap.ahrefsRank ??= pickNumber(w, ["ahrefsRank"]);
        snap.backlinks ??= pickNumber(w, ["backlinks"]);
        snap.referringDomains ??= pickNumber(w, ["refdomains"]);
      }
    }

    if (type === "traffic") {
      snap.organicTraffic = pickNumber(o, [
        "website_overall_search_traffic",
        "organicTraffic",
      ]);
      snap.organicTrafficLastMonth = pickNumber(o, [
        "website_overall_search_traffic_last_month",
      ]);
      snap.organicTrafficValue = pickNumber(o, [
        "website_overall_search_traffic_value",
      ]);

      const kws =
        asArray(o.website_overall_search_traffic_keywords).length > 0
          ? asArray(o.website_overall_search_traffic_keywords)
          : asArray(o.website_traffic_top_keywords);
      snap.topKeywords = kws
        .slice(0, 25)
        .map((row) => {
          const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
          const keyword =
            (typeof r.keyword === "string" && r.keyword) ||
            (typeof r.query === "string" && r.query) ||
            "";
          if (!keyword) return null;
          return {
            keyword,
            position: pickNumber(r, ["position", "pos", "rank"]),
            volume: pickNumber(r, ["volume", "searchVolume", "sv"]),
            traffic: pickNumber(r, ["traffic"]),
            url:
              (typeof r.url === "string" && r.url) ||
              (typeof r.landingPage === "string" && r.landingPage) ||
              null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null) as AhrefsKeyword[];
      snap.organicKeywords = snap.topKeywords.length > 0 ? snap.topKeywords.length : null;

      const countries = asArray(o.website_traffic_top_countries);
      snap.topCountries = countries
        .slice(0, 10)
        .map((row) => {
          const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
          const country = typeof r.country === "string" ? r.country : "";
          if (!country) return null;
          return {
            country,
            share: pickNumber(r, ["share", "trafficShare"]),
            traffic: pickNumber(r, ["traffic", "monthly_traffic"]),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null) as AhrefsTopCountry[];

      const pages = asArray(o.website_traffic_top_pages);
      snap.topPages = pages
        .slice(0, 10)
        .map((row) => {
          const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
          const url = typeof r.url === "string" ? r.url : "";
          if (!url) return null;
          return {
            url,
            traffic: pickNumber(r, ["traffic"]),
            share: pickNumber(r, ["share"]),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null) as AhrefsTopPage[];
    }
  }

  return snap;
}
