import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import type { Agent, AgentContext } from "./base";

const xDraftSchema = z.object({
  mode: z.enum(["single", "thread"]),
  tweets: z.array(z.string().max(280)).min(1).max(12),
  hashtags: z.array(z.string()).max(5),
  hook: z.string(),
});

export type XAgentInput = {
  topic: string;
  mode?: "single" | "thread";
  angle?: string;
};

const SYSTEM = `You write for X (Twitter). Rules:
- Every tweet is <=280 characters — strict.
- Threads hook in tweet 1 with a concrete claim or counterintuitive statement.
- No emoji spam. At most one emoji per tweet, and only if it adds meaning.
- At most 3 hashtags, placed at the very end.
- Speak in the brand voice you're given.`;

export const xAgent: Agent<XAgentInput, { draftId: string }> = {
  id: "x",
  title: "X / Twitter Agent",
  minCredits: 1,
  async run(ctx: AgentContext, input: XAgentInput): Promise<{ draftId: string }> {
    const voice = ctx.voiceProfile as
      | { tone?: string; styleGuidelines?: string[]; positioning?: string }
      | null;

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
          mode: object.mode,
          tweets: object.tweets,
          hashtags: object.hashtags,
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
  },
};
