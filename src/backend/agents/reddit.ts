import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import { searchReddit } from "@/integrations/reddit";
import type { Agent, AgentContext } from "./base";

const replySchema = z.object({
  relevance: z.number().min(0).max(1).describe("0 = irrelevant, 1 = perfect fit"),
  shouldReply: z.boolean(),
  reasoning: z.string().describe("Why we should or shouldn't reply"),
  reply: z
    .string()
    .describe("Community-native reply. No promotional fluff. Brief and useful."),
});

type RedditAgentInput = {
  keywords?: string[];
  subreddits?: string[];
  limit?: number;
};

export const redditAgent: Agent<RedditAgentInput, { surfaced: number }> = {
  id: "reddit",
  title: "Reddit Agent",
  schedule: "0 */4 * * *", // every 4 hours
  minCredits: 1,
  async run(ctx: AgentContext, input: RedditAgentInput = {}) {
    if (!ctx.websiteUrl) throw new Error("Workspace has no website URL");

    const voice = ctx.voiceProfile as
      | {
          topicClusters?: Array<{ theme: string; keywords: string[] }>;
          positioning?: string;
        }
      | null;

    const keywords =
      input.keywords ??
      voice?.topicClusters?.flatMap((c) => c.keywords).slice(0, 5) ??
      [ctx.industry, ctx.icp].filter(Boolean).map(String);

    if (keywords.length === 0) throw new Error("No keywords derived for search");

    const threads: Array<{
      id: string;
      subreddit: string;
      permalink: string;
      title: string;
      selftext: string;
      score: number;
      comments: number;
    }> = [];

    for (const kw of keywords.slice(0, 3)) {
      try {
        const results = await searchReddit(kw, {
          subreddit: input.subreddits?.[0],
          limit: input.limit ?? 10,
        });
        for (const r of results) {
          threads.push({
            id: `t3_${r.id}`,
            subreddit: r.subreddit,
            permalink: `https://www.reddit.com${r.permalink}`,
            title: r.title,
            selftext: r.selftext?.slice(0, 800) ?? "",
            score: r.score,
            comments: r.num_comments,
          });
        }
      } catch (err) {
        console.warn(`Reddit search for "${kw}" failed:`, err);
      }
    }

    // Dedupe by externalId
    const seen = new Set<string>();
    const unique = threads.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));

    const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
    if (!model) {
      // No LLM — just surface top threads to review
      for (const t of unique.slice(0, 10)) {
        await prisma.redditThread.upsert({
          where: {
            workspaceId_externalId: { workspaceId: ctx.workspaceId, externalId: t.id },
          },
          create: {
            workspaceId: ctx.workspaceId,
            externalId: t.id,
            subreddit: t.subreddit,
            title: t.title,
            permalink: t.permalink,
            score: t.score,
            comments: t.comments,
            relevance: 0.5,
          },
          update: { score: t.score, comments: t.comments },
        });
      }
      return { surfaced: unique.length };
    }

    // Rank + draft reply for top threads
    let surfaced = 0;
    for (const t of unique.slice(0, 8)) {
      try {
        const { object } = await meteredGenerateObject(
          [
            `Our brand positioning: ${voice?.positioning || ctx.industry || "unknown"}`,
            `Our ICP: ${ctx.icp || "unknown"}`,
            "",
            `Reddit thread in r/${t.subreddit}:`,
            `Title: ${t.title}`,
            `Body: ${t.selftext || "(empty selftext)"}`,
            "",
            "Score this thread's relevance to our brand (0-1). If it's relevant, draft a short, community-native reply — no pitch, no URL, just add value. If not relevant, set shouldReply=false.",
          ].join("\n"),
          replySchema,
          {
            workspaceId: ctx.workspaceId,
            reason: "reddit.scan",
            model,
          }
        );

        await prisma.redditThread.upsert({
          where: {
            workspaceId_externalId: { workspaceId: ctx.workspaceId, externalId: t.id },
          },
          create: {
            workspaceId: ctx.workspaceId,
            externalId: t.id,
            subreddit: t.subreddit,
            title: t.title,
            permalink: t.permalink,
            score: t.score,
            comments: t.comments,
            relevance: object.relevance,
          },
          update: {
            relevance: object.relevance,
            score: t.score,
            comments: t.comments,
          },
        });

        if (object.shouldReply && object.relevance >= 0.6) {
          const draft = await prisma.contentDraft.create({
            data: {
              workspaceId: ctx.workspaceId,
              agent: "reddit",
              channel: "REDDIT",
              title: `Reply to: ${t.title.slice(0, 80)}`,
              body: object.reply,
              meta: {
                subreddit: t.subreddit,
                parentFullname: t.id,
                permalink: t.permalink,
                reasoning: object.reasoning,
              },
              status: "PENDING_APPROVAL",
            },
          });

          await prisma.actionItem.create({
            data: {
              workspaceId: ctx.workspaceId,
              agent: "reddit",
              type: "reddit.reply",
              title: `Reply in r/${t.subreddit}: ${t.title.slice(0, 60)}`,
              summary: object.reasoning,
              cta: "Review reply",
              href: `/content/${draft.id}`,
              priority: object.relevance > 0.8 ? "HIGH" : "MEDIUM",
              meta: { threadId: t.id, relevance: object.relevance },
            },
          });
          surfaced++;
        }
      } catch (err) {
        console.warn("Reddit thread analysis failed:", err);
      }
    }

    return { surfaced };
  },
};
