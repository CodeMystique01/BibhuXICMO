import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import { searchHN, type HNStory } from "@/integrations/hackernews";
import { HN_SUBMIT_URL, hnItemUrl, parseHnMeta, type HNKind } from "@/shared/hn";
import type { Agent, AgentContext } from "./base";
import { upsertHNThread } from "./hn-db";
import {
  deriveHNKeywords,
  formatBrandContext,
  MIN_COMMENT_RELEVANCE,
  MIN_DISCOVERED_RELEVANCE,
} from "./hn-keywords";

/** Max stories to score with LLM per scan (keyword search only). */
const MAX_STORIES_TO_SCORE = 10;

/** Max rows to keep in Discovered after filtering. */
const MAX_DISCOVERED_SAVE = 8;

const hnReplySchema = z.object({
  relevance: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "0 = unrelated to our product/market. 0.5 = tangential. 0.8+ = strong fit for a useful comment."
    ),
  shouldComment: z.boolean(),
  reasoning: z.string(),
  comment: z.string(),
});

const hnPostSchema = z.object({
  title: z.string().describe("Must start with Show HN: or Ask HN:"),
  body: z.string().describe("HN-native post body, no hype"),
  url: z.string().optional().describe("Product URL for Show HN only"),
  reasoning: z.string(),
});

export type HNAgentMode = "scan" | "posts" | "both";

export type HNAgentInput = {
  keywords?: string[];
  mode?: HNAgentMode;
};

type VoiceProfile = {
  topicClusters?: Array<{ theme: string; keywords: string[] }>;
  positioning?: string;
};

type ScoredStory = {
  story: HNStory;
  relevance: number;
  shouldComment: boolean;
  reasoning: string;
  comment: string;
};

function dedupeStories(stories: HNStory[]): HNStory[] {
  const seen = new Set<string>();
  return stories.filter((s) => !seen.has(s.objectID) && seen.add(s.objectID));
}

async function fetchKeywordStories(keywords: string[]): Promise<HNStory[]> {
  const allStories: HNStory[] = [];
  for (const kw of keywords) {
    try {
      const hits = await searchHN(kw, { limit: 12, byDate: true });
      allStories.push(...hits);
    } catch (err) {
      console.warn(`HN search failed for "${kw}":`, err);
    }
  }
  return dedupeStories(allStories);
}

async function scoreStory(
  ctx: AgentContext,
  voice: VoiceProfile | null,
  s: HNStory,
  model: NonNullable<ReturnType<typeof pickAvailableModel>>
): Promise<ScoredStory | null> {
  const storyText = s.story_text;
  const { object } = await meteredGenerateObject(
    [
      "You score whether an HN thread is worth engaging for THIS company only.",
      formatBrandContext(ctx, voice),
      "",
      `HN story (${s.points} points, ${s.num_comments} comments):`,
      `Title: ${s.title}`,
      s.url && `URL: ${s.url}`,
      storyText && `Text: ${storyText.slice(0, 800)}`,
      "",
      "Rules:",
      "- relevance < 0.2 if the story is generic tech news with no tie to our market, product, or customers.",
      "- relevance < 0.3 if it only vaguely mentions a giant brand (e.g. Amazon) but is not about our niche.",
      "- shouldComment=true only when we can add a non-promotional, expert comment that fits the thread.",
      "- Never inflate scores to force engagement.",
    ]
      .filter(Boolean)
      .join("\n"),
    hnReplySchema,
    {
      workspaceId: ctx.workspaceId,
      reason: "hn.scan",
      model,
    }
  );

  return {
    story: s,
    relevance: object.relevance,
    shouldComment: object.shouldComment,
    reasoning: object.reasoning,
    comment: object.comment,
  };
}

export async function runHNCommentScan(
  ctx: AgentContext,
  input: HNAgentInput
): Promise<{ surfaced: number; message?: string; discovered?: number }> {
  const voice = ctx.voiceProfile as VoiceProfile | null;
  const keywords = deriveHNKeywords(ctx, input.keywords, voice);

  if (keywords.length === 0) {
    return {
      surfaced: 0,
      discovered: 0,
      message:
        "Add a website URL and complete onboarding (industry / strategy) so we can search HN with relevant keywords.",
    };
  }

  const unique = await fetchKeywordStories(keywords);
  if (unique.length === 0) {
    return {
      surfaced: 0,
      discovered: 0,
      message: `No HN stories matched: ${keywords.join(", ")}. Try updating your industry or strategy keywords.`,
    };
  }

  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");

  if (!model) {
    return {
      surfaced: 0,
      discovered: 0,
      message:
        "No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY on Render to score relevance.",
    };
  }

  // Drop stale low-relevance rows from older scans
  await prisma.hNThread.deleteMany({
    where: {
      workspaceId: ctx.workspaceId,
      relevance: { lt: MIN_DISCOVERED_RELEVANCE },
    },
  });

  const toScore = unique.slice(0, MAX_STORIES_TO_SCORE);
  const scored: ScoredStory[] = [];

  for (const s of toScore) {
    try {
      const result = await scoreStory(ctx, voice, s, model);
      if (result) scored.push(result);
    } catch (err) {
      console.warn("HN analysis failed:", err);
    }
  }

  scored.sort((a, b) => b.relevance - a.relevance);

  const relevant = scored.filter((r) => r.relevance >= MIN_DISCOVERED_RELEVANCE);
  const toSave = relevant.slice(0, MAX_DISCOVERED_SAVE);

  let surfaced = 0;
  for (const r of toSave) {
    const s = r.story;
    const itemUrl = hnItemUrl(s.objectID);
    await upsertHNThread({
      workspaceId: ctx.workspaceId,
      externalId: s.objectID,
      title: s.title,
      itemUrl,
      storyUrl: s.url ?? null,
      points: s.points,
      comments: s.num_comments,
      relevance: r.relevance,
    });
  }

  for (const r of relevant) {
    if (!r.shouldComment || r.relevance < MIN_COMMENT_RELEVANCE) continue;

    const s = r.story;
    const itemUrl = hnItemUrl(s.objectID);

    const draft = await prisma.contentDraft.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "hn",
        channel: "HACKER_NEWS",
        title: `Comment on: ${s.title.slice(0, 80)}`,
        body: r.comment,
        meta: {
          hnKind: "comment" as HNKind,
          storyId: s.objectID,
          itemUrl,
          submitUrl: HN_SUBMIT_URL,
          reasoning: r.reasoning,
        },
        status: "PENDING_APPROVAL",
      },
    });

    await prisma.actionItem.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "hn",
        type: "hn.comment",
        title: `Comment on HN: ${s.title.slice(0, 60)}`,
        summary: r.reasoning,
        cta: "Review comment",
        href: `/content/${draft.id}`,
        priority: r.relevance > 0.8 ? "HIGH" : "MEDIUM",
        meta: { storyId: s.objectID, relevance: r.relevance },
      },
    });
    surfaced++;
  }

  if (toSave.length === 0) {
    return {
      surfaced: 0,
      discovered: 0,
      message: `Scanned ${toScore.length} stories for [${keywords.join(", ")}] — none were relevant enough (need ≥${Math.round(MIN_DISCOVERED_RELEVANCE * 100)}% fit).`,
    };
  }

  return {
    surfaced,
    discovered: toSave.length,
    message:
      surfaced === 0
        ? `Saved ${toSave.length} relevant thread(s); no comment drafts (need ≥${Math.round(MIN_COMMENT_RELEVANCE * 100)}% to draft).`
        : undefined,
  };
}

export async function runHNPostGeneration(
  ctx: AgentContext,
  opts: { skipIfRecent?: boolean } = {}
): Promise<{ generated: number; message?: string }> {
  const voice = ctx.voiceProfile as VoiceProfile | null;
  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
  if (!model) {
    return {
      generated: 0,
      message:
        "No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY in Render → Environment.",
    };
  }

  if (opts.skipIfRecent) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await prisma.contentDraft.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        agent: "hn",
        createdAt: { gte: since },
        channel: "HACKER_NEWS",
      },
      select: { meta: true },
    });
    const hasPost = recent.some((d) => {
      const k = parseHnMeta(d.meta)?.hnKind;
      return k === "show_hn" || k === "ask_hn";
    });
    if (hasPost) return { generated: 0 };
  }

  const postTypes: Array<{ kind: HNKind; prompt: string }> = [
    {
      kind: "show_hn",
      prompt: [
        `Write a Show HN submission for this product.`,
        formatBrandContext(ctx, voice),
        "",
        "Title MUST start with 'Show HN:'. Body: direct, technical, what you built and why — ask for feedback. Include postUrl if you have a product link.",
        "No marketing fluff. HN culture: humble, specific, useful.",
      ].join("\n"),
    },
    {
      kind: "ask_hn",
      prompt: [
        `Write an Ask HN post that would genuinely engage the HN community.`,
        formatBrandContext(ctx, voice),
        "",
        "Title MUST start with 'Ask HN:'. Body: a real question founders/developers would discuss — not a disguised pitch.",
      ].join("\n"),
    },
  ];

  let generated = 0;
  for (const { kind, prompt } of postTypes) {
    try {
      const { object } = await meteredGenerateObject(prompt, hnPostSchema, {
        workspaceId: ctx.workspaceId,
        reason: `hn.${kind}`,
        model,
      });

      const title =
        kind === "show_hn" && !object.title.startsWith("Show HN:")
          ? `Show HN: ${object.title.replace(/^Show HN:\s*/i, "")}`
          : kind === "ask_hn" && !object.title.startsWith("Ask HN:")
            ? `Ask HN: ${object.title.replace(/^Ask HN:\s*/i, "")}`
            : object.title;

      const postUrl =
        kind === "show_hn" ? object.url || ctx.websiteUrl || undefined : undefined;

      const draft = await prisma.contentDraft.create({
        data: {
          workspaceId: ctx.workspaceId,
          agent: "hn",
          channel: "HACKER_NEWS",
          title,
          body: object.body,
          meta: {
            hnKind: kind,
            submitUrl: HN_SUBMIT_URL,
            postUrl,
            reasoning: object.reasoning,
            peakWindow: "morning_pt",
          },
          status: "PENDING_APPROVAL",
        },
      });

      await prisma.actionItem.create({
        data: {
          workspaceId: ctx.workspaceId,
          agent: "hn",
          type: "hn.post",
          title: `Review ${kind === "show_hn" ? "Show HN" : "Ask HN"} draft`,
          summary: object.reasoning,
          cta: "Review post",
          href: `/content/${draft.id}`,
          priority: "HIGH",
          meta: { hnKind: kind },
        },
      });
      generated++;
    } catch (err) {
      console.warn(`HN post generation (${kind}) failed:`, err);
    }
  }

  return { generated };
}

export type HNAgentOutput = {
  surfaced: number;
  generated: number;
  discovered?: number;
  message?: string;
};

export const hackerNewsAgent: Agent<HNAgentInput, HNAgentOutput> = {
  id: "hn",
  title: "Hacker News Agent",
  schedule: "0 */2 * * *",
  minCredits: 1,
  async run(ctx: AgentContext, input: HNAgentInput = {}) {
    const mode = input.mode ?? "scan";
    let surfaced = 0;
    let generated = 0;
    let discovered = 0;
    const messages: string[] = [];

    if (mode === "scan" || mode === "both") {
      const scan = await runHNCommentScan(ctx, input);
      surfaced = scan.surfaced;
      discovered = scan.discovered ?? 0;
      if (scan.message) messages.push(scan.message);
    }

    if (mode === "posts") {
      const posts = await runHNPostGeneration(ctx);
      generated = posts.generated;
      if (posts.message) messages.push(posts.message);
    } else if (mode === "both") {
      const posts = await runHNPostGeneration(ctx, { skipIfRecent: true });
      generated = posts.generated;
      if (posts.message) messages.push(posts.message);
    }

    return {
      surfaced,
      generated,
      discovered,
      message: messages.length ? messages.join(" ") : undefined,
    };
  },
};
