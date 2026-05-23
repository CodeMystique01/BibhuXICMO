/**
 * X / Twitter search pipeline.
 *
 * Mirrors the HN pipeline: LLM-planned niche queries → Apify scraper →
 * heuristic pre-rank → batched LLM ranker. Designed for the lowest possible
 * LLM cost (one plan call + one batch-rank call per scan).
 */
import { z } from "zod";
import { fetchPage } from "@/backend/scraper/fetch";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import {
  apifySearchTweets,
  ApifyXNotConfiguredError,
  type ApifyTweet,
} from "@/integrations/twitter-apify";
import type { AgentContext } from "./base";
import { deriveHNKeywords as deriveBrandKeywords, formatBrandContext } from "./hn-keywords";

type VoiceProfile = {
  topicClusters?: Array<{ theme: string; keywords: string[] }>;
  positioning?: string;
};

/** Minimum LLM relevance (0–1) to keep a tweet visible. */
export const MIN_X_DISCOVERED_RELEVANCE = 0.4;
/** Minimum LLM relevance to draft a reply for it. */
export const MIN_X_REPLY_RELEVANCE = 0.65;

const searchPlanSchema = z.object({
  queries: z
    .array(z.string())
    .min(3)
    .max(8)
    .describe(
      "X search terms — niche multi-word phrases, NOT just a single brand name"
    ),
  nicheSummary: z.string().describe("One sentence describing the kind of tweets we want"),
});

const batchScoreSchema = z.object({
  tweets: z.array(
    z.object({
      id: z.string(),
      relevance: z.number().min(0).max(1),
      shouldReply: z.boolean(),
      reasoning: z.string(),
      reply: z.string(),
    })
  ),
});

export type RankedXTweet = {
  tweet: ApifyTweet;
  relevance: number;
  shouldReply: boolean;
  reasoning: string;
  reply: string;
  heuristic: number;
};

function dedupeTweets(tweets: ApifyTweet[]): ApifyTweet[] {
  const seen = new Set<string>();
  return tweets.filter((t) => !seen.has(t.id) && seen.add(t.id));
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

export function heuristicTweetRelevance(t: ApifyTweet, terms: string[]): number {
  if (terms.length === 0) return 0;
  const blob = `${t.text} ${t.author.username}`.toLowerCase();
  let hits = 0;
  for (const term of terms) if (blob.includes(term)) hits++;
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

export async function planXSearchQueries(
  ctx: AgentContext,
  voice: VoiceProfile | null
): Promise<{ queries: string[]; nicheSummary: string }> {
  const fallbackKeywords = deriveBrandKeywords(ctx, undefined, voice);
  const model = pickAvailableModel("gpt-4o-mini");
  if (!model) {
    return {
      queries: expandFallbackQueries(ctx, fallbackKeywords),
      nicheSummary: `Tweets about: ${fallbackKeywords.join(", ")}`,
    };
  }

  const snippet = await siteSnippet(ctx.websiteUrl);

  try {
    const { object } = await meteredGenerateObject(
      [
        "Plan X (Twitter) searches for a company. Output multi-word queries that",
        "would appear in real tweets from potential customers/peers — NOT generic",
        "industry news headlines and NOT just a big brand word.",
        "",
        formatBrandContext(ctx, voice),
        snippet && `Homepage: ${snippet}`,
        "",
        "Rules:",
        "- Prefer queries like buyer pain (e.g. 'losing reddit karma'), use-case",
        "  ('automating cold dms'), or tech stack ('next.js auth').",
        "- 3–8 queries, each 2–5 words.",
        "- Avoid plain brand words (`amazon`, `github`) — they return noise.",
        fallbackKeywords.length ? `Seed terms: ${fallbackKeywords.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      searchPlanSchema,
      { workspaceId: ctx.workspaceId, reason: "x.search_plan", model }
    );
    return {
      queries: object.queries.map((q) => q.trim()).filter(Boolean).slice(0, 8),
      nicheSummary: object.nicheSummary,
    };
  } catch (err) {
    console.warn("[x] search plan failed:", err);
    return {
      queries: expandFallbackQueries(ctx, fallbackKeywords),
      nicheSummary: fallbackKeywords.join(", "),
    };
  }
}

function expandFallbackQueries(ctx: AgentContext, keywords: string[]): string[] {
  const out = new Set<string>();
  for (const k of keywords) {
    out.add(k);
    if (ctx.industry) out.add(`${k} ${ctx.industry}`.slice(0, 60));
  }
  if (ctx.industry) out.add(ctx.industry);
  return [...out].slice(0, 6);
}

export async function fetchXCandidates(queries: string[]): Promise<{
  tweets: ApifyTweet[];
  error?: string;
}> {
  const all: ApifyTweet[] = [];
  let configError: string | undefined;
  let lastError: string | undefined;

  for (const q of queries) {
    try {
      const hits = await apifySearchTweets(q, {
        maxItems: 15,
        sort: "Top",
        sinceDays: 7,
      });
      all.push(...hits);
    } catch (err) {
      if (err instanceof ApifyXNotConfiguredError) {
        configError = err.message;
        break;
      }
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[x] Apify search failed for "${q}":`, err);
    }
  }

  return {
    tweets: dedupeTweets(all),
    error: configError ?? (all.length === 0 ? lastError : undefined),
  };
}

export async function rankXTweetsWithLLM(
  ctx: AgentContext,
  voice: VoiceProfile | null,
  tweets: ApifyTweet[],
  nicheSummary: string,
  terms: string[]
): Promise<RankedXTweet[]> {
  if (tweets.length === 0) return [];
  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
  if (!model) return [];

  const capped = tweets.slice(0, 12);
  const listing = capped
    .map(
      (t, i) =>
        `[${i + 1}] id=${t.id} | @${t.author.username} | ${t.metrics.likes} likes\n    ${t.text.slice(0, 280)}`
    )
    .join("\n");

  const { object } = await meteredGenerateObject(
    [
      "Score each tweet for whether OUR company should reply. One entry per id.",
      "Reply MUST be ≤280 chars, in our brand voice, useful and non-promotional.",
      "",
      formatBrandContext(ctx, voice),
      `Target tweets: ${nicheSummary}`,
      "",
      "Scoring rules:",
      "- 0.0–0.2: unrelated (generic news, off-topic, wrong audience)",
      "- 0.3–0.5: tangential",
      "- 0.6–0.8: good fit for a thoughtful reply",
      "- 0.9+: ideal — buying intent, direct question, or peer asking",
      "- shouldReply only if relevance >= 0.65 AND we can add real value",
      "- Never reply to promotional spam, retweets, or angry rants",
      "",
      "Tweets:",
      listing,
    ].join("\n"),
    batchScoreSchema,
    { workspaceId: ctx.workspaceId, reason: "x.batch_rank", model }
  );

  const byId = new Map(capped.map((t) => [t.id, t]));
  const ranked: RankedXTweet[] = [];

  for (const row of object.tweets) {
    const tweet = byId.get(row.id);
    if (!tweet) continue;
    let reply = row.reply.trim();
    if (reply.length > 280) reply = reply.slice(0, 277) + "...";
    ranked.push({
      tweet,
      relevance: row.relevance,
      shouldReply: row.shouldReply,
      reasoning: row.reasoning,
      reply,
      heuristic: heuristicTweetRelevance(tweet, terms),
    });
  }

  ranked.sort((a, b) => b.relevance - a.relevance || b.heuristic - a.heuristic);
  return ranked;
}

export async function discoverRelevantXTweets(
  ctx: AgentContext,
  voice: VoiceProfile | null
): Promise<{
  ranked: RankedXTweet[];
  queries: string[];
  nicheSummary: string;
  scanned: number;
  error?: string;
}> {
  const { queries, nicheSummary } = await planXSearchQueries(ctx, voice);
  const keywords = deriveBrandKeywords(ctx, undefined, voice);
  const terms = searchTerms(keywords, queries);

  const { tweets, error } = await fetchXCandidates(queries);
  if (error && tweets.length === 0) {
    return { ranked: [], queries, nicheSummary, scanned: 0, error };
  }
  const scanned = tweets.length;

  tweets.sort(
    (a, b) => heuristicTweetRelevance(b, terms) - heuristicTweetRelevance(a, terms)
  );

  const ranked = await rankXTweetsWithLLM(ctx, voice, tweets, nicheSummary, terms);
  return { ranked, queries, nicheSummary, scanned };
}
