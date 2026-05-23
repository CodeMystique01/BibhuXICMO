/**
 * X / Twitter agent.
 *
 * Modes:
 *   - `posts`   → generate today's single tweet + thread for the configured site
 *   - `replies` → scan recent tweets via Apify, draft replies for ≥0.65 relevance
 *   - `both`    → posts + replies (used by the daily cron)
 *
 * Reads go through Apify (`twitter-apify.ts`) — far cheaper than the X API
 * Basic tier. Writes use the OAuth integration in `integrations/twitter.ts`
 * (Free tier is fine for posting tweets, threads, and replies).
 *
 * Backwards-compat: when called with `{topic, mode: "single"|"thread"}` the
 * legacy XComposer flow generates an ad-hoc draft for that topic.
 */
import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import { parseXMeta, type XKind } from "@/shared/x";
import type { Agent, AgentContext } from "./base";
import { upsertXThread } from "./x-db";
import {
  discoverRelevantXTweets,
  MIN_X_DISCOVERED_RELEVANCE,
  MIN_X_REPLY_RELEVANCE,
} from "./x-search";
import { formatBrandContext } from "./hn-keywords";
import { invalidateStaleXDrafts, xDraftSourceMeta } from "./x-stale";

const SYSTEM = `You write for X (Twitter). Rules:
- Every tweet is <=280 characters — strict.
- Threads hook in tweet 1 with a concrete claim or counterintuitive statement.
- No emoji spam. At most one emoji per tweet, and only if it adds meaning.
- At most 3 hashtags, placed at the very end.
- Speak in the brand voice you're given.`;

const xDraftSchema = z.object({
  mode: z.enum(["single", "thread"]),
  tweets: z.array(z.string().max(280)).min(1).max(12),
  hashtags: z.array(z.string()).max(5),
  hook: z.string(),
  reasoning: z.string().optional(),
});

const MAX_DISCOVERED_SAVE = 8;

type VoiceProfile = {
  tone?: string;
  styleGuidelines?: string[];
  positioning?: string;
  topicClusters?: Array<{ theme: string; keywords: string[] }>;
};

export type XAgentMode = "posts" | "replies" | "both";

export type XAgentInput = {
  /** Legacy/Composer path — generate a single ad-hoc draft for the topic */
  topic?: string;
  /** Ad-hoc legacy mode (single tweet vs thread). */
  mode?: XAgentMode | "single" | "thread";
  angle?: string;
  /** When true, runHNPostGeneration-style daily refresh ignores recent-draft skip. */
  forcePosts?: boolean;
};

export type XAgentOutput = {
  drafts: number;
  surfaced: number;
  discovered: number;
  draftId?: string;
  message?: string;
};

// --------------------------------------------------------------------------
// Legacy ad-hoc composer (used by /agents/x XComposer + AI CMO draft_x_post)
// --------------------------------------------------------------------------
export async function runXAdHocDraft(
  ctx: AgentContext,
  input: { topic: string; angle?: string; mode?: "single" | "thread" }
): Promise<{ draftId: string }> {
  const voice = ctx.voiceProfile as VoiceProfile | null;

  const prompt = [
    `Positioning: ${voice?.positioning || ctx.industry || "unknown"}`,
    `Voice tone: ${voice?.tone || "professional but conversational"}`,
    voice?.styleGuidelines?.length && `Style: ${voice.styleGuidelines.join(", ")}`,
    "",
    `Topic: ${input.topic}`,
    input.angle && `Angle: ${input.angle}`,
    `Mode: ${input.mode ?? "thread"}`,
    "",
    "Produce the draft. Each tweet must be under 280 chars.",
  ]
    .filter(Boolean)
    .join("\n");

  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
  let object: z.infer<typeof xDraftSchema>;

  if (model) {
    const res = await meteredGenerateObject(prompt, xDraftSchema, {
      workspaceId: ctx.workspaceId,
      reason: "x.draft",
      model,
      system: SYSTEM,
    });
    object = res.object;
  } else {
    object = {
      mode: input.mode ?? "single",
      tweets: [`${input.topic}${input.angle ? ` — ${input.angle}` : ""}`],
      hashtags: [],
      hook: input.topic,
    };
  }

  const xKind: XKind = object.mode === "thread" ? "thread" : "single";

  const draft = await prisma.contentDraft.create({
    data: {
      workspaceId: ctx.workspaceId,
      agent: "x",
      channel: "X",
      title: object.hook.slice(0, 100),
      body: object.tweets
        .map((t, i) => (object.mode === "thread" ? `${i + 1}/ ${t}` : t))
        .join("\n\n"),
      meta: {
        xKind,
        mode: object.mode,
        tweets: object.tweets,
        hashtags: object.hashtags,
        ...xDraftSourceMeta(ctx.websiteUrl),
      },
      status: "PENDING_APPROVAL",
    },
  });

  await prisma.actionItem.create({
    data: {
      workspaceId: ctx.workspaceId,
      agent: "x",
      type: "x.review",
      title: `Review X ${object.mode}: ${object.hook.slice(0, 60)}`,
      summary: "Drafted for your approval.",
      cta: "Review",
      href: `/content/${draft.id}`,
      priority: "MEDIUM",
    },
  });

  return { draftId: draft.id };
}

// --------------------------------------------------------------------------
// Daily post generation (single + thread, both anchored to current site)
// --------------------------------------------------------------------------
export async function runXPostGeneration(
  ctx: AgentContext,
  opts: { skipIfRecent?: boolean; force?: boolean } = {}
): Promise<{ drafts: number; staleRejected: number; message?: string }> {
  const voice = ctx.voiceProfile as VoiceProfile | null;
  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
  if (!model) {
    return {
      drafts: 0,
      staleRejected: 0,
      message:
        "No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY in Render → Environment.",
    };
  }

  if (!ctx.websiteUrl) {
    return {
      drafts: 0,
      staleRejected: 0,
      message: "Set your website URL in Settings before generating daily X drafts.",
    };
  }

  const staleRejected = await invalidateStaleXDrafts(ctx.workspaceId, ctx.websiteUrl);

  if (!opts.force && opts.skipIfRecent) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const normalized = (ctx.websiteUrl ?? "").replace(/\/$/, "").toLowerCase();
    const recent = await prisma.contentDraft.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        agent: "x",
        channel: "X",
        createdAt: { gte: since },
        status: { in: ["DRAFT", "PENDING_APPROVAL", "SCHEDULED"] },
      },
      select: { meta: true },
    });
    const hasForSite = recent.some((d) => {
      const k = parseXMeta(d.meta)?.xKind;
      if (k !== "single" && k !== "thread") return false;
      const source = String((d.meta as Record<string, unknown>)?.sourceWebsiteUrl ?? "")
        .replace(/\/$/, "")
        .toLowerCase();
      return !!source && source === normalized;
    });
    if (hasForSite) {
      return {
        drafts: 0,
        staleRejected,
        message:
          "X drafts already exist for this site today. Click Generate posts again tomorrow.",
      };
    }
  }

  const targets: Array<{ kind: "single" | "thread"; prompt: string }> = [
    {
      kind: "single",
      prompt: [
        `Write ONE tweet for the founder of ${ctx.websiteUrl}.`,
        formatBrandContext(ctx, voice),
        voice?.tone && `Tone: ${voice.tone}`,
        "",
        "Make it punchy, share an insight or contrarian opinion. No hashtags inline,",
        "≤280 chars. The 'tweets' array should contain exactly one string.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      kind: "thread",
      prompt: [
        `Write a 4–7 tweet thread for ${ctx.websiteUrl}.`,
        formatBrandContext(ctx, voice),
        voice?.tone && `Tone: ${voice.tone}`,
        "",
        "Tweet 1 is the hook — a concrete claim, story, or counterintuitive insight.",
        "Each subsequent tweet adds ONE point. End with a soft CTA, not a hard sell.",
        "Each tweet ≤280 chars.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  let drafts = 0;
  for (const { kind, prompt } of targets) {
    try {
      const { object } = await meteredGenerateObject(prompt, xDraftSchema, {
        workspaceId: ctx.workspaceId,
        reason: `x.daily.${kind}`,
        model,
        system: SYSTEM,
      });

      const xKind: XKind = kind === "thread" ? "thread" : "single";
      const tweets = object.tweets.slice(0, kind === "single" ? 1 : 12);
      const body = tweets
        .map((t, i) => (xKind === "thread" ? `${i + 1}/ ${t}` : t))
        .join("\n\n");

      const draft = await prisma.contentDraft.create({
        data: {
          workspaceId: ctx.workspaceId,
          agent: "x",
          channel: "X",
          title: object.hook.slice(0, 100),
          body,
          meta: {
            xKind,
            mode: xKind,
            tweets,
            hashtags: object.hashtags,
            reasoning: object.reasoning ?? "",
            ...xDraftSourceMeta(ctx.websiteUrl),
          },
          status: "PENDING_APPROVAL",
        },
      });

      await prisma.actionItem.create({
        data: {
          workspaceId: ctx.workspaceId,
          agent: "x",
          type: "x.review",
          title: `Review X ${xKind}: ${object.hook.slice(0, 60)}`,
          summary: object.reasoning ?? "Daily draft ready for your approval.",
          cta: "Review",
          href: `/content/${draft.id}`,
          priority: "MEDIUM",
        },
      });
      drafts++;
    } catch (err) {
      console.warn(`[x] daily ${kind} draft failed:`, err);
    }
  }

  const extra =
    staleRejected > 0
      ? ` Removed ${staleRejected} outdated draft(s) from your previous website.`
      : "";

  return {
    drafts,
    staleRejected,
    message: drafts === 0 ? `Could not generate X drafts.${extra}` : extra || undefined,
  };
}

// --------------------------------------------------------------------------
// Reply scan — discovers tweets and drafts replies for the high-relevance ones
// --------------------------------------------------------------------------
export async function runXReplyScan(
  ctx: AgentContext
): Promise<{ surfaced: number; discovered: number; message?: string }> {
  const voice = ctx.voiceProfile as VoiceProfile | null;
  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
  if (!model) {
    return {
      surfaced: 0,
      discovered: 0,
      message:
        "No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to score relevance.",
    };
  }

  if (!ctx.websiteUrl) {
    return {
      surfaced: 0,
      discovered: 0,
      message: "Add a website URL in Settings so we can plan targeted X searches.",
    };
  }

  try {
    await prisma.xThread.deleteMany({
      where: {
        workspaceId: ctx.workspaceId,
        relevance: { lt: MIN_X_DISCOVERED_RELEVANCE },
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "P2021") throw err;
  }

  const { ranked, queries, nicheSummary, scanned, error } =
    await discoverRelevantXTweets(ctx, voice);

  if (error) {
    return {
      surfaced: 0,
      discovered: 0,
      message:
        error.includes("APIFY_TOKEN")
          ? "Set APIFY_TOKEN in Render → Environment to enable tweet discovery."
          : `Tweet search failed: ${error}`,
    };
  }

  const relevant = ranked.filter((r) => r.relevance >= MIN_X_DISCOVERED_RELEVANCE);
  const toSave = relevant.slice(0, MAX_DISCOVERED_SAVE);

  for (const r of toSave) {
    await upsertXThread({
      workspaceId: ctx.workspaceId,
      externalId: r.tweet.id,
      authorHandle: r.tweet.author.username,
      text: r.tweet.text,
      url: r.tweet.url,
      likes: r.tweet.metrics.likes,
      retweets: r.tweet.metrics.retweets,
      replies: r.tweet.metrics.replies,
      relevance: r.relevance,
    });
  }

  let surfaced = 0;
  for (const r of relevant) {
    if (!r.shouldReply || r.relevance < MIN_X_REPLY_RELEVANCE) continue;
    const t = r.tweet;

    const draft = await prisma.contentDraft.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "x",
        channel: "X",
        title: `Reply to @${t.author.username}: ${t.text.slice(0, 60)}`,
        body: r.reply,
        meta: {
          xKind: "reply" as XKind,
          mode: "single",
          tweets: [r.reply],
          parentTweetId: t.id,
          parentAuthor: t.author.username,
          parentUrl: t.url,
          parentText: t.text.slice(0, 500),
          reasoning: r.reasoning,
        },
        status: "PENDING_APPROVAL",
      },
    });

    await prisma.actionItem.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "x",
        type: "x.reply",
        title: `Reply on X: @${t.author.username}`,
        summary: r.reasoning,
        cta: "Review reply",
        href: `/content/${draft.id}`,
        priority: r.relevance > 0.8 ? "HIGH" : "MEDIUM",
        meta: { tweetId: t.id, relevance: r.relevance },
      },
    });
    surfaced++;
  }

  if (toSave.length === 0) {
    return {
      surfaced: 0,
      discovered: 0,
      message: `Searched ${scanned} tweets (${queries.slice(0, 3).join("; ")}…) — none matched: ${nicheSummary}`,
    };
  }

  return {
    surfaced,
    discovered: toSave.length,
    message:
      surfaced === 0
        ? `Saved ${toSave.length} relevant tweet(s) under Discovered. None met the reply threshold (≥${Math.round(MIN_X_REPLY_RELEVANCE * 100)}%).`
        : undefined,
  };
}

// --------------------------------------------------------------------------
// Registered agent — routes scan/posts/replies/both + legacy composer
// --------------------------------------------------------------------------
export const xAgent: Agent<XAgentInput, XAgentOutput | { draftId: string }> = {
  id: "x",
  title: "X / Twitter Agent",
  schedule: "0 13 * * *", // daily 13:00 UTC ~ 9am ET; replies + posts
  minCredits: 1,
  async run(ctx: AgentContext, input: XAgentInput = {}) {
    // Legacy composer path: explicit topic and a single/thread tweet mode
    if (input.topic && (input.mode === "single" || input.mode === "thread")) {
      return runXAdHocDraft(ctx, {
        topic: input.topic,
        angle: input.angle,
        mode: input.mode,
      });
    }

    const mode = (input.mode as XAgentMode | undefined) ?? "both";
    let drafts = 0;
    let surfaced = 0;
    let discovered = 0;
    const messages: string[] = [];

    if (mode === "posts" || mode === "both") {
      const r = await runXPostGeneration(ctx, {
        force: mode === "posts" ? (input.forcePosts ?? true) : false,
        skipIfRecent: mode === "both",
      });
      drafts += r.drafts;
      if (r.message) messages.push(r.message);
    }

    if (mode === "replies" || mode === "both") {
      const r = await runXReplyScan(ctx);
      surfaced = r.surfaced;
      discovered = r.discovered;
      if (r.message) messages.push(r.message);
    }

    return {
      drafts,
      surfaced,
      discovered,
      message: messages.length ? messages.join(" ") : undefined,
    };
  },
};
