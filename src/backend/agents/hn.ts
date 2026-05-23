import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import { getHNFrontPage, searchHN, type HNStory } from "@/integrations/hackernews";
import { HN_SUBMIT_URL, hnItemUrl, parseHnMeta, type HNKind } from "@/shared/hn";
import type { Agent, AgentContext } from "./base";
import { upsertHNThread } from "./hn-db";

/** Interactive runs stay fast enough for Render’s HTTP timeout. */
const SCAN_STORY_LIMIT = 4;

const hnReplySchema = z.object({
  relevance: z.number().min(0).max(1),
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

function dedupeStories(stories: HNStory[]): HNStory[] {
  const seen = new Set<string>();
  return stories.filter((s) => !seen.has(s.objectID) && seen.add(s.objectID));
}

export async function runHNCommentScan(
  ctx: AgentContext,
  input: HNAgentInput
): Promise<{ surfaced: number; message?: string }> {
  const voice = ctx.voiceProfile as VoiceProfile | null;

  const keywords =
    input.keywords ??
    voice?.topicClusters?.flatMap((c) => c.keywords).slice(0, 5) ??
    [ctx.industry].filter(Boolean).map(String);

  const allStories: HNStory[] = [];

  try {
    const front = await getHNFrontPage(15);
    allStories.push(...front);
  } catch (err) {
    console.warn("HN front page fetch failed:", err);
  }

  for (const kw of keywords.slice(0, 3)) {
    try {
      const hits = await searchHN(kw, { limit: 10, byDate: true });
      allStories.push(...hits);
    } catch (err) {
      console.warn(`HN search failed for "${kw}":`, err);
    }
  }

  const unique = dedupeStories(allStories);
  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");

  if (!model) {
    for (const s of unique.slice(0, SCAN_STORY_LIMIT)) {
      const itemUrl = hnItemUrl(s.objectID);
      await upsertHNThread({
        workspaceId: ctx.workspaceId,
        externalId: s.objectID,
        title: s.title,
        itemUrl,
        storyUrl: s.url ?? null,
        points: s.points,
        comments: s.num_comments,
        relevance: 0.5,
      });
      await prisma.actionItem.create({
        data: {
          workspaceId: ctx.workspaceId,
          agent: "hn",
          type: "hn.thread",
          title: `HN: ${s.title.slice(0, 80)}`,
          summary: `${s.points} points · ${s.num_comments} comments`,
          cta: "Open on HN",
          href: s.url ?? itemUrl,
          priority: "LOW",
        },
      });
    }
    return {
      surfaced: Math.min(unique.length, SCAN_STORY_LIMIT),
      message:
        "No LLM API key configured. Threads were saved under Discovered — add ANTHROPIC_API_KEY or OPENAI_API_KEY on Render to draft comments.",
    };
  }

  let surfaced = 0;
  for (const s of unique.slice(0, SCAN_STORY_LIMIT)) {
    try {
      const storyText = s.story_text;
      const { object } = await meteredGenerateObject(
        [
          `Our positioning: ${voice?.positioning || ctx.industry || "unknown"}`,
          `Our ICP: ${ctx.icp || "unknown"}`,
          `Website: ${ctx.websiteUrl || "unknown"}`,
          "",
          `HN story (${s.points} points, ${s.num_comments} comments):`,
          `Title: ${s.title}`,
          s.url && `URL: ${s.url}`,
          storyText && `Text: ${storyText.slice(0, 800)}`,
          "",
          "Score relevance 0-1. If relevant, draft a thoughtful HN-native comment on someone else's thread — no self-promotion, cite specifics, add value. Otherwise shouldComment=false.",
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

      const itemUrl = hnItemUrl(s.objectID);
      await upsertHNThread({
        workspaceId: ctx.workspaceId,
        externalId: s.objectID,
        title: s.title,
        itemUrl,
        storyUrl: s.url ?? null,
        points: s.points,
        comments: s.num_comments,
        relevance: object.relevance,
      });

      if (object.shouldComment && object.relevance >= 0.6) {
        const draft = await prisma.contentDraft.create({
          data: {
            workspaceId: ctx.workspaceId,
            agent: "hn",
            channel: "HACKER_NEWS",
            title: `Comment on: ${s.title.slice(0, 80)}`,
            body: object.comment,
            meta: {
              hnKind: "comment" as HNKind,
              storyId: s.objectID,
              itemUrl,
              submitUrl: HN_SUBMIT_URL,
              reasoning: object.reasoning,
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
            summary: object.reasoning,
            cta: "Review comment",
            href: `/content/${draft.id}`,
            priority: "MEDIUM",
            meta: { storyId: s.objectID, relevance: object.relevance },
          },
        });
        surfaced++;
      }
    } catch (err) {
      console.warn("HN analysis failed:", err);
    }
  }

  return { surfaced };
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
        `Website: ${ctx.websiteUrl || "unknown"}`,
        `Positioning: ${voice?.positioning || ctx.industry || "unknown"}`,
        `ICP: ${ctx.icp || "unknown"}`,
        "",
        "Title MUST start with 'Show HN:'. Body: direct, technical, what you built and why — ask for feedback. Include postUrl if you have a product link.",
        "No marketing fluff. HN culture: humble, specific, useful.",
      ].join("\n"),
    },
    {
      kind: "ask_hn",
      prompt: [
        `Write an Ask HN post that would genuinely engage the HN community.`,
        `Context — we build for: ${voice?.positioning || ctx.industry || "unknown"}`,
        `ICP: ${ctx.icp || "unknown"}`,
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
    const messages: string[] = [];

    if (mode === "scan" || mode === "both") {
      const scan = await runHNCommentScan(ctx, input);
      surfaced = scan.surfaced;
      if ("message" in scan && scan.message) messages.push(scan.message);
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
      message: messages.length ? messages.join(" ") : undefined,
    };
  },
};
