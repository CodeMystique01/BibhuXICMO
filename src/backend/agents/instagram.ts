/**
 * Instagram agent — content & engagement (Path A) + outreach & negotiation (Path B).
 *
 * Modes:
 *   - posts     → daily Feed Post + Reel + Story caption drafts
 *   - comments  → scan own posts via Graph API, draft replies for new comments
 *   - discover  → Apify hashtag discovery + batched LLM rank
 *   - outreach  → Apify creator discovery + first-DM drafts (see runIGOutreach)
 *   - negotiate → autopilot cycle for active negotiations (see runIGNegotiationCycle)
 *   - both      → posts + comments + discover (the daily cron default)
 *
 * Path A (posts/comments) only needs Facebook OAuth.
 * Path B (outreach/negotiate) needs `APIFY_TOKEN` (or `APIFY_IG_TOKEN`) and,
 * for actual DM sending, IG session cookies stored on the Integration.
 */
import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import type { Agent, AgentContext } from "./base";
import {
  deriveIGKeywords,
  formatBrandContext,
  MIN_IG_DISCOVERED_RELEVANCE,
  MIN_IG_REPLY_RELEVANCE,
  suggestIGHashtags,
} from "./instagram-keywords";
import { upsertIGThread } from "./instagram-db";
import {
  discoverRelevantIGPosts,
} from "./instagram-search";
import {
  igDraftSourceMeta,
  invalidateStaleIGDrafts,
} from "./instagram-stale";
import {
  fetchOwnComments,
  fetchRecentOwnMedia,
  resolveIgBusinessAccount,
} from "@/integrations/instagram";
import type { IGKind } from "@/shared/instagram";

const MAX_DISCOVERED_SAVE = 8;
const COMMENT_SCAN_MAX_MEDIA = 8;
const COMMENT_SCAN_MAX_COMMENTS_PER_POST = 20;

type VoiceProfile = {
  tone?: string;
  styleGuidelines?: string[];
  positioning?: string;
  topicClusters?: Array<{ theme: string; keywords: string[] }>;
};

const captionSchema = z.object({
  caption: z.string(),
  hashtags: z.array(z.string()).max(10),
  visualPrompt: z.string().describe("Short image/video idea for the user to create"),
  hook: z.string(),
  reasoning: z.string().optional(),
});

const commentReplySchema = z.object({
  replies: z.array(
    z.object({
      commentId: z.string(),
      relevance: z.number().min(0).max(1),
      shouldReply: z.boolean(),
      reply: z.string().max(280),
      reasoning: z.string(),
    })
  ),
});

export type IGAgentMode =
  | "posts"
  | "comments"
  | "discover"
  | "outreach"
  | "negotiate"
  | "both";

export type IGAgentInput = {
  mode?: IGAgentMode;
  keywords?: string[];
  forcePosts?: boolean;
  campaignId?: string;
  /** Composer fields — one-off draft path. */
  topic?: string;
  angle?: string;
  igKind?: "post" | "reel" | "story";
};

export type IGAgentOutput = {
  drafts: number;
  surfaced: number;
  discovered: number;
  message?: string;
};

// --------------------------------------------------------------------------
// Daily post generation (Feed Post + Reel + Story)
// --------------------------------------------------------------------------
export async function runIGPostGeneration(
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
      message:
        "Set your website URL in Settings before generating daily Instagram drafts.",
    };
  }

  const staleRejected = await invalidateStaleIGDrafts(
    ctx.workspaceId,
    ctx.websiteUrl
  );

  if (!opts.force && opts.skipIfRecent) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const normalized = (ctx.websiteUrl ?? "").replace(/\/$/, "").toLowerCase();
    const recent = await prisma.contentDraft.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        agent: "instagram",
        channel: "INSTAGRAM",
        createdAt: { gte: since },
        status: { in: ["DRAFT", "PENDING_APPROVAL", "SCHEDULED"] },
      },
      select: { meta: true },
    });
    const hasForSite = recent.some((d) => {
      const m = d.meta as Record<string, unknown> | null;
      const kind = m?.igKind;
      if (kind !== "post" && kind !== "reel" && kind !== "story") return false;
      const source = String(m?.sourceWebsiteUrl ?? "")
        .replace(/\/$/, "")
        .toLowerCase();
      return !!source && source === normalized;
    });
    if (hasForSite) {
      return {
        drafts: 0,
        staleRejected,
        message:
          "Instagram drafts already exist for this site today. Click Generate posts again tomorrow.",
      };
    }
  }

  const fallbackHashtags = suggestIGHashtags(ctx, voice);

  const targets: Array<{ kind: IGKind; prompt: string }> = [
    {
      kind: "post",
      prompt: [
        `Write an Instagram feed-post caption for the brand at ${ctx.websiteUrl}.`,
        formatBrandContext(ctx, voice),
        voice?.tone && `Tone: ${voice.tone}`,
        "",
        "Hook in the first line. 1–3 short paragraphs. Soft CTA at the end.",
        "Hashtags: 5–8 niche ones (no #love, #instagood, etc.).",
        "Visual prompt: describe a single still image the user could create.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      kind: "reel",
      prompt: [
        `Write a Reel caption + concept for the brand at ${ctx.websiteUrl}.`,
        formatBrandContext(ctx, voice),
        voice?.tone && `Tone: ${voice.tone}`,
        "",
        "Caption: 1–2 short lines, very punchy hook.",
        "Visual prompt: 15–30s vertical video idea, scene-by-scene.",
        "Hashtags: 5–8 niche ones.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      kind: "story",
      prompt: [
        `Write Story overlay text + a poll/sticker idea for ${ctx.websiteUrl}.`,
        formatBrandContext(ctx, voice),
        "",
        "Caption: under 150 chars total.",
        "Visual prompt: a single still or 5s video idea.",
        "Hashtags: 0–3 only (Stories don't use many).",
      ].join("\n"),
    },
  ];

  let drafts = 0;
  for (const { kind, prompt } of targets) {
    try {
      const { object } = await meteredGenerateObject(prompt, captionSchema, {
        workspaceId: ctx.workspaceId,
        reason: `ig.daily.${kind}`,
        model,
      });

      const cleanedHashtags = (object.hashtags?.length
        ? object.hashtags
        : fallbackHashtags
      )
        .map((h) => h.replace(/^#/, "").trim())
        .filter(Boolean)
        .slice(0, kind === "story" ? 3 : 8);

      const draft = await prisma.contentDraft.create({
        data: {
          workspaceId: ctx.workspaceId,
          agent: "instagram",
          channel: "INSTAGRAM",
          title: object.hook.slice(0, 100),
          body: object.caption,
          meta: {
            igKind: kind,
            hashtags: cleanedHashtags,
            visualPrompt: object.visualPrompt,
            reasoning: object.reasoning ?? "",
            ...igDraftSourceMeta(ctx.websiteUrl),
          },
          status: "PENDING_APPROVAL",
        },
      });

      await prisma.actionItem.create({
        data: {
          workspaceId: ctx.workspaceId,
          agent: "instagram",
          type: "instagram.review",
          title: `Review IG ${kind}: ${object.hook.slice(0, 60)}`,
          summary: object.reasoning ?? "Daily Instagram draft ready.",
          cta: "Review",
          href: `/content/${draft.id}`,
          priority: "MEDIUM",
        },
      });
      drafts++;
    } catch (err) {
      console.warn(`[ig] daily ${kind} draft failed:`, err);
    }
  }

  const extra =
    staleRejected > 0
      ? ` Removed ${staleRejected} outdated draft(s) from your previous website.`
      : "";
  return {
    drafts,
    staleRejected,
    message: drafts === 0 ? `Could not generate IG drafts.${extra}` : extra || undefined,
  };
}

// --------------------------------------------------------------------------
// Comment scan — replies on user's own posts (Graph API)
// --------------------------------------------------------------------------
export async function runIGCommentScan(
  ctx: AgentContext
): Promise<{ surfaced: number; scanned: number; message?: string }> {
  const voice = ctx.voiceProfile as VoiceProfile | null;
  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
  if (!model) {
    return {
      surfaced: 0,
      scanned: 0,
      message: "No LLM API key configured.",
    };
  }

  const acc = await resolveIgBusinessAccount(ctx.workspaceId);
  if (!acc) {
    return {
      surfaced: 0,
      scanned: 0,
      message:
        "Connect Instagram via the Integrations page to scan comments on your posts.",
    };
  }

  const media = await fetchRecentOwnMedia(ctx.workspaceId, COMMENT_SCAN_MAX_MEDIA);
  if (media.length === 0) {
    return {
      surfaced: 0,
      scanned: 0,
      message: "No recent posts found on the connected Instagram account.",
    };
  }

  type CommentRow = {
    id: string;
    text: string;
    username: string;
    mediaId: string;
    mediaPermalink: string;
  };

  const allComments: CommentRow[] = [];
  for (const m of media) {
    if (m.commentsCount === 0) continue;
    const comments = await fetchOwnComments(
      ctx.workspaceId,
      m.id,
      COMMENT_SCAN_MAX_COMMENTS_PER_POST
    );
    for (const c of comments) {
      // Skip our own replies — we'd just be talking to ourselves.
      if (acc.username && c.username === acc.username) continue;
      allComments.push({
        id: c.id,
        text: c.text,
        username: c.username,
        mediaId: m.id,
        mediaPermalink: m.permalink,
      });
    }
  }

  if (allComments.length === 0) {
    return {
      surfaced: 0,
      scanned: media.length,
      message: `Scanned ${media.length} recent posts — no new public comments to reply to.`,
    };
  }

  // Skip comments we've already drafted replies for in the last 30 days.
  const since = new Date(Date.now() - 30 * 86_400_000);
  const existing = await prisma.contentDraft.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      agent: "instagram",
      channel: "INSTAGRAM",
      createdAt: { gte: since },
    },
    select: { meta: true },
  });
  const seenCommentIds = new Set<string>();
  for (const e of existing) {
    const m = e.meta as Record<string, unknown> | null;
    if (m?.igKind === "comment_reply" && typeof m?.commentId === "string") {
      seenCommentIds.add(m.commentId);
    }
  }
  const fresh = allComments.filter((c) => !seenCommentIds.has(c.id)).slice(0, 12);
  if (fresh.length === 0) {
    return {
      surfaced: 0,
      scanned: media.length,
      message: "All recent comments already have draft replies.",
    };
  }

  const listing = fresh
    .map(
      (c, i) =>
        `[${i + 1}] id=${c.id} | @${c.username}\n    ${c.text.slice(0, 200)}`
    )
    .join("\n");

  let object: z.infer<typeof commentReplySchema>;
  try {
    const res = await meteredGenerateObject(
      [
        "Draft Instagram comment replies in OUR brand voice. One entry per id.",
        "Score relevance 0–1. shouldReply only if relevance >= 0.65.",
        "Reply MUST be ≤280 chars, friendly, and non-promotional.",
        "Skip spam, emoji-only comments, or unrelated noise (set shouldReply=false).",
        "",
        formatBrandContext(ctx, voice),
        "",
        "Comments:",
        listing,
      ].join("\n"),
      commentReplySchema,
      { workspaceId: ctx.workspaceId, reason: "ig.comment_replies", model }
    );
    object = res.object;
  } catch (err) {
    console.warn("[ig] comment reply LLM failed:", err);
    return {
      surfaced: 0,
      scanned: media.length,
      message: "Failed to draft comment replies. Try again in a moment.",
    };
  }

  const byId = new Map(fresh.map((c) => [c.id, c]));
  let surfaced = 0;
  for (const row of object.replies) {
    if (!row.shouldReply || row.relevance < MIN_IG_REPLY_RELEVANCE) continue;
    const comment = byId.get(row.commentId);
    if (!comment) continue;

    const draft = await prisma.contentDraft.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "instagram",
        channel: "INSTAGRAM",
        title: `Reply to @${comment.username}: ${comment.text.slice(0, 60)}`,
        body: row.reply,
        meta: {
          igKind: "comment_reply" as IGKind,
          commentId: comment.id,
          mediaId: comment.mediaId,
          parentText: comment.text.slice(0, 500),
          parentAuthor: comment.username,
          permalink: comment.mediaPermalink,
          reasoning: row.reasoning,
        },
        status: "PENDING_APPROVAL",
      },
    });

    await prisma.actionItem.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "instagram",
        type: "instagram.comment_reply",
        title: `Reply on IG: @${comment.username}`,
        summary: row.reasoning,
        cta: "Review reply",
        href: `/content/${draft.id}`,
        priority: row.relevance > 0.8 ? "HIGH" : "MEDIUM",
        meta: { commentId: comment.id, relevance: row.relevance },
      },
    });
    surfaced++;
  }

  return {
    surfaced,
    scanned: media.length,
    message:
      surfaced === 0
        ? `Scanned ${fresh.length} new comments across ${media.length} posts — none met the ${Math.round(MIN_IG_REPLY_RELEVANCE * 100)}% reply threshold.`
        : undefined,
  };
}

// --------------------------------------------------------------------------
// Discover — Apify hashtag-driven post discovery (engage on others' posts)
// --------------------------------------------------------------------------
export async function runIGDiscover(
  ctx: AgentContext
): Promise<{ discovered: number; surfaced: number; message?: string }> {
  const voice = ctx.voiceProfile as VoiceProfile | null;
  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
  if (!model) {
    return {
      discovered: 0,
      surfaced: 0,
      message:
        "No LLM API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY in Render → Environment.",
    };
  }

  if (!ctx.websiteUrl && (deriveIGKeywords(ctx, undefined, voice).length === 0)) {
    return {
      discovered: 0,
      surfaced: 0,
      message: "Add a website URL in Settings so we can plan targeted IG searches.",
    };
  }

  try {
    await prisma.iGThread.deleteMany({
      where: {
        workspaceId: ctx.workspaceId,
        relevance: { lt: MIN_IG_DISCOVERED_RELEVANCE },
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "P2021") throw err;
  }

  const { ranked, hashtags, nicheSummary, scanned, error } =
    await discoverRelevantIGPosts(ctx, voice);

  if (error) {
    return {
      discovered: 0,
      surfaced: 0,
      message: error.includes("APIFY_TOKEN")
        ? "Set APIFY_TOKEN (or APIFY_IG_TOKEN) in Render → Environment to enable IG discovery."
        : `Instagram discovery failed: ${error}`,
    };
  }

  const relevant = ranked.filter((r) => r.relevance >= MIN_IG_DISCOVERED_RELEVANCE);
  const toSave = relevant.slice(0, MAX_DISCOVERED_SAVE);

  for (const r of toSave) {
    await upsertIGThread({
      workspaceId: ctx.workspaceId,
      externalId: r.post.shortcode,
      authorHandle: r.post.ownerHandle,
      caption: r.post.caption,
      mediaUrl: r.post.mediaUrl ?? null,
      permalink: r.post.url,
      likes: r.post.likes,
      comments: r.post.comments,
      relevance: r.relevance,
    });
  }

  let surfaced = 0;
  for (const r of relevant) {
    if (!r.shouldComment || r.relevance < MIN_IG_REPLY_RELEVANCE) continue;

    const draft = await prisma.contentDraft.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "instagram",
        channel: "INSTAGRAM",
        title: `Comment on @${r.post.ownerHandle}: ${r.post.caption.slice(0, 60)}`,
        body: r.comment,
        meta: {
          igKind: "comment_reply" as IGKind,
          parentAuthor: r.post.ownerHandle,
          parentText: r.post.caption.slice(0, 500),
          permalink: r.post.url,
          shortcode: r.post.shortcode,
          reasoning: r.reasoning,
          assistedOnly: true, // comments on others' posts can't be auto-published
        },
        status: "PENDING_APPROVAL",
      },
    });

    await prisma.actionItem.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "instagram",
        type: "instagram.comment",
        title: `Comment on IG: @${r.post.ownerHandle}`,
        summary: r.reasoning,
        cta: "Review comment",
        href: `/content/${draft.id}`,
        priority: r.relevance > 0.8 ? "HIGH" : "MEDIUM",
      },
    });
    surfaced++;
  }

  if (toSave.length === 0) {
    return {
      discovered: 0,
      surfaced: 0,
      message: `Searched ${scanned} posts across #${hashtags.slice(0, 3).join(", #")} — none matched: ${nicheSummary}`,
    };
  }
  return {
    discovered: toSave.length,
    surfaced,
    message:
      surfaced === 0
        ? `Saved ${toSave.length} relevant post(s) under Discovered. None met the comment threshold (≥${Math.round(MIN_IG_REPLY_RELEVANCE * 100)}%).`
        : undefined,
  };
}

// --------------------------------------------------------------------------
// Ad-hoc composer — one-off post / reel / story for a specific topic
// --------------------------------------------------------------------------
export async function runIGAdHocDraft(
  ctx: AgentContext,
  input: { topic: string; angle?: string; igKind?: "post" | "reel" | "story" }
): Promise<{ draftId: string }> {
  const voice = ctx.voiceProfile as VoiceProfile | null;
  const igKind = input.igKind ?? "post";
  const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");

  let caption = `${input.topic}${input.angle ? ` — ${input.angle}` : ""}`;
  let hashtags: string[] = suggestIGHashtags(ctx, voice).slice(0, 6);
  let visualPrompt = `Image illustrating: ${input.topic}`;
  let hook = input.topic.slice(0, 80);

  if (model) {
    try {
      const { object } = await meteredGenerateObject(
        [
          formatBrandContext(ctx, voice),
          voice?.tone && `Tone: ${voice.tone}`,
          "",
          `Write an Instagram ${igKind} for the topic: "${input.topic}".`,
          input.angle && `Angle: ${input.angle}`,
          igKind === "reel"
            ? "Caption: 1–2 short lines, very punchy hook."
            : igKind === "story"
              ? "Caption: under 150 chars total, single overlay text."
              : "Caption: 1–3 short paragraphs, hook first.",
          "Hashtags: 5–8 niche ones (no mass-tags).",
          "Visual prompt: a single, concrete image / video idea.",
        ]
          .filter(Boolean)
          .join("\n"),
        captionSchema,
        { workspaceId: ctx.workspaceId, reason: `ig.adhoc.${igKind}`, model }
      );
      caption = object.caption;
      hashtags = object.hashtags
        .map((h) => h.replace(/^#/, "").trim())
        .filter(Boolean)
        .slice(0, igKind === "story" ? 3 : 8);
      visualPrompt = object.visualPrompt;
      hook = object.hook.slice(0, 100);
    } catch (err) {
      console.warn("[ig] adhoc draft failed:", err);
    }
  }

  const draft = await prisma.contentDraft.create({
    data: {
      workspaceId: ctx.workspaceId,
      agent: "instagram",
      channel: "INSTAGRAM",
      title: hook,
      body: caption,
      meta: {
        igKind,
        hashtags,
        visualPrompt,
        ...igDraftSourceMeta(ctx.websiteUrl),
      },
      status: "DRAFT",
    },
  });
  return { draftId: draft.id };
}

// --------------------------------------------------------------------------
// Registered agent — routes posts/comments/discover (outreach + negotiate
// are appended in instagram-outreach.ts via re-export below)
// --------------------------------------------------------------------------
export const instagramAgent: Agent<IGAgentInput, IGAgentOutput> = {
  id: "instagram",
  title: "Instagram Agent",
  schedule: "0 15 * * *", // daily 15:00 UTC ~ 11am ET
  minCredits: 1,
  async run(ctx: AgentContext, input: IGAgentInput = {}) {
    if (input.topic) {
      const { draftId } = await runIGAdHocDraft(ctx, {
        topic: input.topic,
        angle: input.angle,
        igKind: input.igKind,
      });
      return {
        drafts: 1,
        surfaced: 0,
        discovered: 0,
        message: `Composed draft ${draftId}`,
      } as IGAgentOutput;
    }
    const mode = input.mode ?? "both";
    let drafts = 0;
    let surfaced = 0;
    let discovered = 0;
    const messages: string[] = [];

    if (mode === "posts" || mode === "both") {
      const r = await runIGPostGeneration(ctx, {
        force: mode === "posts" ? (input.forcePosts ?? true) : false,
        skipIfRecent: mode === "both",
      });
      drafts += r.drafts;
      if (r.message) messages.push(r.message);
    }

    if (mode === "comments" || mode === "both") {
      const r = await runIGCommentScan(ctx);
      surfaced += r.surfaced;
      if (r.message) messages.push(r.message);
    }

    if (mode === "discover" || mode === "both") {
      const r = await runIGDiscover(ctx);
      discovered += r.discovered;
      surfaced += r.surfaced;
      if (r.message) messages.push(r.message);
    }

    if (mode === "outreach") {
      const { runIGOutreach } = await import("./instagram-outreach");
      const r = await runIGOutreach(ctx, { campaignId: input.campaignId });
      drafts += r.drafts;
      discovered += r.discovered;
      if (r.message) messages.push(r.message);
    }

    if (mode === "negotiate") {
      const { runIGNegotiationCycle } = await import("./instagram-outreach");
      const r = await runIGNegotiationCycle(ctx);
      surfaced += r.surfaced;
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
