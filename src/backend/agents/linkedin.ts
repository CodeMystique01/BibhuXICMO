import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import type { Agent, AgentContext } from "./base";

const liDraftSchema = z.object({
  hook: z.string(),
  body: z.string().min(200).max(3000),
  hashtags: z.array(z.string()).max(5),
});

export type LinkedInAgentInput = {
  topic: string;
  angle?: string;
};

const SYSTEM = `You write for LinkedIn. Rules:
- First line is a hook under 100 characters (LinkedIn truncates).
- Use short paragraphs (1-3 lines each) — whitespace is your friend.
- Total length 1000-2200 characters — the sweet spot.
- No self-aggrandizing fluff. Lead with insight. End with a question or CTA.
- At most 3 hashtags at the end.
- Match the provided brand voice.`;

export const linkedinAgent: Agent<LinkedInAgentInput, { draftId: string }> = {
  id: "linkedin",
  title: "LinkedIn Agent",
  minCredits: 1,
  async run(ctx: AgentContext, input: LinkedInAgentInput): Promise<{ draftId: string }> {
    const voice = ctx.voiceProfile as
      | { tone?: string; styleGuidelines?: string[]; positioning?: string }
      | null;

    const prompt = [
      `Positioning: ${voice?.positioning || ctx.industry || "unknown"}`,
      `Voice tone: ${voice?.tone || "authoritative but human"}`,
      voice?.styleGuidelines?.length && `Style: ${voice.styleGuidelines.join(", ")}`,
      "",
      `Topic: ${input.topic}`,
      input.angle && `Angle: ${input.angle}`,
      "",
      "Produce the LinkedIn post.",
    ]
      .filter(Boolean)
      .join("\n");

    const model = pickAvailableModel(ctx.preferredModel ?? "gpt-4o-mini");
    let object: z.infer<typeof liDraftSchema>;

    if (model) {
      const res = await meteredGenerateObject(prompt, liDraftSchema, {
        workspaceId: ctx.workspaceId,
        reason: "linkedin.draft",
        model,
        system: SYSTEM,
      });
      object = res.object;
    } else {
      object = {
        hook: input.topic,
        body: `${input.topic}\n\n${input.angle || "Expand with insight."}\n\nWhat has your experience been?`,
        hashtags: [],
      };
    }

    const body = `${object.hook}\n\n${object.body}${
      object.hashtags.length ? `\n\n${object.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : ""
    }`;

    const draft = await prisma.contentDraft.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "linkedin",
        channel: "LINKEDIN",
        title: object.hook.slice(0, 100),
        body,
        meta: { hashtags: object.hashtags },
        status: "PENDING_APPROVAL",
      },
    });

    await prisma.actionItem.create({
      data: {
        workspaceId: ctx.workspaceId,
        agent: "linkedin",
        type: "linkedin.review",
        title: `Review LinkedIn post: ${object.hook.slice(0, 60)}`,
        summary: "Drafted for your approval.",
        cta: "Review",
        href: `/content/${draft.id}`,
        priority: "MEDIUM",
      },
    });

    return { draftId: draft.id };
  },
};
