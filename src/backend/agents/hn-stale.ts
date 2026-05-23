import { prisma } from "@/backend/db";
import { parseHnMeta } from "@/shared/hn";

/** Reject pending Show/Ask HN drafts tied to a different website URL. */
export async function invalidateStaleHNDrafts(
  workspaceId: string,
  websiteUrl: string | null
): Promise<number> {
  const normalized = (websiteUrl ?? "").replace(/\/$/, "").toLowerCase();

  const pending = await prisma.contentDraft.findMany({
    where: {
      workspaceId,
      agent: "hn",
      channel: "HACKER_NEWS",
      status: { in: ["DRAFT", "PENDING_APPROVAL", "SCHEDULED"] },
    },
    select: { id: true, meta: true },
  });

  let count = 0;
  for (const d of pending) {
    const meta = d.meta as Record<string, unknown> | null;
    const kind = parseHnMeta(meta)?.hnKind;
    if (kind !== "show_hn" && kind !== "ask_hn") continue;

    const source = String(meta?.sourceWebsiteUrl ?? "")
      .replace(/\/$/, "")
      .toLowerCase();
    if (source && source === normalized) continue;
    if (!source && !normalized) continue;

    await prisma.contentDraft.update({
      where: { id: d.id },
      data: { status: "REJECTED" },
    });
    count++;
  }
  return count;
}

export function hnDraftSourceMeta(websiteUrl: string | null) {
  return { sourceWebsiteUrl: websiteUrl ?? "" };
}
