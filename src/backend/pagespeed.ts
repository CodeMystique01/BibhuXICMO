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
// Lighthouse can take 30-50s on a heavy site; mobile emulation is the slow one.
// 60s is the upper bound; if we still time out, the URL is unscorable.
const TIMEOUT_MS = 60_000;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;

type ApiResponse = {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null }>;
  };
};

type RunResult = { scores: LighthouseScores; error?: string };

async function runOne(
  url: string,
  strategy: "mobile" | "desktop",
  attempt = 1
): Promise<RunResult> {
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
      let body = "";
      try {
        body = (await res.text()).slice(0, 300);
      } catch {
        /* ignore */
      }
      console.warn(
        `[pagespeed] ${strategy} ${url} failed: HTTP ${res.status} ${body}`
      );
      return {
        scores: emptyScores(),
        error: `Google PageSpeed returned ${res.status}${body ? ` — ${body.slice(0, 120)}` : ""}`,
      };
    }
    const json = (await res.json()) as ApiResponse;
    const cats = json.lighthouseResult?.categories ?? {};
    return {
      scores: {
        performance: pct(cats.performance?.score),
        accessibility: pct(cats.accessibility?.score),
        bestPractices: pct(cats["best-practices"]?.score),
        seo: pct(cats.seo?.score),
      },
    };
  } catch (err) {
    const e = err as Error;
    const isAbort = e?.name === "AbortError";
    console.warn(
      `[pagespeed] ${strategy} ${url} threw on attempt ${attempt}: ${isAbort ? "timeout" : e?.message}`
    );
    // Retry once on timeout — Lighthouse cold-start can blow the first call
    // on free Render hardware. Second attempt usually completes in <30s.
    if (isAbort && attempt === 1) {
      clearTimeout(timer);
      return runOne(url, strategy, 2);
    }
    return {
      scores: emptyScores(),
      error: isAbort
        ? `Google PageSpeed timed out after ${Math.round(TIMEOUT_MS / 1000)}s on both attempts — the URL is too slow for Lighthouse. Try a smaller landing page.`
        : `Google PageSpeed call failed: ${e?.message || "unknown error"}`,
    };
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
      Object.values(mobile.scores).some((v) => v != null) ||
      Object.values(desktop.scores).some((v) => v != null);
    const errorReason = !ok
      ? mobile.error || desktop.error || "Google PageSpeed returned no scores."
      : undefined;
    return {
      ok,
      url,
      mobile: mobile.scores,
      desktop: desktop.scores,
      fetchedAt: new Date().toISOString(),
      error: errorReason,
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
