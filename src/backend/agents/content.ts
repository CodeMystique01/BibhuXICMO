import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import type { Agent, AgentContext } from "./base";
import { ContentChannel } from "@prisma/client";

const draftSchema = z.object({
  title: z.string(),
  slug: z.string(),
  body: z.string().min(400),
  outline: z.array(z.string()),
  metaDescription: z.string().max(180),
});

export type ContentDraftResult = z.infer<typeof draftSchema>;

export type ContentInput = {
  channel: "blog" | "landing_page" | "x" | "linkedin";
  topic: string;
  angle?: string;
  targetKeyword?: string;
  wordCount?: number;
};

const SYSTEM = `You are a senior content writer. You produce long-form content that ranks in Google and gets cited by ChatGPT. Guidelines:
- Start with a concrete promise or contrarian hook.
- Use clear H2/H3 structure with actionable takeaways.
- Cite specific data, companies, or examples where possible.
- Match the brand voice you are given.
- Output clean Markdown.`;

export const contentAgent: Agent<ContentInput, ContentDraftResult> = {
  id: "content",
  title: "AI Content Writer",
  minCredits: 1,
  async run(ctx: AgentContext, input: ContentInput): Promise<ContentDraftResult> {
    const voice = ctx.voiceProfile as
      | { tone?: string; styleGuidelines?: string[]; avoid?: string[]; positioning?: string }
      | null;

    const prompt = [
      `Channel: ${input.channel}`,
      `Industry: ${ctx.industry || "unknown"}`,
      `ICP: ${ctx.icp || "unknown"}`,
      voice?.positioning && `Brand positioning: ${voice.positioning}`,
      voice?.tone && `Voice tone: ${voice.tone}`,
      voice?.styleGuidelines?.length && `Style: ${voice.styleGuidelines.join(", ")}`,
      voice?.avoid?.length && `Avoid: ${voice.avoid.join(", ")}`,
      "",
      `Topic: ${input.topic}`,
      input.angle && `Angle: ${input.angle}`,
      input.targetKeyword && `Target keyword: ${input.targetKeyword}`,
      `Target word count: ${input.wordCount ?? (input.channel === "blog" ? 1200 : 600)}`,
      "",
      "Produce a Markdown draft optimized for both humans and LLM citations.",
    ]
      .filter(Boolean)
      .join("\n");

    const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
    if (!model) {
      // fallback lorem-draft so demo works without LLM keys
      const title = input.topic;
      const slug = title.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
      const body = `# ${title}\n\n_Draft placeholder — configure OPENAI_API_KEY or ANTHROPIC_API_KEY to produce real content._\n\n## Why this matters\n\n${input.angle || "Outline the problem space for your ICP."}\n\n## Key points\n\n- Point one\n- Point two\n- Point three\n`;
      const stored: ContentDraftResult = {
        title,
        slug,
        body,
        outline: ["Why this matters", "Key points"],
        metaDescription: input.angle || title,
      };
      await persistDraft(ctx, input.channel, stored);
      return stored;
    }

    const { object } = await meteredGenerateObject(prompt, draftSchema, {
      workspaceId: ctx.workspaceId,
      reason: "content.write",
      model,
      system: SYSTEM,
    });

    await persistDraft(ctx, input.channel, object);
    return object;
  },
};

async function persistDraft(
  ctx: AgentContext,
  channel: ContentInput["channel"],
  draft: ContentDraftResult
) {
  const mapChannel: Record<ContentInput["channel"], ContentChannel> = {
    blog: ContentChannel.BLOG,
    landing_page: ContentChannel.LANDING_PAGE,
    x: ContentChannel.X,
    linkedin: ContentChannel.LINKEDIN,
  };

  const created = await prisma.contentDraft.create({
    data: {
      workspaceId: ctx.workspaceId,
      agent: "content",
      channel: mapChannel[channel],
      title: draft.title,
      body: draft.body,
      meta: {
        slug: draft.slug,
        outline: draft.outline,
        metaDescription: draft.metaDescription,
      },
      status: "PENDING_APPROVAL",
    },
  });

  await prisma.actionItem.create({
    data: {
      workspaceId: ctx.workspaceId,
      agent: "content",
      type: "content.review",
      title: `Review draft: ${draft.title}`,
      summary: draft.metaDescription,
      cta: "Review",
      href: `/content/${created.id}`,
      priority: "MEDIUM",
    },
  });
}
