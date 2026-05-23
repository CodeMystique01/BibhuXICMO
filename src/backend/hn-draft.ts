import { z } from "zod";
import { prisma } from "@/backend/db";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";
import { parseHnMeta, type HNKind } from "@/shared/hn";

const titleSchema = z.object({ title: z.string() });
const bodySchema = z.object({ body: z.string() });
const fullSchema = z.object({
  title: z.string(),
  body: z.string(),
});

export async function regenerateHNDraft(
  workspaceId: string,
  draftId: string,
  part: "title" | "body" | "full"
) {
  const draft = await prisma.contentDraft.findFirst({
    where: { id: draftId, workspaceId, channel: "HACKER_NEWS" },
  });
  if (!draft) return { ok: false as const, error: "Draft not found" };

  const meta = parseHnMeta(draft.meta);
  const hnKind = meta?.hnKind ?? "comment";
  const model = pickAvailableModel("gpt-4o-mini");
  if (!model) return { ok: false as const, error: "No LLM configured" };

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });
  const voice = workspace?.voiceProfile as { positioning?: string } | null;

  const context = [
    `Kind: ${hnKind}`,
    `Current title: ${draft.title ?? ""}`,
    `Current body: ${draft.body.slice(0, 2000)}`,
    `Positioning: ${voice?.positioning || workspace?.industry || "unknown"}`,
    meta?.itemUrl && `Thread: ${meta.itemUrl}`,
    meta?.postUrl && `Product URL: ${meta.postUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  if (part === "title") {
    const { object } = await meteredGenerateObject(
      `${context}\n\nRewrite ONLY the title. ${hnKind === "show_hn" ? "Must start with Show HN:" : hnKind === "ask_hn" ? "Must start with Ask HN:" : "Keep it concise."}`,
      titleSchema,
      { workspaceId, reason: "hn.regenerate.title", model }
    );
    await prisma.contentDraft.update({
      where: { id: draftId },
      data: { title: object.title },
    });
    return { ok: true as const, title: object.title };
  }

  if (part === "body") {
    const { object } = await meteredGenerateObject(
      `${context}\n\nRewrite ONLY the body. HN-native: direct, technical, no hype.`,
      bodySchema,
      { workspaceId, reason: "hn.regenerate.body", model }
    );
    await prisma.contentDraft.update({
      where: { id: draftId },
      data: { body: object.body },
    });
    return { ok: true as const, body: object.body };
  }

  const { object } = await meteredGenerateObject(
    `${context}\n\nRewrite title and body. ${kindPrefix(hnKind)}`,
    fullSchema,
    { workspaceId, reason: "hn.regenerate.full", model }
  );
  await prisma.contentDraft.update({
    where: { id: draftId },
    data: { title: object.title, body: object.body },
  });
  return { ok: true as const, title: object.title, body: object.body };
}

function kindPrefix(kind: HNKind): string {
  if (kind === "show_hn") return "Title must start with Show HN:";
  if (kind === "ask_hn") return "Title must start with Ask HN:";
  return "Comment on an existing thread — add value, no self-promo.";
}

export async function scheduleHNDraftAtPeak(workspaceId: string, draftId: string) {
  const { nextHNPeakUtc } = await import("@/shared/hn");
  const draft = await prisma.contentDraft.findFirst({
    where: { id: draftId, workspaceId, channel: "HACKER_NEWS" },
  });
  if (!draft) return { ok: false as const, error: "Draft not found" };

  const scheduledAt = nextHNPeakUtc();

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
            channel: "HACKER_NEWS",
            scheduledAt,
            status: "pending",
          },
        }),
  ]);

  return { ok: true as const, scheduledAt: scheduledAt.toISOString() };
}
