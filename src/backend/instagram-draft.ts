/**
 * Instagram draft regenerate + schedule helpers (mirrors hn-draft.ts / x-draft.ts).
 */
import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import { nextIGPeakUtc, parseIgMeta, type IGKind } from "@/shared/instagram";

const captionSchema = z.object({
  caption: z.string(),
  hashtags: z.array(z.string()).max(10),
});
const replySchema = z.object({ reply: z.string().max(300) });

export async function regenerateIGDraft(workspaceId: string, draftId: string) {
  const draft = await prisma.contentDraft.findFirst({
    where: { id: draftId, workspaceId, channel: "INSTAGRAM" },
  });
  if (!draft) return { ok: false as const, error: "Draft not found" };

  const meta = parseIgMeta(draft.meta);
  const igKind: IGKind = meta?.igKind ?? "post";
  const model = pickAvailableModel("gpt-4o-mini");
  if (!model) return { ok: false as const, error: "No LLM configured" };

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });
  const voice = workspace?.voiceProfile as
    | { tone?: string; positioning?: string }
    | null;

  const baseCtx = [
    `Brand: ${workspace?.websiteUrl || workspace?.name}`,
    `Tone: ${voice?.tone || "friendly but professional"}`,
    voice?.positioning && `Positioning: ${voice.positioning}`,
  ]
    .filter(Boolean)
    .join("\n");

  if (igKind === "comment_reply" || igKind === "dm_outreach" || igKind === "dm_negotiation") {
    const prompt = [
      baseCtx,
      "",
      `Current draft (rewrite, keep core intent):\n${draft.body.slice(0, 800)}`,
      "",
      "Output ONE message under 300 chars. Sound human, helpful, non-promotional.",
    ].join("\n");
    const { object } = await meteredGenerateObject(prompt, replySchema, {
      workspaceId,
      reason: `ig.regenerate.${igKind}`,
      model,
    });
    await prisma.contentDraft.update({
      where: { id: draftId },
      data: { body: object.reply },
    });
    return { ok: true as const, body: object.reply };
  }

  // post / reel / story
  const kindHint =
    igKind === "reel"
      ? "Write a Reel caption with a strong hook (first line). 1–3 short paragraphs."
      : igKind === "story"
        ? "Write a Story overlay text — punchy, under 150 chars."
        : "Write a feed-post caption — 1–3 short paragraphs, hook first.";

  const prompt = [
    baseCtx,
    "",
    `Current caption (rewrite, keep core idea):\n${draft.body.slice(0, 1200)}`,
    "",
    kindHint,
    "Also return 5–8 niche hashtags (no #, no mass-tags like instagood).",
  ].join("\n");

  const { object } = await meteredGenerateObject(prompt, captionSchema, {
    workspaceId,
    reason: `ig.regenerate.${igKind}`,
    model,
  });
  await prisma.contentDraft.update({
    where: { id: draftId },
    data: {
      body: object.caption,
      meta: {
        ...(draft.meta as Record<string, unknown>),
        hashtags: object.hashtags.map((h) => h.replace(/^#/, "")),
      },
    },
  });
  return {
    ok: true as const,
    body: object.caption,
    hashtags: object.hashtags,
  };
}

export async function scheduleIGAtPeak(workspaceId: string, draftId: string) {
  const draft = await prisma.contentDraft.findFirst({
    where: { id: draftId, workspaceId, channel: "INSTAGRAM" },
  });
  if (!draft) return { ok: false as const, error: "Draft not found" };

  const scheduledAt = nextIGPeakUtc();
  const existing = await prisma.scheduledPost.findFirst({
    where: { draftId, workspaceId, status: "pending" },
  });

  await prisma.$transaction([
    prisma.contentDraft.update({
      where: { id: draftId },
      data: { status: "SCHEDULED", scheduledAt },
    }),
    existing
      ? prisma.scheduledPost.update({
          where: { id: existing.id },
          data: {
            scheduledAt,
            status: "pending",
            processedAt: null,
            error: null,
          },
        })
      : prisma.scheduledPost.create({
          data: {
            workspaceId,
            draftId,
            channel: "INSTAGRAM",
            scheduledAt,
            status: "pending",
          },
        }),
  ]);

  return { ok: true as const, scheduledAt: scheduledAt.toISOString() };
}
