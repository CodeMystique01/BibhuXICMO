"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
import { probeAiOverview } from "@/backend/agents/geo-aio-probe";
import { hasSeoApifyToken } from "@/backend/ahrefs-tools";
import { isLikelyValidKey } from "@/backend/llm";
import { env } from "@/shared/env";
import type {
  AiCitationsActionResult,
  AiCitationsBundle,
  PlatformCounts,
  PlatformKey,
} from "./ai-citations-types";

// ---------------------------------------------------------------------------
// Data source: the existing `GeoQuery` LLM-probe table.
//
// The radeance/ahrefs-scraper Apify actor doesn't return AI-visibility data
// despite the include_ai_visibility flag — it only returns traffic /
// authority / backlinks. So the AI citations panel sources from the LLM
// probes you already have configured (OpenAI / Anthropic / Google). Each
// probe is a (provider, prompt, cited) row that we bucket by platform.
//
// Counts:
//   citations = # of probes with cited=true in the window.
//   pages     = # of distinct prompts cited (proxy for unique cited pages).
//
// Delta: current 30-day window vs the previous 30-day window.
// ---------------------------------------------------------------------------

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return s;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0];
  return s;
}

/**
 * Map a model/provider string (e.g. "gemini-1.5-flash", "claude-haiku-4-5",
 * "gpt-4o-mini") to the reference platform key. We follow the reference
 * layout's 6 tiles — Claude responses are folded into the ChatGPT tile
 * because Claude has no dedicated tile in the design.
 */
function mapProvider(name: string): PlatformKey | null {
  const s = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return null;
  // Google AI Overviews / SGE
  if (s.includes("aioverview") || s.includes("googleaio") || s === "aio" || s === "sge")
    return "aiOverviews";
  // Gemini / Bard / Google models
  if (s.includes("gemini") || s.includes("bard") || s.startsWith("googleai"))
    return "gemini";
  // ChatGPT / OpenAI / GPT family
  if (
    s.includes("chatgpt") ||
    s.includes("openai") ||
    s.startsWith("gpt") ||
    s.startsWith("o1") ||
    s.startsWith("o3") ||
    s.startsWith("o4") ||
    s.includes("davinci")
  )
    return "chatgpt";
  // Claude / Anthropic — fold into ChatGPT tile per the reference layout.
  if (
    s.includes("claude") ||
    s.includes("anthropic") ||
    s.includes("haiku") ||
    s.includes("sonnet") ||
    s.includes("opus")
  )
    return "chatgpt";
  // Perplexity
  if (s.includes("perplexity") || s === "pplx") return "perplexity";
  // Microsoft Copilot / Bing Chat
  if (s.includes("copilot") || s.includes("bingchat") || s === "bing")
    return "copilot";
  // xAI Grok
  if (s.includes("grok") || s === "xai") return "grok";
  return null;
}

type ProbeRow = { provider: string; cited: boolean; prompt: string; checkedAt: Date };

function aggregate(probes: ProbeRow[], windowStart: number, windowEnd: number) {
  const byPlatform = new Map<
    PlatformKey,
    { citations: number; prompts: Set<string> }
  >();
  for (const p of probes) {
    if (!p.cited) continue;
    const t = p.checkedAt.getTime();
    if (t < windowStart || t >= windowEnd) continue;
    const platform = mapProvider(p.provider);
    if (!platform) continue;
    if (!byPlatform.has(platform)) {
      byPlatform.set(platform, { citations: 0, prompts: new Set() });
    }
    const entry = byPlatform.get(platform)!;
    entry.citations++;
    entry.prompts.add(p.prompt.trim().toLowerCase());
  }
  const out: Partial<Record<PlatformKey, PlatformCounts>> = {};
  for (const [k, v] of byPlatform.entries()) {
    out[k] = { citations: v.citations, pages: v.prompts.size };
  }
  return out;
}

async function buildBundle(
  workspaceId: string,
  domain: string
): Promise<AiCitationsBundle | null> {
  const now = Date.now();
  const cutoffPrior = new Date(now - 2 * WINDOW_MS);

  const probes: ProbeRow[] = await prisma.geoQuery.findMany({
    where: { workspaceId, checkedAt: { gte: cutoffPrior } },
    select: { provider: true, cited: true, prompt: true, checkedAt: true },
  });
  if (probes.length === 0) return null;

  const current = aggregate(probes, now - WINDOW_MS, now);
  const previous = aggregate(probes, now - 2 * WINDOW_MS, now - WINDOW_MS);

  // Find the most recent probe checkedAt as the bundle timestamp.
  const latestTs = probes.reduce(
    (acc, p) => Math.max(acc, p.checkedAt.getTime()),
    0
  );

  return {
    domain,
    country: "us",
    fetchedAt: new Date(latestTs).toISOString(),
    previousAt: new Date(now - WINDOW_MS).toISOString(),
    current,
    previous,
  };
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

export async function loadAiCitationsAction(args?: {
  domain?: string;
}): Promise<AiCitationsActionResult> {
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(args?.domain ?? workspace.websiteUrl ?? "");
  if (!domain) return { ok: true, data: null };
  return { ok: true, data: await buildBundle(workspace.id, domain) };
}

/**
 * Refresh = re-aggregate from the GeoQuery table. No Apify / LLM calls are
 * made here — the panel re-uses whatever probes the GEO agent (the
 * "Run GEO check" button at the top of the page) already produced.
 */
export async function refreshAiCitationsAction(args?: {
  domain?: string;
}): Promise<AiCitationsActionResult> {
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(args?.domain ?? workspace.websiteUrl ?? "");
  if (!domain) return { ok: true, data: null };
  const data = await buildBundle(workspace.id, domain);
  revalidatePath("/agents/geo");
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Provider status — which platforms can we probe given the current env?
// The panel shows a friendly hint on tiles whose backing key isn't set.
// ---------------------------------------------------------------------------

export type ProviderStatus = {
  /** Tile keys keyed by their reason for being empty. */
  configured: PlatformKey[];
  /** Per-platform missing-key hint. */
  hints: Partial<Record<PlatformKey, string>>;
};

export async function getProviderStatusAction(): Promise<ProviderStatus> {
  const configured: PlatformKey[] = [];
  const hints: Partial<Record<PlatformKey, string>> = {};

  // AI Overviews — uses Apify SERP scraper.
  if (hasSeoApifyToken()) {
    configured.push("aiOverviews");
  } else {
    hints.aiOverviews = "Set APIFY_SEO_TOKEN (or APIFY_TOKEN) to enable AI Overviews probing.";
  }

  // ChatGPT — OpenAI key OR Anthropic Claude (folded into this tile).
  if (
    isLikelyValidKey(env.OPENAI_API_KEY) ||
    isLikelyValidKey(env.ANTHROPIC_API_KEY)
  ) {
    configured.push("chatgpt");
  } else {
    hints.chatgpt = "Set OPENAI_API_KEY or ANTHROPIC_API_KEY to probe ChatGPT-style models.";
  }

  // Gemini — Google API key.
  if (isLikelyValidKey(env.GOOGLE_GEMINI_API_KEY)) {
    configured.push("gemini");
  } else {
    hints.gemini = "Set GOOGLE_GEMINI_API_KEY to probe Gemini.";
  }

  // Perplexity — its own key.
  if (isLikelyValidKey(env.PERPLEXITY_API_KEY)) {
    configured.push("perplexity");
  } else {
    hints.perplexity = "Set PERPLEXITY_API_KEY to probe Perplexity.";
  }

  // Copilot — no public API yet; we'd need a Bing scraper for parity.
  hints.copilot = "Copilot has no public probe API. Coming soon via Bing SERP scraper.";

  // Grok — xAI key, not wired yet.
  hints.grok = "Grok requires an xAI API key (XAI_API_KEY). Coming soon.";

  return { configured, hints };
}

// ---------------------------------------------------------------------------
// Backfill: run AI Overviews probe for the prompts already in `GeoQuery`.
// Lets the user populate the AI Overviews tile immediately without
// triggering a full GEO agent re-run.
// ---------------------------------------------------------------------------

export type BackfillResult =
  | { ok: true; probed: number; cited: number; hadOverview: number }
  | { ok: false; error: string };

export async function backfillAiOverviewsAction(args?: {
  domain?: string;
  limit?: number;
}): Promise<BackfillResult> {
  if (!hasSeoApifyToken()) {
    return {
      ok: false,
      error: "Apify token not configured. Set APIFY_SEO_TOKEN or APIFY_TOKEN.",
    };
  }
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(args?.domain ?? workspace.websiteUrl ?? "");
  if (!domain) {
    return { ok: false, error: "Workspace has no website URL set." };
  }

  // Pull distinct prompts from recent GeoQuery rows (last 60 days). Cap so
  // a backfill never balloons Apify usage — at default 8 prompts × ~$0.0015
  // per Google search this run costs roughly $0.012.
  const lookback = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const rows = await prisma.geoQuery.findMany({
    where: { workspaceId: workspace.id, checkedAt: { gte: lookback } },
    select: { prompt: true },
    orderBy: { checkedAt: "desc" },
    take: 200,
  });
  const seen = new Set<string>();
  const prompts: string[] = [];
  const limit = Math.min(Math.max(args?.limit ?? 8, 1), 20);
  for (const r of rows) {
    const p = r.prompt.trim();
    if (!p) continue;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    prompts.push(p);
    if (prompts.length >= limit) break;
  }
  if (prompts.length === 0) {
    return {
      ok: false,
      error: "No GEO prompts found yet — run a GEO check first so we know what queries to probe.",
    };
  }

  let probed = 0;
  let cited = 0;
  let hadOverview = 0;
  for (const prompt of prompts) {
    try {
      const r = await probeAiOverview({ query: prompt, domain });
      if (!r) continue;
      probed++;
      if (r.hasOverview) hadOverview++;
      if (r.cited) cited++;
      await prisma.geoQuery.create({
        data: {
          workspaceId: workspace.id,
          prompt,
          provider: "ai_overviews",
          cited: r.cited,
          snippet: r.snippet || (r.hasOverview ? "AIO present" : "no AIO"),
          rawResponse: { sources: r.sources, hasOverview: r.hasOverview },
        },
      });
    } catch (err) {
      console.warn("[geo] backfill probe failed:", err);
    }
  }
  revalidatePath("/agents/geo");
  return { ok: true, probed, cited, hadOverview };
}
