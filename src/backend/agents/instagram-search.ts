/**
 * Instagram search pipeline.
 *
 * Mirrors the HN/X pipelines: LLM-planned hashtags → Apify hashtag actor →
 * heuristic pre-rank → single batched LLM rank. One plan call + one batch
 * call per scan, regardless of how many candidates we fetched.
 */
import { z } from "zod";
import { fetchPage } from "@/backend/scraper/fetch";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import {
  apifyScrapeHashtag,
  ApifyIGNotConfiguredError,
  type IGScrapedPost,
} from "@/integrations/instagram-apify";
import type { AgentContext } from "./base";
import {
  deriveIGKeywords,
  formatBrandContext,
} from "./instagram-keywords";

type VoiceProfile = {
  topicClusters?: Array<{ theme: string; keywords: string[] }>;
  positioning?: string;
};

const searchPlanSchema = z.object({
  hashtags: z
    .array(z.string())
    .min(3)
    .max(8)
    .describe(
      "IG hashtags (no # prefix) — specific niches, not just brand or industry-name"
    ),
  competitors: z
    .array(z.string())
    .max(5)
    .describe("Optional list of competitor IG handles worth monitoring (no @)"),
  nicheSummary: z.string(),
});

const batchScoreSchema = z.object({
  posts: z.array(
    z.object({
      id: z.string(),
      relevance: z.number().min(0).max(1),
      shouldComment: z.boolean(),
      reasoning: z.string(),
      comment: z.string(),
    })
  ),
});

export type RankedIGPost = {
  post: IGScrapedPost;
  relevance: number;
  shouldComment: boolean;
  reasoning: string;
  comment: string;
  heuristic: number;
};

function dedupe(posts: IGScrapedPost[]): IGScrapedPost[] {
  const seen = new Set<string>();
  return posts.filter((p) => !seen.has(p.id) && seen.add(p.id));
}

function searchTerms(keywords: string[], extra: string[]): string[] {
  const terms = new Set<string>();
  for (const q of [...keywords, ...extra]) {
    for (const part of q.toLowerCase().split(/\s+/)) {
      if (part.length >= 3) terms.add(part);
    }
  }
  return [...terms];
}

export function heuristicPostRelevance(p: IGScrapedPost, terms: string[]): number {
  if (terms.length === 0) return 0;
  const blob = `${p.caption} ${p.ownerHandle} ${p.hashtags.join(" ")}`.toLowerCase();
  let hits = 0;
  for (const t of terms) if (blob.includes(t)) hits++;
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

export async function planIGSearches(
  ctx: AgentContext,
  voice: VoiceProfile | null
): Promise<{ hashtags: string[]; competitors: string[]; nicheSummary: string }> {
  const fallback = deriveIGKeywords(ctx, undefined, voice);
  const model = pickAvailableModel("gpt-4o-mini");
  if (!model) {
    return {
      hashtags: fallback.slice(0, 6),
      competitors: [],
      nicheSummary: `Instagram posts about: ${fallback.join(", ")}`,
    };
  }

  const snippet = await siteSnippet(ctx.websiteUrl);

  try {
    const { object } = await meteredGenerateObject(
      [
        "Plan Instagram hashtag searches for a brand. Return 3–8 niche hashtags",
        "that REAL buyers / peers would tag, NOT generic mass-tags like",
        "#love #instagood #fashion #photooftheday.",
        "",
        formatBrandContext(ctx, voice),
        snippet && `Homepage: ${snippet}`,
        "",
        "Rules:",
        "- Prefer specific niches: '#hometheaterdiy', '#b2bsaas', '#solopreneurtips'.",
        "- Avoid the brand's own name as a hashtag unless it's already big.",
        "- Optionally list 3–5 competitor IG handles (no @).",
        fallback.length ? `Seed keywords: ${fallback.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      searchPlanSchema,
      { workspaceId: ctx.workspaceId, reason: "ig.search_plan", model }
    );
    return {
      hashtags: object.hashtags
        .map((h) => h.replace(/^#/, "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
      competitors: object.competitors
        .map((c) => c.replace(/^@/, "").trim())
        .filter(Boolean)
        .slice(0, 5),
      nicheSummary: object.nicheSummary,
    };
  } catch (err) {
    console.warn("[ig] search plan failed:", err);
    return {
      hashtags: fallback.slice(0, 6),
      competitors: [],
      nicheSummary: fallback.join(", "),
    };
  }
}

export async function fetchIGCandidates(hashtags: string[]): Promise<{
  posts: IGScrapedPost[];
  error?: string;
}> {
  const all: IGScrapedPost[] = [];
  let configError: string | undefined;
  let lastError: string | undefined;

  for (const tag of hashtags) {
    try {
      const hits = await apifyScrapeHashtag(tag, { resultsLimit: 15 });
      all.push(...hits);
    } catch (err) {
      if (err instanceof ApifyIGNotConfiguredError) {
        configError = err.message;
        break;
      }
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[ig] hashtag scrape failed for "${tag}":`, err);
    }
  }

  return {
    posts: dedupe(all),
    error: configError ?? (all.length === 0 ? lastError : undefined),
  };
}

export async function rankIGPostsWithLLM(
  ctx: AgentContext,
  voice: VoiceProfile | null,
  posts: IGScrapedPost[],
  nicheSummary: string,
  terms: string[]
): Promise<RankedIGPost[]> {
  if (posts.length === 0) return [];
  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
  if (!model) return [];

  const capped = posts.slice(0, 12);
  const listing = capped
    .map(
      (p, i) =>
        `[${i + 1}] id=${p.id} | @${p.ownerHandle} | ${p.likes} likes | ${p.comments} comments\n    ${p.caption.slice(0, 240)}`
    )
    .join("\n");

  const { object } = await meteredGenerateObject(
    [
      "Score each Instagram post for whether OUR brand should engage in the",
      "comments. Reply MUST be a short, non-promotional comment in our voice.",
      "",
      formatBrandContext(ctx, voice),
      `Target posts: ${nicheSummary}`,
      "",
      "Scoring:",
      "- 0.0–0.2: unrelated / off-topic / spam",
      "- 0.3–0.5: tangentially related",
      "- 0.6–0.8: good fit for a thoughtful comment",
      "- 0.9+: ideal — buying intent, peer asking, or perfect community fit",
      "- shouldComment only if relevance >= 0.65 AND we can add value",
      "- Never engage with bot accounts or angry rants",
      "",
      "Posts:",
      listing,
    ].join("\n"),
    batchScoreSchema,
    { workspaceId: ctx.workspaceId, reason: "ig.batch_rank", model }
  );

  const byId = new Map(capped.map((p) => [p.id, p]));
  const ranked: RankedIGPost[] = [];

  for (const row of object.posts) {
    const post = byId.get(row.id);
    if (!post) continue;
    ranked.push({
      post,
      relevance: row.relevance,
      shouldComment: row.shouldComment,
      reasoning: row.reasoning,
      comment: row.comment,
      heuristic: heuristicPostRelevance(post, terms),
    });
  }

  ranked.sort((a, b) => b.relevance - a.relevance || b.heuristic - a.heuristic);
  return ranked;
}

export async function discoverRelevantIGPosts(
  ctx: AgentContext,
  voice: VoiceProfile | null
): Promise<{
  ranked: RankedIGPost[];
  hashtags: string[];
  competitors: string[];
  nicheSummary: string;
  scanned: number;
  error?: string;
}> {
  const { hashtags, competitors, nicheSummary } = await planIGSearches(ctx, voice);
  const keywords = deriveIGKeywords(ctx, undefined, voice);
  const terms = searchTerms(keywords, hashtags);

  const { posts, error } = await fetchIGCandidates(hashtags);
  if (error && posts.length === 0) {
    return {
      ranked: [],
      hashtags,
      competitors,
      nicheSummary,
      scanned: 0,
      error,
    };
  }
  const scanned = posts.length;

  posts.sort(
    (a, b) => heuristicPostRelevance(b, terms) - heuristicPostRelevance(a, terms)
  );

  const ranked = await rankIGPostsWithLLM(ctx, voice, posts, nicheSummary, terms);
  return { ranked, hashtags, competitors, nicheSummary, scanned };
}
