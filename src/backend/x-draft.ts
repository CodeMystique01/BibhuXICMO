/**
 * X draft regenerate + schedule helpers (mirrors backend/hn-draft.ts).
 *
 * `regenerateXDraft`  → LLM rewrites the tweet text(s) for an existing draft.
 * `scheduleXAtPeak`   → marks the draft SCHEDULED for the next 9am ET window
 *                       and writes a ScheduledPost. The X worker auto-publishes
 *                       it via the OAuth integration when the time hits.
 */
import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import { nextXPeakUtc, parseXMeta, type XKind } from "@/shared/x";

const singleSchema = z.object({ tweets: z.array(z.string().max(280)).length(1) });
const threadSchema = z.object({ tweets: z.array(z.string().max(280)).min(2).max(12) });
const replySchema = z.object({ reply: z.string().max(280) });

export async function regenerateXDraft(workspaceId: string, draftId: string) {
  const draft = await prisma.contentDraft.findFirst({
    where: { id: draftId, workspaceId, channel: "X" },
  });
  if (!draft) return { ok: false as const, error: "Draft not found" };

  const meta = parseXMeta(draft.meta);
  const xKind: XKind = meta?.xKind ?? "single";
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
    `Tone: ${voice?.tone || "professional but conversational"}`,
    voice?.positioning && `Positioning: ${voice.positioning}`,
  ]
    .filter(Boolean)
    .join("\n");

  if (xKind === "reply") {
    const prompt = [
      baseCtx,
      "",
      `You are replying to @${meta?.parentAuthor ?? "user"}:`,
      `> ${meta?.parentText?.slice(0, 500) ?? draft.body}`,
      "",
      "Write ONE reply tweet (≤280 chars). Be specific and useful — no self-promo.",
    ].join("\n");
    const { object } = await meteredGenerateObject(prompt, replySchema, {
      workspaceId,
      reason: "x.regenerate.reply",
      model,
    });
    await prisma.contentDraft.update({
      where: { id: draftId },
      data: {
        body: object.reply,
        meta: { ...(draft.meta as Record<string, unknown>), tweets: [object.reply] },
      },
    });
    return { ok: true as const, body: object.reply };
  }

  if (xKind === "thread") {
    const prompt = [
      baseCtx,
      "",
      `Current draft (rewrite, keep core idea):\n${draft.body.slice(0, 1500)}`,
      "",
      "Output a 4–7 tweet thread. Each tweet ≤280 chars. Tweet 1 is the hook.",
    ].join("\n");
    const { object } = await meteredGenerateObject(prompt, threadSchema, {
      workspaceId,
      reason: "x.regenerate.thread",
      model,
    });
    const body = object.tweets.map((t, i) => `${i + 1}/ ${t}`).join("\n\n");
    await prisma.contentDraft.update({
      where: { id: draftId },
      data: {
        body,
        meta: {
          ...(draft.meta as Record<string, unknown>),
          tweets: object.tweets,
          mode: "thread",
        },
      },
    });
    return { ok: true as const, body, tweets: object.tweets };
  }

  // single
  const prompt = [
    baseCtx,
    "",
    `Current tweet (rewrite, keep core idea):\n${draft.body.slice(0, 280)}`,
    "",
    "Output ONE tweet (≤280 chars). Punchy, opinionated, useful.",
  ].join("\n");
  const { object } = await meteredGenerateObject(prompt, singleSchema, {
    workspaceId,
    reason: "x.regenerate.single",
    model,
  });
  await prisma.contentDraft.update({
    where: { id: draftId },
    data: {
      body: object.tweets[0],
      meta: {
        ...(draft.meta as Record<string, unknown>),
        tweets: object.tweets,
        mode: "single",
      },
    },
  });
  return { ok: true as const, body: object.tweets[0] };
}

export async function scheduleXAtPeak(workspaceId: string, draftId: string) {
  const draft = await prisma.contentDraft.findFirst({
    where: { id: draftId, workspaceId, channel: "X" },
  });
  if (!draft) return { ok: false as const, error: "Draft not found" };

  const scheduledAt = nextXPeakUtc();

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
          data: { scheduledAt, status: "pending", processedAt: null, error: null },
        })
      : prisma.scheduledPost.create({
          data: {
            workspaceId,
            draftId,
            channel: "X",
            scheduledAt,
            status: "pending",
          },
        }),
  ]);

  return { ok: true as const, scheduledAt: scheduledAt.toISOString() };
}
