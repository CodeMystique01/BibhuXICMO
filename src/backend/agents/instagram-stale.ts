import { prisma } from "@/backend/db";
import { isIGContentKind, parseIgMeta, type IGKind } from "@/shared/instagram";

function normalizeSiteUrl(url: string | null | undefined): string {
  return (url ?? "").replace(/\/$/, "").toLowerCase();
}

export function getIGKind(meta: unknown): IGKind | null {
  return parseIgMeta(meta)?.igKind ?? null;
}

/**
 * Reject pending Post / Reel / Story drafts that were generated for a
 * different `websiteUrl`. DM drafts and comment_reply drafts are tied to
 * external recipients / specific posts, so we leave them alone.
 */
export async function invalidateStaleIGDrafts(
  workspaceId: string,
  websiteUrl: string | null
): Promise<number> {
  const normalized = normalizeSiteUrl(websiteUrl);

  const pending = await prisma.contentDraft.findMany({
    where: {
      workspaceId,
      agent: "instagram",
      channel: "INSTAGRAM",
      status: { in: ["DRAFT", "PENDING_APPROVAL", "SCHEDULED"] },
    },
    select: { id: true, meta: true },
  });

  let count = 0;
  for (const d of pending) {
    const kind = getIGKind(d.meta);
    if (!kind || !isIGContentKind(kind)) continue;

    const source = normalizeSiteUrl(
      String(
        (d.meta as Record<string, unknown> | null)?.sourceWebsiteUrl ?? ""
      )
    );

    const isCurrentSite = source && source === normalized;
    if (isCurrentSite) continue;

    await prisma.contentDraft.update({
      where: { id: d.id },
      data: { status: "REJECTED" },
    });
    count++;
  }
  return count;
}

export function igDraftSourceMeta(websiteUrl: string | null) {
  return { sourceWebsiteUrl: normalizeSiteUrl(websiteUrl) || (websiteUrl ?? "") };
}

export function igPostDraftMatchesSite(
  meta: unknown,
  websiteUrl: string | null
): boolean {
  const kind = getIGKind(meta);
  if (!kind || !isIGContentKind(kind)) return false;
  const siteKey = normalizeSiteUrl(websiteUrl);
  if (!siteKey) return false;

  const source = normalizeSiteUrl(
    String((meta as Record<string, unknown> | null)?.sourceWebsiteUrl ?? "")
  );
  if (!source) return false;
  return source === siteKey;
}
