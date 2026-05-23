import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import { HN_SUBMIT_URL, hnItemUrl, parseHnMeta, type HNKind } from "@/shared/hn";
import type { Agent, AgentContext } from "./base";
import { upsertHNThread } from "./hn-db";
import {
  deriveHNKeywords,
  formatBrandContext,
  MIN_COMMENT_RELEVANCE,
  MIN_DISCOVERED_RELEVANCE,
} from "./hn-keywords";
import { discoverRelevantHNThreads } from "./hn-search";
import { hnDraftSourceMeta, invalidateStaleHNDrafts } from "./hn-stale";

const MAX_DISCOVERED_SAVE = 8;

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
  /** Manual "Generate posts" always refreshes for current site. */
  forcePosts?: boolean;
};

type VoiceProfile = {
  topicClusters?: Array<{ theme: string; keywords: string[] }>;
  positioning?: string;
};

export async function runHNCommentScan(
  ctx: AgentContext,
  _input: HNAgentInput
): Promise<{ surfaced: number; message?: string; discovered?: number }> {
  const voice = ctx.voiceProfile as VoiceProfile | null;
  const keywords = deriveHNKeywords(ctx, _input.keywords, voice);

  if (!ctx.websiteUrl && keywords.length === 0) {
    return {
      surfaced: 0,
      discovered: 0,
      message:
        "Add a website URL in Settings so we can plan targeted HN searches for your product.",
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

  await prisma.hNThread.deleteMany({
    where: {
      workspaceId: ctx.workspaceId,
      relevance: { lt: MIN_DISCOVERED_RELEVANCE },
    },
  });

  const { ranked, queries, nicheSummary, scanned } = await discoverRelevantHNThreads(
    ctx,
    voice
  );

  const relevant = ranked.filter((r) => r.relevance >= MIN_DISCOVERED_RELEVANCE);
  const toSave = relevant.slice(0, MAX_DISCOVERED_SAVE);

  for (const r of toSave) {
    const s = r.story;
    await upsertHNThread({
      workspaceId: ctx.workspaceId,
      externalId: s.objectID,
      title: s.title,
      itemUrl: hnItemUrl(s.objectID),
      storyUrl: s.url ?? null,
      points: s.points,
      comments: s.num_comments,
      relevance: r.relevance,
    });
  }

  let surfaced = 0;
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
          ...hnDraftSourceMeta(ctx.websiteUrl),
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
      message: `Searched ${scanned} stories (${queries.slice(0, 4).join("; ")}…) — none matched: ${nicheSummary}`,
    };
  }

  return {
    surfaced,
    discovered: toSave.length,
    message:
      surfaced === 0
        ? `Saved ${toSave.length} relevant thread(s) for “${nicheSummary.slice(0, 80)}”.`
        : undefined,
  };
}

export async function runHNPostGeneration(
  ctx: AgentContext,
  opts: { skipIfRecent?: boolean; force?: boolean } = {}
): Promise<{ generated: number; message?: string; staleRejected?: number }> {
  const voice = ctx.voiceProfile as VoiceProfile | null;
  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
  if (!model) {
    return {
      generated: 0,
      message:
        "No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY in Render → Environment.",
    };
  }

  const staleRejected = await invalidateStaleHNDrafts(ctx.workspaceId, ctx.websiteUrl);

  if (!opts.force && opts.skipIfRecent) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const normalized = (ctx.websiteUrl ?? "").replace(/\/$/, "").toLowerCase();
    const recent = await prisma.contentDraft.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        agent: "hn",
        createdAt: { gte: since },
        channel: "HACKER_NEWS",
        status: { in: ["DRAFT", "PENDING_APPROVAL", "SCHEDULED"] },
      },
      select: { meta: true },
    });
    const hasPostForSite = recent.some((d) => {
      const k = parseHnMeta(d.meta)?.hnKind;
      if (k !== "show_hn" && k !== "ask_hn") return false;
      const source = String((d.meta as Record<string, unknown>)?.sourceWebsiteUrl ?? "")
        .replace(/\/$/, "")
        .toLowerCase();
      return source === normalized;
    });
    if (hasPostForSite) {
      return {
        generated: 0,
        staleRejected,
        message: "Show/Ask drafts already exist for this site today. Click Generate posts again tomorrow or after changing your website.",
      };
    }
  }

  if (!ctx.websiteUrl) {
    return {
      generated: 0,
      staleRejected,
      message: "Set your website URL in Settings before generating Show HN / Ask HN posts.",
    };
  }

  const postTypes: Array<{ kind: HNKind; prompt: string }> = [
    {
      kind: "show_hn",
      prompt: [
        `Write a Show HN submission for the product at ${ctx.websiteUrl} ONLY.`,
        "Do not reference any other company or previous website.",
        formatBrandContext(ctx, voice),
        "",
        "Title MUST start with 'Show HN:'. Body: direct, technical, what you built and why — ask for feedback.",
        "No marketing fluff. HN culture: humble, specific, useful.",
      ].join("\n"),
    },
    {
      kind: "ask_hn",
      prompt: [
        `Write an Ask HN post for the founder of ${ctx.websiteUrl} ONLY.`,
        formatBrandContext(ctx, voice),
        "",
        "Title MUST start with 'Ask HN:'. Body: a real question the HN community would discuss — not a disguised pitch.",
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
            ...hnDraftSourceMeta(ctx.websiteUrl),
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

  const extra =
    staleRejected > 0
      ? ` Removed ${staleRejected} outdated draft(s) from your previous website.`
      : "";

  return {
    generated,
    staleRejected,
    message: generated === 0 ? `Could not generate posts.${extra}` : extra || undefined,
  };
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
      const posts = await runHNPostGeneration(ctx, { force: input.forcePosts ?? true });
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
