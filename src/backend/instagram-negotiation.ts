/**
 * Instagram DM negotiation prompts + budget guards.
 *
 * Two primary helpers:
 *   - draftFirstDM       — outbound cold DM to a freshly discovered creator
 *   - draftCounterOffer  — reply to an incoming creator message, with strict
 *                          budget bounds and an `escalateToHuman` flag set
 *                          when the LLM is uncertain or out-of-policy.
 */
import { z } from "zod";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";

const firstDmSchema = z.object({
  message: z.string().max(900),
});

const counterSchema = z.object({
  proposedPrice: z.number().int().min(0),
  message: z.string().max(900),
  escalateToHuman: z.boolean(),
  reasoning: z.string(),
});

export type CampaignBrief = {
  brand: string;
  brief: string | null;
  budgetMin: number;
  budgetMax: number;
};

export type CreatorBrief = {
  handle: string;
  followers: number;
  niche?: string | null;
  bio?: string | null;
};

export async function draftFirstDM(args: {
  workspaceId: string;
  campaign: CampaignBrief;
  creator: CreatorBrief;
  voiceTone?: string;
}): Promise<{ message: string } | null> {
  const model = pickAvailableModel("gpt-4o-mini");
  if (!model) return null;

  const prompt = [
    `Draft a cold outreach DM from "${args.campaign.brand}" to @${args.creator.handle} on Instagram.`,
    `Creator: ${args.creator.followers.toLocaleString()} followers${args.creator.niche ? `, niche: ${args.creator.niche}` : ""}`,
    args.creator.bio && `Bio: ${args.creator.bio.slice(0, 240)}`,
    "",
    `Campaign brief: ${args.campaign.brief || "introduce the brand and explore a paid collab"}`,
    `Budget range: $${args.campaign.budgetMin}–$${args.campaign.budgetMax}`,
    args.voiceTone && `Voice tone: ${args.voiceTone}`,
    "",
    "Rules:",
    "- Sound like a real human, NOT a template.",
    "- Reference one specific thing about the creator (niche / style).",
    "- Don't lead with the exact budget; mention 'paid collab' or 'sponsored post'.",
    "- ≤900 chars; 2–3 short paragraphs; one soft question at the end.",
  ]
    .filter(Boolean)
    .join("\n");

  const { object } = await meteredGenerateObject(prompt, firstDmSchema, {
    workspaceId: args.workspaceId,
    reason: "ig.dm.first",
    model,
  });
  return { message: object.message };
}

export type NegotiationTurn = {
  role: "us" | "creator";
  text: string;
  sentAt: string;
};

export async function draftCounterOffer(args: {
  workspaceId: string;
  campaign: CampaignBrief;
  creator: CreatorBrief;
  history: NegotiationTurn[];
  voiceTone?: string;
}): Promise<{
  proposedPrice: number;
  message: string;
  escalateToHuman: boolean;
  reasoning: string;
} | null> {
  const model = pickAvailableModel("gpt-4o-mini");
  if (!model) return null;

  const mid = Math.round((args.campaign.budgetMin + args.campaign.budgetMax) / 2);
  const ceiling = Math.round(args.campaign.budgetMax * 1.1);
  const transcript = args.history
    .slice(-10)
    .map((t) => `${t.role === "us" ? args.campaign.brand : `@${args.creator.handle}`}: ${t.text}`)
    .join("\n");

  const prompt = [
    `You are negotiating a sponsored-post deal between "${args.campaign.brand}" and @${args.creator.handle}.`,
    `Budget bounds: floor=$${args.campaign.budgetMin}, midpoint=$${mid}, ceiling=$${args.campaign.budgetMax}.`,
    `Hard ceiling (any higher → escalate): $${ceiling}.`,
    args.voiceTone && `Voice tone: ${args.voiceTone}`,
    "",
    "Last few messages:",
    transcript || "(no prior messages yet)",
    "",
    "Rules:",
    "- propose a price in USD within bounds.",
    "- If creator demands above the hard ceiling, set escalateToHuman=true and propose ${budgetMax}.",
    "- If the conversation is ambiguous / off-topic / abusive, set escalateToHuman=true.",
    "- Be concise (≤500 chars), specific about deliverables (1 in-feed post, 2 stories, etc.).",
    "- Don't reveal the budget range explicitly.",
  ]
    .filter(Boolean)
    .join("\n");

  const { object } = await meteredGenerateObject(prompt, counterSchema, {
    workspaceId: args.workspaceId,
    reason: "ig.dm.counter",
    model,
  });

  const escalate =
    object.escalateToHuman || object.proposedPrice > ceiling;

  return {
    proposedPrice: Math.min(object.proposedPrice, ceiling),
    message: object.message,
    escalateToHuman: escalate,
    reasoning: object.reasoning,
  };
}

/** Quick policy guard for free-form sends — used before any actor call. */
export function acceptableWithinBudget(
  price: number,
  campaign: CampaignBrief
): boolean {
  const ceiling = campaign.budgetMax * 1.1;
  return price >= 0 && price <= ceiling;
}
