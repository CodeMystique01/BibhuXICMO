import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import { searchHN, type HNStory } from "@/integrations/hackernews";
import type { Agent, AgentContext } from "./base";

const hnReplySchema = z.object({
  relevance: z.number().min(0).max(1),
  shouldComment: z.boolean(),
  reasoning: z.string(),
  comment: z.string(),
});

type HNAgentInput = {
  keywords?: string[];
};

export const hackerNewsAgent: Agent<HNAgentInput, { surfaced: number }> = {
  id: "hn",
  title: "Hacker News Agent",
  schedule: "0 */2 * * *",
  minCredits: 1,
  async run(ctx: AgentContext, input: HNAgentInput = {}) {
    const voice = ctx.voiceProfile as
      | { topicClusters?: Array<{ theme: string; keywords: string[] }>; positioning?: string }
      | null;

    const keywords =
      input.keywords ??
      voice?.topicClusters?.flatMap((c) => c.keywords).slice(0, 3) ??
      [ctx.industry].filter(Boolean).map(String);

    const allStories: HNStory[] = [];
    for (const kw of keywords.slice(0, 3)) {
      try {
        const hits = await searchHN(kw, { limit: 10 });
        allStories.push(...hits);
      } catch (err) {
        console.warn(`HN search failed for "${kw}":`, err);
      }
    }

    // Dedupe
    const seen = new Set<string>();
    const unique = allStories.filter(
      (s) => !seen.has(s.objectID) && seen.add(s.objectID)
    );

    const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
    if (!model) {
      for (const s of unique.slice(0, 5)) {
        await prisma.actionItem.create({
          data: {
            workspaceId: ctx.workspaceId,
            agent: "hn",
            type: "hn.thread",
            title: `HN: ${s.title.slice(0, 80)}`,
            summary: `${s.points} points · ${s.num_comments} comments`,
            cta: "Open on HN",
            href: s.url ?? `https://news.ycombinator.com/item?id=${s.objectID}`,
            priority: "LOW",
          },
        });
      }
      return { surfaced: unique.length };
    }

    let surfaced = 0;
    for (const s of unique.slice(0, 6)) {
      try {
        const { object } = await meteredGenerateObject(
          [
            `Our positioning: ${voice?.positioning || ctx.industry || "unknown"}`,
            `Our ICP: ${ctx.icp || "unknown"}`,
            "",
            `HN story (${s.points} points, ${s.num_comments} comments):`,
            `Title: ${s.title}`,
            s.url && `URL: ${s.url}`,
            s.story_text && `Text: ${s.story_text.slice(0, 600)}`,
            "",
            "Score relevance 0-1. If relevant, draft a thoughtful HN-native comment — no self-promotion, cite specifics, add value. Otherwise shouldComment=false.",
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

        if (object.shouldComment && object.relevance >= 0.6) {
          const draft = await prisma.contentDraft.create({
            data: {
              workspaceId: ctx.workspaceId,
              agent: "hn",
              channel: "HACKER_NEWS",
              title: `Comment on: ${s.title.slice(0, 80)}`,
              body: object.comment,
              meta: {
                storyId: s.objectID,
                itemUrl: `https://news.ycombinator.com/item?id=${s.objectID}`,
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
  },
};
