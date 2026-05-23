import { z } from "zod";
import { fetchPage } from "@/backend/scraper/fetch";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import { searchHN, type HNStory } from "@/integrations/hackernews";
import type { AgentContext } from "./base";
import { deriveHNKeywords, formatBrandContext } from "./hn-keywords";

type VoiceProfile = {
  topicClusters?: Array<{ theme: string; keywords: string[] }>;
  positioning?: string;
};

const searchPlanSchema = z.object({
  queries: z
    .array(z.string())
    .min(3)
    .max(10)
    .describe("HN Algolia search phrases — specific niches, not single generic brand words"),
  nicheSummary: z.string().describe("One sentence: what threads we want"),
});

const batchScoreSchema = z.object({
  stories: z.array(
    z.object({
      objectID: z.string(),
      relevance: z.number().min(0).max(1),
      shouldComment: z.boolean(),
      reasoning: z.string(),
      comment: z.string(),
    })
  ),
});

export type RankedHNStory = {
  story: HNStory;
  relevance: number;
  shouldComment: boolean;
  reasoning: string;
  comment: string;
  heuristic: number;
};

function dedupeStories(stories: HNStory[]): HNStory[] {
  const seen = new Set<string>();
  return stories.filter((s) => !seen.has(s.objectID) && seen.add(s.objectID));
}

function searchTerms(keywords: string[], queries: string[]): string[] {
  const terms = new Set<string>();
  for (const q of [...keywords, ...queries]) {
    for (const part of q.toLowerCase().split(/\s+/)) {
      if (part.length >= 3) terms.add(part);
    }
  }
  return [...terms];
}

/** Fast overlap score before LLM — surfaces better Algolia ordering. */
export function heuristicRelevance(story: HNStory, terms: string[]): number {
  if (terms.length === 0) return 0;
  const blob = `${story.title} ${story.story_text ?? ""} ${story.url ?? ""}`.toLowerCase();
  let hits = 0;
  for (const t of terms) {
    if (blob.includes(t)) hits++;
  }
  return hits / terms.length;
}

async function siteSnippet(url: string | null): Promise<string> {
  if (!url) return "";
  try {
    const snap = await fetchPage(url);
    return [snap.title, snap.description].filter(Boolean).join(" — ").slice(0, 400);
  } catch {
    return "";
  }
}

export async function planHNSearchQueries(
  ctx: AgentContext,
  voice: VoiceProfile | null
): Promise<{ queries: string[]; nicheSummary: string }> {
  const fallbackKeywords = deriveHNKeywords(ctx, undefined, voice);
  const model = pickAvailableModel("gpt-4o-mini");
  if (!model) {
    const queries = expandFallbackQueries(ctx, fallbackKeywords);
    return {
      queries,
      nicheSummary: `Threads about: ${fallbackKeywords.join(", ")}`,
    };
  }

  const snippet = await siteSnippet(ctx.websiteUrl);

  try {
    const { object } = await meteredGenerateObject(
      [
        "Plan Hacker News Algolia searches for a company. Output specific multi-word queries",
        "that would appear in real HN thread titles — not generic front-page tech news.",
        "",
        formatBrandContext(ctx, voice),
        snippet && `Homepage: ${snippet}`,
        "",
        "Rules:",
        "- Do NOT use only a huge brand name (e.g. 'amazon') — HN returns unrelated Amazon mentions.",
        "- Prefer niche phrases: 'seller tools', 'serverless', 'B2B SaaS pricing', etc.",
        "- Mix product category, buyer pain, and technology stack.",
        "- 4–10 queries, each 2–5 words.",
        fallbackKeywords.length
          ? `Seed terms: ${fallbackKeywords.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      searchPlanSchema,
      { workspaceId: ctx.workspaceId, reason: "hn.search_plan", model }
    );
    return {
      queries: object.queries.map((q) => q.trim()).filter(Boolean).slice(0, 10),
      nicheSummary: object.nicheSummary,
    };
  } catch (err) {
    console.warn("[hn] search plan failed:", err);
    const queries = expandFallbackQueries(ctx, fallbackKeywords);
    return { queries, nicheSummary: fallbackKeywords.join(", ") };
  }
}

function expandFallbackQueries(ctx: AgentContext, keywords: string[]): string[] {
  const out = new Set<string>();
  for (const k of keywords) {
    out.add(k);
    if (ctx.industry) out.add(`${k} ${ctx.industry}`.slice(0, 60));
  }
  if (ctx.industry) out.add(ctx.industry);
  const icp = ctx.icp?.split(/\s+/).slice(0, 3).join(" ");
  if (icp && icp.length > 5) out.add(icp);
  return [...out].slice(0, 8);
}

export async function fetchHNCandidates(queries: string[]): Promise<HNStory[]> {
  const all: HNStory[] = [];
  for (const q of queries) {
    try {
      const [recent, popular] = await Promise.all([
        searchHN(q, { limit: 10, byDate: true }),
        searchHN(q, { limit: 8, byDate: false }),
      ]);
      all.push(...recent, ...popular);
    } catch (err) {
      console.warn(`[hn] search failed for "${q}":`, err);
    }
  }
  return dedupeStories(all);
}

export async function rankHNStoriesWithLLM(
  ctx: AgentContext,
  voice: VoiceProfile | null,
  stories: HNStory[],
  nicheSummary: string,
  terms: string[]
): Promise<RankedHNStory[]> {
  if (stories.length === 0) return [];

  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
  if (!model) return [];

  const capped = stories.slice(0, 12);
  const listing = capped
    .map(
      (s, i) =>
        `[${i + 1}] id=${s.objectID} | ${s.points}pts | ${s.title}${s.story_text ? `\n    ${s.story_text.slice(0, 200)}` : ""}`
    )
    .join("\n");

  const { object } = await meteredGenerateObject(
    [
      "Score each HN story for whether OUR company should engage. Return one entry per id.",
      "",
      formatBrandContext(ctx, voice),
      `Target threads: ${nicheSummary}`,
      "",
      "Scoring:",
      "- 0.0–0.2: unrelated (generic tech, wrong company, vague brand mention)",
      "- 0.3–0.5: tangential",
      "- 0.6–0.8: good fit for a thoughtful comment",
      "- 0.9+: ideal thread",
      "- shouldComment only if relevance >= 0.65 AND we can add non-promotional value",
      "",
      "Stories:",
      listing,
    ].join("\n"),
    batchScoreSchema,
    { workspaceId: ctx.workspaceId, reason: "hn.batch_rank", model }
  );

  const byId = new Map(capped.map((s) => [s.objectID, s]));
  const ranked: RankedHNStory[] = [];

  for (const row of object.stories) {
    const story = byId.get(row.objectID);
    if (!story) continue;
    ranked.push({
      story,
      relevance: row.relevance,
      shouldComment: row.shouldComment,
      reasoning: row.reasoning,
      comment: row.comment,
      heuristic: heuristicRelevance(story, terms),
    });
  }

  ranked.sort((a, b) => b.relevance - a.relevance || b.heuristic - a.heuristic);
  return ranked;
}

/** Full pipeline: plan queries → Algolia → heuristic pre-rank → batch LLM score. */
export async function discoverRelevantHNThreads(
  ctx: AgentContext,
  voice: VoiceProfile | null
): Promise<{
  ranked: RankedHNStory[];
  queries: string[];
  nicheSummary: string;
  scanned: number;
}> {
  const { queries, nicheSummary } = await planHNSearchQueries(ctx, voice);
  const keywords = deriveHNKeywords(ctx, undefined, voice);
  const terms = searchTerms(keywords, queries);

  const candidates = await fetchHNCandidates(queries);
  const scanned = candidates.length;

  candidates.sort(
    (a, b) => heuristicRelevance(b, terms) - heuristicRelevance(a, terms)
  );

  const ranked = await rankHNStoriesWithLLM(ctx, voice, candidates, nicheSummary, terms);

  return { ranked, queries, nicheSummary, scanned };
}
