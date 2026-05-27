"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/backend/db";
import { requireWorkspace } from "@/backend/workspace";
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
