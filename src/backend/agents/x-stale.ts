import { prisma } from "@/backend/db";
import { parseXMeta, type XKind } from "@/shared/x";

function normalizeSiteUrl(url: string | null | undefined): string {
  return (url ?? "").replace(/\/$/, "").toLowerCase();
}

/** Identify any X draft kind from meta or fall back to mode hints. */
export function getXKind(meta: unknown): XKind | null {
  return parseXMeta(meta)?.xKind ?? null;
}

/** Reply drafts are tied to a specific tweet, not the workspace's site — keep them. */
export function isSitePostDraft(meta: unknown): boolean {
  const k = getXKind(meta);
  return k === "single" || k === "thread";
}

/**
 * Reject pending Single / Thread drafts for a different site (or legacy drafts
 * without a `sourceWebsiteUrl` tag) when the workspace's website changes.
 * Reply drafts are left alone — their context is the tweet they reply to.
 */
export async function invalidateStaleXDrafts(
  workspaceId: string,
  websiteUrl: string | null
): Promise<number> {
  const normalized = normalizeSiteUrl(websiteUrl);

  const pending = await prisma.contentDraft.findMany({
    where: {
      workspaceId,
      agent: "x",
      channel: "X",
      status: { in: ["DRAFT", "PENDING_APPROVAL", "SCHEDULED"] },
    },
    select: { id: true, meta: true },
  });

  let count = 0;
  for (const d of pending) {
    if (!isSitePostDraft(d.meta)) continue;

    const source = normalizeSiteUrl(
      String((d.meta as Record<string, unknown> | null)?.sourceWebsiteUrl ?? "")
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

export function xDraftSourceMeta(websiteUrl: string | null) {
  return { sourceWebsiteUrl: normalizeSiteUrl(websiteUrl) || (websiteUrl ?? "") };
}

export function postDraftMatchesSite(
  meta: unknown,
  websiteUrl: string | null
): boolean {
  if (!isSitePostDraft(meta)) return false;
  const siteKey = normalizeSiteUrl(websiteUrl);
  if (!siteKey) return false;

  const source = normalizeSiteUrl(
    String((meta as Record<string, unknown> | null)?.sourceWebsiteUrl ?? "")
  );
  if (!source) return false;
  return source === siteKey;
}
