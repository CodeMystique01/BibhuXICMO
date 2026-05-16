import { env } from "@/shared/env";

export type LighthouseScores = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
};

export type PageSpeedResult = {
  ok: boolean;
  url: string;
  mobile: LighthouseScores;
  desktop: LighthouseScores;
  fetchedAt: string;
  error?: string;
};

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TIMEOUT_MS = 18_000;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;

type ApiResponse = {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null }>;
  };
};

async function runOne(
  url: string,
  strategy: "mobile" | "desktop"
): Promise<LighthouseScores> {
  const params = new URLSearchParams({ url, strategy });
  for (const c of CATEGORIES) params.append("category", c);
  if (env.PAGESPEED_API_KEY) params.set("key", env.PAGESPEED_API_KEY);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return emptyScores();
    }
    const json = (await res.json()) as ApiResponse;
    const cats = json.lighthouseResult?.categories ?? {};
    return {
      performance: pct(cats.performance?.score),
      accessibility: pct(cats.accessibility?.score),
      bestPractices: pct(cats["best-practices"]?.score),
      seo: pct(cats.seo?.score),
    };
  } catch {
    return emptyScores();
  } finally {
    clearTimeout(timer);
  }
}

function emptyScores(): LighthouseScores {
  return { performance: null, accessibility: null, bestPractices: null, seo: null };
}

function pct(score: number | null | undefined): number | null {
  if (score == null) return null;
  return Math.round(score * 100);
}

export async function fetchPageSpeed(url: string): Promise<PageSpeedResult> {
  if (!url) {
    return {
      ok: false,
      url,
      mobile: emptyScores(),
      desktop: emptyScores(),
      fetchedAt: new Date().toISOString(),
      error: "missing_url",
    };
  }

  try {
    const [mobile, desktop] = await Promise.all([
      runOne(url, "mobile"),
      runOne(url, "desktop"),
    ]);
    const ok =
      Object.values(mobile).some((v) => v != null) ||
      Object.values(desktop).some((v) => v != null);
    return {
      ok,
      url,
      mobile,
      desktop,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      url,
      mobile: emptyScores(),
      desktop: emptyScores(),
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : "pagespeed_failed",
    };
  }
}
